"""Boardroom orchestration - the 4-stage Board of Directors flow.

Stages:
  1. Blind opening statements  - each seat writes its position independently,
                                  without seeing the other directors' takes.
  2. Cross-examination          - each seat reads everyone's opening and
                                  challenges the others (lawyer-style).
  3. Revised positions          - each seat may revise its stance in light of
                                  the cross-examination.
  4. Chairman consensus         - the Chairman synthesizes a consensus with a
                                  confidence score, an approve/reject decision,
                                  a recommendation, and next steps.

Follow-up turns reuse the same board but skip the blind-openings stage:
each director answers the new question with the prior transcript in context,
and the Chairman re-synthesizes a consensus.
"""

import asyncio
import json
import re
from typing import List, Dict, Any, Tuple, Optional

from .openrouter import query_model, query_models_parallel
from .board_config import get_counsel_type, get_model_meta


# ----------------------------------------------------------------------------
# Prompt construction helpers
# ----------------------------------------------------------------------------

def _seat_system_prompt(seat: dict, counsel: dict) -> str:
    """System prompt that assigns a seat its role/persona and rubric."""
    persona = seat.get("persona", "")
    role = seat.get("role", "Director")
    focus = seat.get("focus", "")
    rubric = seat.get("rubric", "")
    focus_line = f" Your particular lens on every question is: {focus}." if focus else ""
    rubric_block = f"\n\nYour scoring rubric — you MUST address each point explicitly before your conclusion:\n{rubric}" if rubric else ""
    return (
        f"{persona}{focus_line}{rubric_block}\n\n"
        f"You are '{role}' at this board table. Stay in character. Be concrete, "
        f"be brief, and be willing to disagree. Do not hedge for the sake of "
        f"politeness - the board needs your real view, not a committee answer."
    )


def _chairman_system_prompt(counsel: dict) -> str:
    """System prompt for the Chairman."""
    persona = counsel.get("chairman_persona", "")
    return (
        f"{persona}\n\n"
        f"You are the Chairman of the Board. After the directors have written "
        f"blind opening statements, cross-examined one another, and revised "
        f"their positions, you must deliver a single consensus the board can "
        f"act on. You are not a voter - you are a synthesizer. You may overrule "
        f"a majority if the majority is wrong, but you must say so plainly."
    )


def _render_openings_for_cross(openings: List[Dict[str, Any]]) -> str:
    """Render the collected opening statements so any seat can read them all.

    For cross-examination we DO show each director's name/role next to their
    statement - the point of the cross-exam round is that everyone now sees
    everyone else's take and can challenge specific people.
    """
    lines = []
    for o in openings:
        role = o.get("role", "Director")
        model_name = get_model_meta(o.get("model", ""))["name"]
        lines.append(f"=== {role} (brain: {model_name}) ===\n{o.get('opening', '')}")
    return "\n\n".join(lines)


def _render_cross_for_revision(cross: List[Dict[str, Any]]) -> str:
    """Render the cross-examination transcript for the revision round."""
    lines = []
    for c in cross:
        role = c.get("role", "Director")
        lines.append(f"=== {role} cross-examining the table ===\n{c.get('cross', '')}")
    return "\n\n".join(lines)


def _render_revisions_for_chair(revisions: List[Dict[str, Any]]) -> str:
    """Render the revised positions for the chairman."""
    lines = []
    for r in revisions:
        role = r.get("role", "Director")
        stance = r.get("revised_stance", "unchanged")
        lines.append(
            f"=== {role} (revised stance: {stance}) ===\n{r.get('revision', '')}"
        )
    return "\n\n".join(lines)


# ----------------------------------------------------------------------------
# Attachment helpers
# ----------------------------------------------------------------------------

