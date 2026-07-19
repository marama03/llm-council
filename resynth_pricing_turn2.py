"""Retroactively re-run ONLY the Chairman for turn 2 of the 'Cockpit pricing
structure and points' session, under the new strict follow-up prompt
(plain-text headers, enum DECISION required, trigger conditions restored).

Why: the original turn-2 Chair decided in prose ("integrate, gated on CRO
mitigations") without stating the required enum, so it renders as
UNCLASSIFIED. Rather than hand-stamping a verdict the Chair never said, we
let the Chair restate its own decision in the enforced format.

Reused verbatim (no cost): the directors' replies, the prior-turn context,
and the independently-scored convergence (89, not self-scored).
Spent: ONE chairman call (glm-4.6) on OpenRouter.

Mutates data/boards/ac270cd7-...json in place. A .bak2 copy is kept.
"""
import asyncio
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, ".")

from backend.boardroom import (
    _chairman_system_prompt,
    _compact_prior_context,
    _parse_consensus,
)
from backend.board_config import get_counsel_type
from backend.openrouter import query_model

SESSION_PATH = Path("data/boards/ac270cd7-b1c3-44eb-86e2-4b3535c638c9.json")
TURN_INDEX = 2


async def main():
    bak_path = SESSION_PATH.with_suffix(".json.bak2")
    shutil.copy2(SESSION_PATH, bak_path)
    print(f"[1/4] Backed up -> {bak_path}")

    session = json.loads(SESSION_PATH.read_text(encoding="utf-8"))
    turn = session["turns"][TURN_INDEX]
    assert turn["kind"] == "followup", turn["kind"]
    board = session["board"]
    counsel = get_counsel_type(board.get("counsel_type", "general"))
    question = turn["question"]
    directors = turn["directors"]
    old = turn["chairman"]
    confidence = old["confidence"]  # independently scored — reuse, don't respend

    prior_context = _compact_prior_context(session["turns"][:TURN_INDEX])
    replies_text = "\n\n".join(
        f"=== {r['role']} ===\n{r['reply']}" for r in directors
    )
    # Mirror of followup_turn()'s NEW chair prompt (boardroom.py) — keep in sync.
    chair_prompt = (
        f"The board was reconvened for a follow-up.\n\n"
        f"Prior context:\n{prior_context}\n\n"
        f"New question:\n\n\"\"\"\n{question}\n\"\"\"\n\n"
        f"Directors' replies:\n\n{replies_text}\n\n"
        f"Board convergence score (independently computed, not by you): {confidence}/100\n\n"
        f"Deliver the board's consensus on this follow-up. Be explicit about how "
        f"it updates the prior consensus, if at all. Your output MUST follow "
        f"this exact structure with these exact section headers in this order:\n\n"
        f"CONSENSUS:\n<2-4 sentences stating the board's agreed outcome>\n\n"
        f"CONFIDENCE: {confidence}\n\n"
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

    print(f"[2/4] Re-running Chair ({board['chairman_model']}) — one call, ~10-30s...")
    resp = await query_model(board["chairman_model"], [
        {"role": "system", "content": _chairman_system_prompt(counsel)},
        {"role": "user", "content": chair_prompt},
    ])
    raw = (resp or {}).get("content") if resp else None
    if not raw:
        print("ERROR: Chair call failed — nothing changed on disk.")
        return 1

    new = _parse_consensus(raw)
    new["model"] = board["chairman_model"]
    new["raw"] = raw
    new["failed"] = False
    new["confidence"] = confidence
    new["confidence_scorers"] = old.get("confidence_scorers") or []
    new["resynthesized"] = "2026-07-19 chair-only re-run under strict prompt; directors + score reused"

    print(f"[3/4] decision: {old['decision']} -> {new['decision']}")
    print(f"      consensus {len(new['consensus'])}ch | rec {len(new['recommendation'])}ch | "
          f"steps {len(new['next_steps'])} | trigger {len(new['trigger_conditions'])}ch")

    if new["decision"] in ("UNPARSED", "UNCLASSIFIED"):
        print("      Chair STILL failed to state the enum — keeping the old turn untouched.")
        print("      Raw head:", repr(raw[:200]))
        return 1

    turn["chairman"] = new
    SESSION_PATH.write_text(json.dumps(session, indent=2), encoding="utf-8")
    print(f"[4/4] Wrote turn {TURN_INDEX} back -> {SESSION_PATH}")
    print(f"Rollback: cp {bak_path} {SESSION_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()) or 0)
