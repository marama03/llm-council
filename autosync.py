#!/usr/bin/env python3
"""
autosync.py — Automatic sandbox → GitHub sync watcher.

Polls `git status --porcelain` for changes in /home/user/webapp, debounces
for a quiescence window, then auto-commits and pushes to the configured branch.

Design:
  - Pure stdlib (no inotifywait / watchdog dependency).
  - Debounce: wait DEBOUNCE_SECONDS of no new changes before committing.
  - Excludes nothing manually — .gitignore already covers data/, node_modules,
    __pycache__, .env, frontend/dist/. git status --porcelain respects that.
  - Cooldown: never commit more than once every MIN_COMMIT_INTERVAL seconds.
  - Logs every action to autosync.log (which is itself gitignored).
  - Handles Vite/IDE churn gracefully (debounce absorbs bursts).

Usage:
  python3 autosync.py                # foreground
  python3 autosync.py --once         # single sync then exit
  python3 autosync.py --interval 5   # custom poll interval (seconds)
  nohup python3 autosync.py &        # background
"""

import argparse
import subprocess
import time
import sys
import os
from datetime import datetime
from pathlib import Path

# ----------------------------------------------------------------------------
# Configuration
# ----------------------------------------------------------------------------
REPO_DIR = Path("/home/user/webapp")
BRANCH = os.environ.get("AUTOSYNC_BRANCH", "genspark_ai_developer")
REMOTE = os.environ.get("AUTOSYNC_REMOTE", "origin")
POLL_INTERVAL = 5          # seconds between status checks
DEBOUNCE_SECONDS = 8       # quiescence window before committing
MIN_COMMIT_INTERVAL = 20   # never auto-commit more often than this
MAX_RETRIES = 3            # push retry attempts
LOG_PATH = REPO_DIR / "autosync.log"


def log(msg: str) -> None:
    """Timestamped log line to stdout + autosync.log."""
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass  # never let logging crash the watcher


def run_git(args, capture=True, check=True):
    """Run a git command inside REPO_DIR. Returns CompletedProcess."""
    cmd = ["git", "-C", str(REPO_DIR)] + args
    return subprocess.run(
        cmd,
        capture_output=capture,
        text=True,
        check=check,
    )


def get_changed_files() -> list[str]:
    """Return list of changed tracked-or-untracked files (porcelain v1)."""
    try:
        r = run_git(["status", "--porcelain"])
        return [line[3:] for line in r.stdout.splitlines() if line.strip()]
    except subprocess.CalledProcessError:
        return []


def generate_commit_message(files: list[str]) -> str:
    """Auto-generate a conventional-commit-ish message from the file list."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    # classify by dominant path
    if any(f.startswith("frontend/src") for f in files):
        scope = "ui"
    elif any(f.startswith("backend/") for f in files):
        scope = "backend"
    elif any(f.startswith("frontend/") for f in files):
        scope = "frontend"
    else:
        scope = "sandbox"
    summary = f"auto: sync {scope} changes ({now})"
    body_lines = ["", "Files changed:"]
    for f in files[:20]:  # cap body at 20 files
        body_lines.append(f"  - {f}")
    if len(files) > 20:
        body_lines.append(f"  ... and {len(files) - 20} more")
    return summary + "\n" + "\n".join(body_lines)


def commit_and_push(files: list[str]) -> bool:
    """Stage all, commit with generated message, push to remote branch."""
    log(f"Committing {len(files)} changed file(s)...")
    try:
        run_git(["add", "-A"])
        msg = generate_commit_message(files)
        run_git(["commit", "-m", msg])
        log(f"Committed: {msg.splitlines()[0]}")
    except subprocess.CalledProcessError as e:
        log(f"ERROR: commit failed: {e.stderr or e.stdout}")
        return False

    # push with retries
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            r = run_git(["push", REMOTE, BRANCH], check=False)
            if r.returncode == 0:
                log(f"Pushed to {REMOTE}/{BRANCH} (attempt {attempt}).")
                return True
            log(f"Push attempt {attempt} failed: {r.stderr.strip()}")
            time.sleep(3 * attempt)
        except Exception as e:
            log(f"Push attempt {attempt} exception: {e}")
            time.sleep(3 * attempt)
    log("ERROR: all push attempts failed.")
    return False


def sync_once() -> bool:
    """Single sync cycle. Returns True if a commit+push happened."""
    files = get_changed_files()
    if not files:
        return False
    log(f"Detected {len(files)} change(s): {', '.join(files[:5])}"
        + (f" ...+{len(files)-5} more" if len(files) > 5 else ""))
    return commit_and_push(files)


def watch_loop(interval: int) -> None:
    """Main polling loop with debounce + cooldown."""
    log(f"autosync watcher started — repo={REPO_DIR} branch={BRANCH} "
        f"poll={interval}s debounce={DEBOUNCE_SECONDS}s "
        f"cooldown={MIN_COMMIT_INTERVAL}s")
    last_commit_time = 0.0
    pending: set[str] = set()
    last_change_time = 0.0

    while True:
        try:
            current = set(get_changed_files())
            if current:
                # new churn — reset debounce clock, accumulate pending set
                if current != pending:
                    pending = current
                    last_change_time = time.time()
                    log(f"Activity detected ({len(current)} file(s)). "
                        f"Debouncing...")
            elif pending:
                # quiescent — check debounce window
                quiet_for = time.time() - last_change_time
                if quiet_for >= DEBOUNCE_SECONDS:
                    cooled = (time.time() - last_commit_time) >= MIN_COMMIT_INTERVAL
                    if cooled:
                        files = sorted(pending)
                        log(f"Quiescent {quiet_for:.1f}s — syncing {len(files)} file(s).")
                        if commit_and_push(files):
                            last_commit_time = time.time()
                        pending.clear()
                        last_change_time = 0.0
                    else:
                        remaining = MIN_COMMIT_INTERVAL - (time.time() - last_commit_time)
                        log(f"Quiescent but cooldown active ({remaining:.0f}s remaining).")
                        pending.clear()  # will re-detect next cycle if still dirty
        except KeyboardInterrupt:
            log("Watcher stopped by user (KeyboardInterrupt).")
            break
        except Exception as e:
            log(f"ERROR in watch loop: {e!r}")

        time.sleep(interval)


def main():
    parser = argparse.ArgumentParser(description="Sandbox → GitHub auto-sync watcher")
    parser.add_argument("--once", action="store_true",
                        help="Run a single sync cycle and exit")
    parser.add_argument("--interval", type=int, default=POLL_INTERVAL,
                        help=f"Poll interval in seconds (default {POLL_INTERVAL})")
    args = parser.parse_args()

    if not (REPO_DIR / ".git").is_dir():
        print(f"ERROR: {REPO_DIR} is not a git repository.", file=sys.stderr)
        sys.exit(1)

    if args.once:
        synced = sync_once()
        log(f"--once cycle complete. Synced: {synced}")
        sys.exit(0 if synced else 0)

    watch_loop(args.interval)


if __name__ == "__main__":
    main()