def _build_user_content(
    question_text: str,
    attachments: Optional[List[Dict[str, Any]]] = None,
) -> Any:
    """Build the user message content, optionally including image attachments.

    - If there are no attachments → returns a plain string (maximum model compat).
    - If there are image attachments → returns an OpenAI-compatible content array
      with text parts and image_url parts (vision format).
    - Text/file attachments have their text prepended to the question string.
    """
    if not attachments:
        return question_text

    # Separate images from text files
    image_attachments = [a for a in attachments if a.get("type") == "image" and a.get("data_url")]
    text_attachments = [a for a in attachments if a.get("type") == "text" and a.get("text")]

    # Prepend extracted text from text-file attachments to the question
    combined_text = question_text
    for ta in text_attachments:
        name = ta.get("name", "file")
        combined_text = (
            f"[Attached file: {name}]\n\n{ta['text']}\n\n---\n\n{combined_text}"
        )

    if not image_attachments:
        return combined_text

    # Vision format: content array
    parts: List[Dict[str, Any]] = [
        {"type": "text", "text": combined_text}
    ]
    for img in image_attachments:
        parts.append({
            "type": "image_url",
            "image_url": {"url": img["data_url"]},
        })
    return parts


# ----------------------------------------------------------------------------
# Stage 1 - blind opening statements
# ----------------------------------------------------------------------------

