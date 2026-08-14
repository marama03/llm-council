"""Resolve local file paths mentioned in a board question into text attachments.

WHY THIS EXISTS. It is natural to ask the board about a document by pointing at it: "should we do X
or Y, see the spec at /path/to/spec.md". The backend has no filesystem tool, so it used to pass that
path through as a literal string and convene anyway. No model could open it. Several then described
the document's contents as though they had, inventing architecture details wholesale, and the board
returned a confident verdict on a file it never saw. Nothing in the system said so.

The defect was not the missing capability. It was the SILENCE. So this module does two things, in
order of importance:

  1. Never proceed silently. A referenced path that cannot be read is a hard stop: the endpoint
     emits an SSE `error` and the board does not convene. A confident answer built on invented
     facts, with nothing flagging it, is worse than no answer.
  2. Read it when that is safe. The backend runs locally, so it can open the file and inline it as
     a text attachment, which the boardroom already supports.

SECURITY. This backend may be reachable beyond localhost. Auto-opening any absolute path a question
mentions would turn "ask the board a question" into an arbitrary file read, so resolution is fenced:

  * the resolved real path must sit under an allow-listed root, checked AFTER symlink resolution so
    `..` and junctions cannot escape,
  * the extension must be a text format we are willing to inline,
  * the filename must not look like a credential store,
  * per-file and total size are capped.

Anything failing those checks is refused by NAME ONLY. The reason is reported; the contents are not.

Roots default to the project tree plus the user's Desktop and Documents. Override with
COUNCIL_FILE_ROOTS (os.pathsep-separated) to widen or, more usefully, to narrow them.
"""

import os
import re
from pathlib import Path
from typing import Any, Dict, List, Tuple

# Text formats worth inlining into a prompt. Deliberately excludes anything binary.
ALLOWED_SUFFIXES = {".md", ".txt", ".csv", ".tsv", ".yml", ".yaml", ".log", ".json"}

# Filenames that hold credentials. Refused even inside an allowed root, because "the operator asked"
# is not the same as "the operator meant to paste their vault into five third-party models".
DENY_NAME = re.compile(
    r"(^|[._-])(secrets?|credentials?|api[-_]?keys?|tenants|telegram|instance|update-channel|"
    r"providers|\.env|id_rsa|id_ed25519)([._-]|$)|\.(pem|key|pfx|p12)$",
    re.IGNORECASE,
)

MAX_FILE_BYTES = 400_000      # the spec this was built for is ~44KB; 400KB is generous headroom
MAX_TOTAL_BYTES = 800_000     # keeps a multi-file question inside model context limits

# Anchored on a known text extension, non-greedy, so the match stops cleanly at the suffix. That
# matters twice over. A path is usually named mid-sentence and followed by a period
# ("...see spec.md. In the end, I want..."), which a greedy match would swallow.
#
# And Windows paths MUST be allowed to contain spaces. The path that first exercised this lived
# under a folder with a space in its name, and a space-free pattern matched nothing at all, which
# would have reproduced the original silent-failure bug inside its own fix. Spaces are therefore
# permitted for the drive and UNC forms, bounded by the characters Windows forbids in a filename
# and by end-of-line. The POSIX form stays space-free on purpose: "/" is far too common in ordinary
# prose to allow a greedy run across it.
_EXT = "|".join(s.lstrip(".") for s in sorted(ALLOWED_SUFFIXES))
_WIN_BODY = r"[^\"'<>|?*\r\n]*?"
_POSIX_BODY = r"[^\s\"'<>|?*]*?"
PATH_RE = re.compile(
    r"(?:"
    r"[A-Za-z]:[\\/]" + _WIN_BODY +          # C:\...
    r"|\\\\[^\\/\r\n]+[\\/]" + _WIN_BODY +  # \\server\share\...
    r"|/" + _POSIX_BODY +                   # /usr/...
    r")\.(?:" + _EXT + r")\b",
    re.IGNORECASE,
)


def allowed_roots() -> List[Path]:
    """Roots a question may read from. COUNCIL_FILE_ROOTS (os.pathsep-separated) overrides."""
    env = os.environ.get("COUNCIL_FILE_ROOTS", "").strip()
    if env:
        roots = [Path(p).expanduser() for p in env.split(os.pathsep) if p.strip()]
    else:
        # backend/ -> app root -> its parent: the project tree, plus the user's own documents.
        project = Path(__file__).resolve().parent.parent.parent
        home = Path.home()
        roots = [project, home / "Desktop", home / "Documents"]
    out = []
    for r in roots:
        try:
            out.append(r.resolve(strict=False))
        except OSError:
            continue
    return out


def _under_allowed_root(real: Path, roots: List[Path]) -> bool:
    for root in roots:
        try:
            real.relative_to(root)
            return True
        except ValueError:
            continue
    return False


def find_paths(question: str) -> List[str]:
    """Every local file path mentioned in the question, in order, de-duplicated."""
    seen, out = set(), []
    for m in PATH_RE.finditer(question or ""):
        p = m.group(0)
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out


def resolve_paths(question: str) -> Tuple[List[Dict[str, Any]], List[str], List[str]]:
    """Turn any paths in the question into text attachments.

    Returns (attachments, notices, errors).
      attachments - boardroom-shaped {type:'text', name, text} entries, ready to prepend
      notices     - human-readable lines describing what was inlined (for the UI/log)
      errors      - one line per path that could NOT be read, with the reason

    A non-empty `errors` means the caller MUST NOT convene. That is the whole point.
    """
    paths = find_paths(question)
    if not paths:
        return [], [], []

    roots = allowed_roots()
    attachments: List[Dict[str, Any]] = []
    notices: List[str] = []
    errors: List[str] = []
    total = 0

    for raw in paths:
        name = os.path.basename(raw.replace("\\", "/")) or raw
        try:
            real = Path(raw).expanduser().resolve(strict=True)
        except (OSError, RuntimeError):
            errors.append(f"{name}: no such file on this machine ({raw})")
            continue

        if not real.is_file():
            errors.append(f"{name}: not a file")
            continue
        if DENY_NAME.search(real.name):
            errors.append(f"{name}: refused, this looks like a credential file")
            continue
        if real.suffix.lower() not in ALLOWED_SUFFIXES:
            errors.append(f"{name}: refused, {real.suffix or 'no'} is not an inlinable text format")
            continue
        if not _under_allowed_root(real, roots):
            errors.append(f"{name}: refused, outside the folders the council may read")
            continue

        try:
            size = real.stat().st_size
        except OSError as e:
            errors.append(f"{name}: cannot stat ({e.__class__.__name__})")
            continue
        if size > MAX_FILE_BYTES:
            errors.append(f"{name}: {size // 1024}KB exceeds the {MAX_FILE_BYTES // 1024}KB per-file cap")
            continue
        if total + size > MAX_TOTAL_BYTES:
            errors.append(f"{name}: skipped, total attachment size would exceed {MAX_TOTAL_BYTES // 1024}KB")
            continue

        try:
            # utf-8 explicitly: Windows defaults to cp1252 and corrupts anything non-ASCII.
            text = real.read_text(encoding="utf-8", errors="replace")
        except OSError as e:
            errors.append(f"{name}: cannot read ({e.__class__.__name__})")
            continue

        total += size
        attachments.append({"type": "text", "name": real.name, "text": text, "data_url": ""})
        notices.append(f"{real.name} ({size // 1024}KB) was read from disk and given to the board in full")

    return attachments, notices, errors
