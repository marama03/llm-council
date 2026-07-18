"""Retroactively re-synthesize Stage 4 (Chairman's Consensus) for the
'Cockpit social media buffer' session, using the stored Stages 1-3 as-is.

This backfills the new fields the original save didn't have:
  - split_info           (pure-Python, from _detect_split)
  - confidence_scorers   (two non-Chair directors independently re-score)
  - trigger_conditions   (Chair re-synthesizes with the dissent block injected,
                          forced because the 3-vs-2 split triggers it)
  - confidence           (replaces the old Chair-self-graded 85 with the
                          independently-averaged value)

Stages 1-3 are reused verbatim — no director re-runs.
Mutates data/boards/212eeaf4-...json in place. A .bak copy is kept.
"""
import asyncio
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, ".")

from backend.boardroom import stage4_chairman_consensus
from backend.board_config import get_counsel_type

SESSION_PATH = Path("data/boards/212eeaf4-1ae8-489a-8b4c-608b87526ca6.json")


async def main():
    if not SESSION_PATH.exists():
        print(f"ERROR: {SESSION_PATH} not found")
        return 1

    # 1. Back up the original (safety net, cleaned up at the end on success)
    bak_path = SESSION_PATH.with_suffix(".json.bak")
    shutil.copy2(SESSION_PATH, bak_path)
    print(f"[1/5] Backed up original -> {bak_path}")

    # 2. Load session
    session = json.loads(SESSION_PATH.read_text())
    turn = session["turns"][0]
    board = session["board"]
    question = turn["question"]
    openings = turn["stage1"]
    cross = turn["stage2"]
    revisions = turn["stage3"]

    print(f"[2/5] Loaded session: {session.get('title')!r}")
    print(f"      counsel_type: {board.get('counsel_type')}")
    print(f"      chairman_model: {board.get('chairman_model')}")
    print(f"      question: {question[:90]!r}")
    print(f"      stage3 stances: {[r.get('revised_stance') for r in revisions]}")

    # 3. Resolve counsel dict (same path main.py uses)
    counsel = get_counsel_type(board.get("counsel_type", "general"))
    print(f"[3/5] Resolved counsel: {counsel.get('name', board.get('counsel_type'))}")

    # 4. Re-synthesize Stage 4 (this is the 3-LLM-call step)
    print("[4/5] Re-synthesizing Stage 4 (2 independent scorers + 1 Chair)...")
    print("      ...this takes ~20-40s on OpenRouter...")
    old_s4 = turn["stage4"]
    old_conf = old_s4.get("confidence")
    old_decision = old_s4.get("decision")
    new_s4 = await stage4_chairman_consensus(question, openings, cross, revisions, board, counsel)

    # 5. Swap in and persist
    turn["stage4"] = new_s4
    SESSION_PATH.write_text(json.dumps(session, indent=2))
    print(f"[5/5] Wrote enriched stage4 back -> {SESSION_PATH}")

    # Report the deltas
    print()
    print("=" * 60)
    print("RE-SYNTHESIS COMPLETE")
    print("=" * 60)
    print(f"  confidence      : {old_conf} (Chair-self-graded) -> {new_s4.get('confidence')} (independent)")
    print(f"  confidence_scorers: {new_s4.get('confidence_scorers')}")
    print(f"  decision        : {old_decision} -> {new_s4.get('decision')}")
    si = new_s4.get("split_info") or {}
    print(f"  split_info      : {si.get('split_label')} | split={si.get('split')}")
    print(f"    majority    : {si.get('majority')}")
    print(f"    dissenters  : {si.get('dissenters')}")
    tc = (new_s4.get("trigger_conditions") or "").strip()
    print(f"  trigger_conditions: {'present (' + str(len(tc)) + ' chars)' if tc else 'EMPTY'}")
    if tc:
        print("    ---")
        for line in tc.splitlines():
            print(f"    {line}")
        print("    ---")
    print()
    print(f"Original preserved at: {bak_path}")
    print("(If the new verdict looks wrong, restore with: "
          f"cp {bak_path} {SESSION_PATH})")
    return 0


if __name__ == "__main__":
    rc = asyncio.run(main())
    sys.exit(rc or 0)