async def stage1_blind_openings(
    question: str,
    board: dict,
    counsel: dict,
    attachments: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """Each seat writes an opening statement independently.

    Returns a list (one entry per seat, in seat order) of:
        {seat, role, model, opening}
    """
    seats = board["seats"]
    user_prompt_text = (
        f"The board has been convened to answer this question:\n\n"
        f"\"\"\"\n{question}\n\"\"\"\n\n"
        f"Write your opening statement as your role. Take a clear position. "
        f"Do not ask the board for more information - make your assumptions "
        f"explicit and give your real recommendation. Keep it to a few tight "
        f"paragraphs. Do not mention that you are an AI or a language model."
    )
    user_content = _build_user_content(user_prompt_text, attachments)

    # Fire all seats in parallel - genuinely blind, no shared context.
    tasks = []
    for seat in seats:
        messages = [
            {"role": "system", "content": _seat_system_prompt(seat, counsel)},
            {"role": "user", "content": user_content},
        ]
        tasks.append(query_model(seat["model"], messages))

    raw_responses = await _gather(tasks)

    results = []
    for seat, resp in zip(seats, raw_responses):
        content = (resp or {}).get("content") if resp else None
        results.append({
            "seat": seat["seat"],
            "role": seat["role"],
            "focus": seat.get("focus", ""),
            "model": seat["model"],
            "opening": content or _failed_placeholder(seat),
            "failed": content is None,
        })
    return results


# ----------------------------------------------------------------------------
# Stage 2 - cross-examination
# ----------------------------------------------------------------------------

async def stage2_cross_examination(
    question: str,
    openings: List[Dict[str, Any]],
    board: dict,
    counsel: dict,
) -> List[Dict[str, Any]]:
    """Each seat reads all openings and cross-examines the other directors.

    Returns a list (one entry per seat) of:
        {seat, role, model, cross, challenges: [{role, point}]}
    """
    seats = board["seats"]
    transcript = _render_openings_for_cross(openings)

    user_prompt = (
        f"The board was asked:\n\n\"\"\"\n{question}\n\"\"\"\n\n"
        f"Here are every director's blind opening statements:\n\n"
        f"{transcript}\n\n"
        f"Now cross-examine the table. As your role, challenge the directors "
        f"whose arguments are weak, unsupported, or contradictory. Cite the "
        f"director by role. Be direct - this is the lawyer-round. Then state "
        f"the single strongest counter-argument against your OWN opening. "
        f"Keep it tight. Do not restate what others said - challenge it."
    )

    tasks = []
    for seat in seats:
        messages = [
            {"role": "system", "content": _seat_system_prompt(seat, counsel)},
            {"role": "user", "content": user_prompt},
        ]
        tasks.append(query_model(seat["model"], messages))

    raw_responses = await _gather(tasks)

    results = []
    for seat, resp in zip(seats, raw_responses):
        content = (resp or {}).get("content") if resp else None
        text = content or _failed_placeholder(seat)
        results.append({
            "seat": seat["seat"],
            "role": seat["role"],
            "model": seat["model"],
            "cross": text,
            "challenges": _parse_challenges(text),
            "failed": content is None,
        })
    return results


# ----------------------------------------------------------------------------
# Stage 3 - revised positions
# ----------------------------------------------------------------------------

async def stage3_revised_positions(
    question: str,
    openings: List[Dict[str, Any]],
    cross: List[Dict[str, Any]],
    board: dict,
    counsel: dict,
) -> List[Dict[str, Any]]:
    """Each seat may revise its stance after being cross-examined.

    Returns a list (one entry per seat) of:
        {seat, role, model, revised_stance, revision}
    """
    seats = board["seats"]
    cross_transcript = _render_cross_for_revision(cross)

    # Each seat sees its own opening + everyone's cross-exam.
    openings_by_role = {o["role"]: o["opening"] for o in openings}

    tasks = []
    for seat in seats:
        my_opening = openings_by_role.get(seat["role"], "")
        user_prompt = (
            f"The board was asked:\n\n\"\"\"\n{question}\n\"\"\"\n\n"
            f"Your original opening statement was:\n\n{my_opening}\n\n"
            f"Here is the full cross-examination transcript:\n\n"
            f"{cross_transcript}\n\n"
            f"Now decide your final position. You may stand firm, concede a "
            f"point, or change your recommendation entirely - but you must say "
            f"which and why. Start your reply with EXACTLY one of these labels "
            f"on its own first line:\n"
            f"  STANCE: STRONGER\n"
            f"  STANCE: UNCHANGED\n"
            f"  STANCE: CONCEDED\n"
            f"  STANCE: FLIPPED\n"
            f"Then write a few tight paragraphs giving your final position and "
            f"what changed your mind (if anything)."
        )
        messages = [
            {"role": "system", "content": _seat_system_prompt(seat, counsel)},
            {"role": "user", "content": user_prompt},
        ]
        tasks.append(query_model(seat["model"], messages))

    raw_responses = await _gather(tasks)

    results = []
    for seat, resp in zip(seats, raw_responses):
        content = (resp or {}).get("content") if resp else None
        text = content or _failed_placeholder(seat)
        stance = _parse_stance(text)
        results.append({
            "seat": seat["seat"],
            "role": seat["role"],
            "model": seat["model"],
            "revised_stance": stance,
            "revision": text,
            "failed": content is None,
        })
    return results


# ----------------------------------------------------------------------------
# Confidence scoring — independent pass, NOT the Chairman (fix self-marking)
# ----------------------------------------------------------------------------

def _detect_split(revisions: List[Dict[str, Any]]) -> dict:
    """Analyse revised stances to detect a meaningful dissent split.

    Returns a dict with:
      split        : True when the board is split 3-vs-2 or worse
      majority     : list of roles on the majority side
      dissenters   : list of roles on the minority side
      split_label  : human-readable e.g. '3-vs-2'
    """
    approving = []
    dissenting = []
    for r in revisions:
        stance = (r.get("revised_stance") or "UNCHANGED").upper()
        # STRONGER / UNCHANGED => held or reinforced their position
        # CONCEDED / FLIPPED   => moved away
        if stance in ("STRONGER", "UNCHANGED"):
            approving.append(r["role"])
        else:
            dissenting.append(r["role"])

    total = len(revisions)
    maj_count = max(len(approving), len(dissenting))
    min_count = min(len(approving), len(dissenting))
    is_split = min_count > 0 and (maj_count - min_count) <= 1  # 3-vs-2 or 2-vs-3

    if len(approving) >= len(dissenting):
        majority, minority = approving, dissenting
    else:
        majority, minority = dissenting, approving

    return {
        "split": is_split,
        "majority": majority,
        "dissenters": minority,
        "split_label": f"{len(majority)}-vs-{len(minority)}" if minority else f"{len(majority)}-vs-0",
    }


async def _score_confidence(
    question: str,
    revisions: List[Dict[str, Any]],
    board: dict,
) -> int:
    """Ask two non-Chair directors to independently score convergence 0-100.

    The Chair does NOT participate in scoring — it only synthesizes.
    We average the two scores to produce a single convergence figure.
    The scorers are the first two seats; they only see the revised positions.
    """
    revisions_text = _render_revisions_for_chair(revisions)
    stances = ", ".join(
        f"{r['role']}: {r.get('revised_stance', 'UNCHANGED')}" for r in revisions
    )

    score_prompt = (
        f"The board was asked:\n\n\"\"\"\n{question}\n\"\"\"\n\n"
        f"Revised stances after deliberation: {stances}\n\n"
        f"Full revised positions:\n{revisions_text}\n\n"
        f"As a neutral observer (not the Chair, not a party to this debate), "
        f"score the board's CONVERGENCE on a scale of 0 to 100, where:\n"
        f"  0  = complete deadlock, no shared ground\n"
        f"  50 = significant dissent but a workable majority\n"
        f" 100 = unanimous, high-conviction agreement\n\n"
        f"Reply with ONLY a single integer between 0 and 100. No explanation."
    )

    # Use the first two director seats as independent scorers
    scorer_seats = board["seats"][:2]
    tasks = [
        query_model(s["model"], [{"role": "user", "content": score_prompt}])
        for s in scorer_seats
    ]
    responses = await _gather(tasks)

    scores = []
    for resp in responses:
        content = ((resp or {}).get("content") or "").strip()
        m = re.search(r"\b(\d{1,3})\b", content)
        if m:
            scores.append(max(0, min(100, int(m.group(1)))))

    if not scores:
        return 70  # sensible fallback
    return round(sum(scores) / len(scores))


# ----------------------------------------------------------------------------
# Stage 4 - chairman consensus
# ----------------------------------------------------------------------------

async def stage4_chairman_consensus(
    question: str,
    openings: List[Dict[str, Any]],
    cross: List[Dict[str, Any]],
    revisions: List[Dict[str, Any]],
    board: dict,
    counsel: dict,
) -> Dict[str, Any]:
    """The Chairman synthesizes a consensus with a structured verdict.

    Confidence is scored by two non-Chair directors BEFORE the Chair
    synthesizes — the Chair never grades its own homework.

    Returns:
        {model, raw, confidence, confidence_scorers, decision, recommendation,
         next_steps, points_of_agreement, points_of_disagreement,
         split_info}
    """
    # -- Independent confidence scoring (non-Chair, runs in parallel with split detect) --
    split_info = _detect_split(revisions)  # sync
    confidence = await _score_confidence(question, revisions, board)  # async, non-Chair

    # -- Build dissent trigger block for Chair prompt --
    dissent_block = ""
    if split_info["split"]:
        dissenter_roles = ", ".join(split_info["dissenters"])
        majority_roles = ", ".join(split_info["majority"])
        dissent_block = (
            f"\n\nIMPORTANT — SPLIT BOARD ({split_info['split_label']}): "
            f"The majority ({majority_roles}) and the minority ({dissenter_roles}) "
            f"did not converge. Because this is a {split_info['split_label']} split, your "
            f"consensus MUST include a TRIGGER CONDITIONS section: name the specific "
            f"evidence or event that would cause you to revisit this decision in favour "
            f"of the dissenters' position. This converts dissent from decoration into "
            f"a decision artifact. The Chair does not ignore a near-half board."
        )

    revisions_text = _render_revisions_for_chair(revisions)
    openings_summary = "\n".join(
        f"- {o['role']}: {_first_line(o['opening'])}" for o in openings
    )
    cross_summary = "\n".join(
        f"- {c['role']}: {_first_line(c['cross'])}" for c in cross
    )

    # Confidence has already been computed externally — Chair just uses it.
    trigger_section = (
        f"TRIGGER CONDITIONS:\n"
        f"<REQUIRED when board is split: the specific evidence or event that would "
        f"cause the board to reverse this decision — tied directly to the "
        f"dissenters' core argument>\n\n"
        if split_info["split"] else ""
    )

    user_prompt = (
        f"The board was convened to answer:\n\n\"\"\"\n{question}\n\"\"\"\n\n"
        f"Blind opening statements (one-liners):\n{openings_summary}\n\n"
        f"Cross-examination (one-liners):\n{cross_summary}\n\n"
        f"FULL REVISED POSITIONS:\n{revisions_text}\n\n"
        f"Board convergence score (independently computed by two directors, "
        f"not by you): {confidence}/100{dissent_block}\n\n"
        f"As Chairman, deliver the board's consensus. Your output MUST follow "
        f"this exact structure with these exact section headers in this order:\n\n"
        f"CONSENSUS:\n<2-4 sentences stating the board's agreed outcome>\n\n"
        f"CONFIDENCE: {confidence}\n\n"
        f"DECISION: <exactly one of: APPROVE, APPROVE WITH CONDITIONS, REJECT, NO CONSENSUS>\n\n"
        f"RECOMMENDATION:\n<3-6 sentences with the concrete recommendation the CEO should act on>\n\n"
        f"NEXT STEPS:\n<3 to 6 concrete next steps as a markdown bullet list, each owned and time-bound>\n\n"
        f"{trigger_section}"
        f"POINTS OF AGREEMENT:\n<markdown bullet list of where the board converged>\n\n"
        f"POINTS OF DISAGREEMENT:\n<markdown bullet list of where the board diverged; name the roles>\n\n"
        f"Write the section headers as PLAIN TEXT exactly as shown — no markdown "
        f"'#' headings, no bold. Do not add any prose outside these sections. "
        f"Do not mention that you are an AI."
    )

    messages = [
        {"role": "system", "content": _chairman_system_prompt(counsel)},
        {"role": "user", "content": user_prompt},
    ]

    resp = await query_model(board["chairman_model"], messages)
    raw = (resp or {}).get("content") if resp else None
    if raw is None:
        return {
            "model": board["chairman_model"],
            "raw": "The Chairman was unable to deliver a consensus. Please reconvene the board.",
            "confidence": confidence,
            "confidence_scorers": [s["model"] for s in board["seats"][:2]],
            "decision": "NO CONSENSUS",
            "recommendation": "",
            "next_steps": [],
            "trigger_conditions": "",
            "points_of_agreement": [],
            "points_of_disagreement": [],
            "split_info": split_info,
            "failed": True,
        }

    parsed = _parse_consensus(raw)
    parsed["model"] = board["chairman_model"]
    parsed["raw"] = raw
    parsed["failed"] = False
    # Confidence is always the independently-scored value, not whatever
    # the Chair wrote — the Chair cannot override its own score.
    parsed["confidence"] = confidence
    parsed["confidence_scorers"] = [s["model"] for s in board["seats"][:2]]
    parsed["split_info"] = split_info
    return parsed


# ----------------------------------------------------------------------------
# Follow-up turn (re-convene the same board with a new question)
# ----------------------------------------------------------------------------

async def followup_turn(
    question: str,
    prior_turns: List[Dict[str, Any]],
    board: dict,
    counsel: dict,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Run a follow-up: each director answers with prior context, then chairman.

    prior_turns is the list of previously completed turns (each a full turn
    dict as stored by board_storage). We build a compact transcript of the
    last turn so the directors and chairman can reason about continuity.

    Returns (director_replies, chairman_consensus).
    """
    seats = board["seats"]
    prior_context = _compact_prior_context(prior_turns)

    user_prompt = (
        f"This is a follow-up question to the board. The board has already "
        f"convened on prior questions; here is a compact record of the most "
        f"recent turn:\n\n{prior_context}\n\n"
        f"New question from the chair:\n\n\"\"\"\n{question}\n\"\"\"\n\n"
        f"As your role, answer this follow-up. Be consistent with your prior "
        f"position unless the new information justifies a change - and if you "
        f"do change, say so. Keep it tight."
    )

    tasks = []
    for seat in seats:
        messages = [
            {"role": "system", "content": _seat_system_prompt(seat, counsel)},
            {"role": "user", "content": user_prompt},
        ]
        tasks.append(query_model(seat["model"], messages))
    raw_responses = await _gather(tasks)

    director_replies = []
    for seat, resp in zip(seats, raw_responses):
        content = (resp or {}).get("content") if resp else None
        text = content or _failed_placeholder(seat)
        director_replies.append({
            "seat": seat["seat"],
            "role": seat["role"],
            "model": seat["model"],
            "reply": text,
            "failed": content is None,
        })

    # Chairman consensus for the follow-up
    # Synthesize fake "revisions" from director replies for split detection + scoring
    reply_revisions = [
        {"role": r["role"], "revised_stance": "UNCHANGED", "revision": r["reply"]}
        for r in director_replies
    ]
    followup_confidence = await _score_confidence(question, reply_revisions, board)

    replies_text = "\n\n".join(
        f"=== {r['role']} ===\n{r['reply']}" for r in director_replies
    )
    chair_prompt = (
        f"The board was reconvened for a follow-up.\n\n"
        f"Prior context:\n{prior_context}\n\n"
        f"New question:\n\n\"\"\"\n{question}\n\"\"\"\n\n"
        f"Directors' replies:\n\n{replies_text}\n\n"
        f"Board convergence score (independently computed, not by you): {followup_confidence}/100\n\n"
        f"Deliver the board's consensus on this follow-up. Be explicit about how "
        f"it updates the prior consensus, if at all. Your output MUST follow "
        f"this exact structure with these exact section headers in this order:\n\n"
        f"CONSENSUS:\n<2-4 sentences stating the board's agreed outcome>\n\n"
        f"CONFIDENCE: {followup_confidence}\n\n"
        f"DECISION: <exactly one of: APPROVE, APPROVE WITH CONDITIONS, REJECT, NO CONSENSUS>\n\n"
        f"RECOMMENDATION:\n<3-6 sentences with the concrete recommendation the CEO should act on>\n\n"
        f"NEXT STEPS:\n<3 to 6 concrete next steps as a markdown bullet list, each owned and time-bound>\n\n"
        f"TRIGGER CONDITIONS:\n<REQUIRED when the directors are split: the specific "
        f"evidence or event that would cause the board to reverse this decision — "
        f"tied to the dissenters' core argument. Omit this section when the board converged.>\n\n"
        f"POINTS OF AGREEMENT:\n<markdown bullet list of where the board converged>\n\n"
        f"POINTS OF DISAGREEMENT:\n<markdown bullet list of where the board diverged; name the roles>\n\n"
        f"Write the section headers as PLAIN TEXT exactly as shown — no markdown "
        f"'#' headings, no bold. Do not add any prose outside these sections. "
        f"Do not mention that you are an AI."
    )
    chair_messages = [
        {"role": "system", "content": _chairman_system_prompt(counsel)},
        {"role": "user", "content": chair_prompt},
    ]
    resp = await query_model(board["chairman_model"], chair_messages)
    raw = (resp or {}).get("content") if resp else None
    if raw is None:
        consensus = {
            "model": board["chairman_model"],
            "raw": "The Chairman was unable to deliver a consensus on the follow-up.",
            "confidence": followup_confidence,
            "confidence_scorers": [s["model"] for s in board["seats"][:2]],
            "decision": "NO CONSENSUS",
            "recommendation": "",
            "next_steps": [],
            "trigger_conditions": "",
            "points_of_agreement": [],
            "points_of_disagreement": [],
            "failed": True,
        }
    else:
        consensus = _parse_consensus(raw)
        consensus["model"] = board["chairman_model"]
        consensus["raw"] = raw
        consensus["failed"] = False
        consensus["confidence"] = followup_confidence
        consensus["confidence_scorers"] = [s["model"] for s in board["seats"][:2]]

    return director_replies, consensus


# ----------------------------------------------------------------------------
# Full convene (the 4 stages in order)
# ----------------------------------------------------------------------------

async def convene_board(
    question: str,
    board: dict,
) -> Dict[str, Any]:
    """Run the full 4-stage convene. Returns a full 'turn' dict."""
    counsel = get_counsel_type(board.get("counsel_type", "general"))

    openings = await stage1_blind_openings(question, board, counsel)
    cross = await stage2_cross_examination(question, openings, board, counsel)
    revisions = await stage3_revised_positions(question, openings, cross, board, counsel)
    consensus = await stage4_chairman_consensus(question, openings, cross, revisions, board, counsel)

    return {
        "question": question,
        "stage1": openings,
        "stage2": cross,
        "stage3": revisions,
        "stage4": consensus,
    }


# ----------------------------------------------------------------------------
# Title generation
# ----------------------------------------------------------------------------

async def generate_board_title(question: str) -> str:
    """Short title for a board session based on its opening question."""
    from .board_config import HOUSEKEEPING_MODEL
    prompt = (
        "Generate a very short title (3-6 words) summarizing this board "
        "question. No quotes, no punctuation at the end.\n\n"
        f"Question: {question}\n\nTitle:"
    )
    resp = await query_model(
        HOUSEKEEPING_MODEL,
        [{"role": "user", "content": prompt}],
        timeout=30.0,
    )
    if resp is None:
        return "Board Session"
    title = (resp.get("content") or "Board Session").strip().strip('"\'')
    return title[:60] + ("..." if len(title) > 60 else "")


# ----------------------------------------------------------------------------
# Parsing helpers
# ----------------------------------------------------------------------------

def _parse_stance(text: str) -> str:
    """Extract the revised stance label from the first lines."""
    m = re.search(r"STANCE\s*:\s*(STRONGER|UNCHANGED|CONCEDED|FLIPPED)", text, re.IGNORECASE)
    if m:
        return m.group(1).upper()
    # Fall back to a heuristic scan of the body
    low = text.lower()
    for label in ("flipped", "conceded", "stronger", "unchanged"):
        if label in low:
            return label.upper()
    return "UNCHANGED"


def _parse_challenges(text: str) -> List[Dict[str, str]]:
    """Best-effort extraction of (role, point) challenges from a cross-exam.

    Looks for lines like '- CEO: ...' or 'CEO — ...' or 'To the CEO: ...'.
    """
    challenges = []
    # Pattern: optional bullet, then a role-ish capitalized phrase (1-4 words),
    # then a separator, then the rest of the line.
    pattern = re.compile(
        r"(?:^|\n)\s*(?:[-*]\s*)?"
        r"(?:To (?:the\s+)?|@)?" 
        r"([A-Z][A-Za-z&/ ]{1,40}?(?:Officer|Director|Lead|Engineer|Strategist|Advocate|Voice|Counsel|Head|Chair)[A-Za-z ]{0,20})"
        r"\s*[:\-—–]\s*(.+)"
    )
    for m in pattern.finditer(text):
        role = m.group(1).strip().rstrip(".")
        point = m.group(2).strip()
        if len(point) > 6:
            challenges.append({"role": role, "point": point[:280]})
    # De-dup by (role, point[:40])
    seen = set()
    deduped = []
    for c in challenges:
        key = (c["role"].lower(), c["point"][:40].lower())
        if key not in seen:
            seen.add(key)
            deduped.append(c)
    return deduped[:12]


_KNOWN_HEADERS = (
    "CONSENSUS", "CONFIDENCE", "DECISION", "RECOMMENDATION",
    "NEXT STEPS", "TRIGGER CONDITIONS", "POINTS OF AGREEMENT", "POINTS OF DISAGREEMENT",
)


def _normalize_chair_headers(raw: str) -> str:
    """Rewrite markdown-decorated section headers to the canonical 'HEADER:' form.

    GLM (and most chat models) drift into '### CONSENSUS' / '### **CONSENSUS**' /
    '**DECISION:** APPROVE' the moment a prompt doesn't restate the exact format —
    which is precisely what happened on follow-up turns (2026-07-19, 'Cockpit
    pricing' board): the Chair delivered a full consensus, the parser matched
    nothing, and the UI showed an empty card with a default NO CONSENSUS badge.
    Normalizing here makes the parser immune to decoration on every path.
    """
    names = "|".join(_KNOWN_HEADERS)
    deco = r"[#>\s*_]*"
    # Header alone on its line (with or without a trailing colon).
    raw = re.sub(rf"(?im)^{deco}({names}){deco}:?{deco}$", r"\1:", raw)
    # Header with content on the same line ('**DECISION:** APPROVE').
    raw = re.sub(rf"(?im)^{deco}({names}){deco}:[\s*_]*", r"\1: ", raw)
    return raw


def _parse_consensus(raw: str) -> Dict[str, Any]:
    """Parse the Chairman's structured consensus output.

    Tolerant of minor formatting variance; falls back to splitting the raw
    text when a section header is missing.
    """
    raw = _normalize_chair_headers(raw)

    def section(name: str, aliases: List[str] = None) -> str:
        aliases = aliases or [name]
        # Match "NAME:" possibly followed by newline, then content up to the
        # next known section header or end of text.
        known = list(_KNOWN_HEADERS)
        other = [k for k in known if k not in [a.upper() for a in aliases]]
        for alias in aliases:
            pat = re.compile(
                rf"(?im)^\s*{re.escape(alias)}\s*:\s*\n?(.*?)(?=^\s*(?:{'|'.join(other)})\s*:|\Z)",
                re.DOTALL,
            )
            m = pat.search(raw)
            if m:
                return m.group(1).strip()
        return ""

    consensus_text = section("CONSENSUS")
    confidence_raw = section("CONFIDENCE")
    decision_raw = section("DECISION")
    recommendation = section("RECOMMENDATION")
    next_steps_raw = section("NEXT STEPS", ["NEXT STEPS"])
    trigger_raw = section("TRIGGER CONDITIONS", ["TRIGGER CONDITIONS"])
    agreement_raw = section("POINTS OF AGREEMENT", ["POINTS OF AGREEMENT"])
    disagreement_raw = section("POINTS OF DISAGREEMENT", ["POINTS OF DISAGREEMENT"])

    # Confidence -> int (may be overridden by caller with independently-scored value)
    confidence = None
    if confidence_raw:
        m = re.search(r"\d{1,3}", confidence_raw)
        if m:
            confidence = max(0, min(100, int(m.group(0))))

    # Decision -> enum-ish. "NO CONSENSUS" is a board VERDICT — it must never be
    # the fallback for "we couldn't read the Chair's output". Honest states:
    #   UNPARSED     — nothing extracted at all; the raw text IS the decision.
    #   UNCLASSIFIED — sections parsed but the Chair wrote a prose decision
    #                  instead of the enum; the prose is kept in decision_note.
    # Never guess a verdict the Chair didn't state.
    decision = "UNPARSED"
    decision_note = ""
    if decision_raw:
        d = decision_raw.upper().strip()
        for cand in ("APPROVE WITH CONDITIONS", "APPROVE", "REJECT", "NO CONSENSUS"):
            if cand in d:
                decision = cand
                break
        else:
            decision = "UNCLASSIFIED"
            decision_note = decision_raw.strip()
    elif consensus_text or recommendation:
        decision = "UNCLASSIFIED"

    return {
        "consensus": consensus_text,
        "confidence": confidence,
        "decision": decision,
        "decision_note": decision_note,
        "recommendation": recommendation,
        "next_steps": _parse_bullets(next_steps_raw),
        "trigger_conditions": trigger_raw,
        "points_of_agreement": _parse_bullets(agreement_raw),
        "points_of_disagreement": _parse_bullets(disagreement_raw),
    }


def _parse_bullets(text: str) -> List[str]:
    """Parse a markdown bullet list into a list of cleaned strings."""
    if not text:
        return []
    items = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        # strip leading bullets/numbers
        line = re.sub(r"^[-*+]\s+", "", line)
        line = re.sub(r"^\d+\.\s+", "", line)
        if line:
            items.append(line)
    return items


def _first_line(text: str, max_len: int = 160) -> str:
    if not text:
        return ""
    for line in text.splitlines():
        s = line.strip()
        if s:
            return s[:max_len]
    return text[:max_len]


def _failed_placeholder(seat: dict) -> str:
    return (
        f"[{seat.get('role', 'Director')} was unavailable for this turn - "
        f"the model could not be reached. The board continues with the "
        f"directors who were present.]"
    )


def _compact_prior_context(prior_turns: List[Dict[str, Any]]) -> str:
    """Render a compact summary of the last prior turn for follow-up context."""
    if not prior_turns:
        return "(no prior turns)"
    last = prior_turns[-1]
    q = last.get("question", "")
    s4 = last.get("stage4", {}) or {}
    consensus = s4.get("consensus", "")
    decision = s4.get("decision", "")
    conf = s4.get("confidence", "")
    rec = s4.get("recommendation", "")
    parts = [f"Prior question: {q}"]
    if decision:
        parts.append(f"Prior decision: {decision} (confidence: {conf})")
    if consensus:
        parts.append(f"Prior consensus: {consensus}")
    if rec:
        parts.append(f"Prior recommendation: {rec}")
    return "\n".join(parts)


async def _gather(tasks: List) -> List:
    """asyncio.gather that preserves order and never raises."""
    import asyncio
    return await asyncio.gather(*tasks, return_exceptions=False)
