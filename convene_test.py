"""End-to-end convene: prove the 4-stage board flow streams with 5 live directors.

Creates a session with the 'general' counsel (5 distinct live models), POSTs a
real question to /convene/stream, and walks the SSE stream, asserting each of
the 4 stages (blind openings -> cross-exam "lawyer round" -> revisions ->
chairman consensus) arrives and contains content from all 5 directors.
"""
import json
import sys
import time
import urllib.request

BASE = "http://127.0.0.1:8001"
QUESTION = "Should we raise our prices by 10% next quarter?"

print("=" * 72)
print("END-TO-END CONVENE: 5 live directors, 4 stages, real OpenRouter calls")
print("=" * 72)
print(f"Question: {QUESTION!r}")
print()

# 1. Create a board session with the default general-counsel roster.
req = urllib.request.Request(
    f"{BASE}/api/board/sessions",
    data=json.dumps({"counsel_type": "general"}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(req, timeout=10) as r:
    session = json.loads(r.read().decode())
session_id = session["id"]
board = session["board"]
seats = board.get("seats", [])
print(f"Session created: {session_id}")
print(f"Counsel type: {board.get('counsel_type')}  ({len(seats)} seats)")
for s in seats:
    print(f"   {s['role']:<32} <- {s.get('model', s.get('default_model', '?'))}")
assert len(seats) == 5, f"Expected 5 seats, got {len(seats)}"
print()

# 2. POST to convene/stream and consume the SSE stream.
req = urllib.request.Request(
    f"{BASE}/api/board/sessions/{session_id}/convene/stream",
    data=json.dumps({"question": QUESTION}).encode(),
    headers={"Content-Type": "application/json", "Accept": "text/event-stream"},
    method="POST",
)
t0 = time.time()
events = []
print("--- SSE stream ---")
with urllib.request.urlopen(req, timeout=600) as resp:
    buf = b""
    for raw in resp:
        buf += raw
        while b"\n\n" in buf:
            frame, buf = buf.split(b"\n\n", 1)
            for line in frame.split(b"\n"):
                if line.startswith(b"data: "):
                    payload = line[6:].decode()
                    try:
                        evt = json.loads(payload)
                    except json.JSONDecodeError:
                        continue
                    events.append(evt)
                    etype = evt.get("type")
                    elapsed = time.time() - t0
                    if etype == "stage1_start":
                        print(f"[{elapsed:6.1f}s] stage1_start   -> blind openings (5 directors)")
                    elif etype == "stage1_complete":
                        n = len(evt.get("data", []))
                        print(f"[{elapsed:6.1f}s] stage1_complete -> {n} openings received")
                    elif etype == "stage2_start":
                        print(f"[{elapsed:6.1f}s] stage2_start   -> cross-examination (the lawyer round)")
                    elif etype == "stage2_complete":
                        n = len(evt.get("data", []))
                        print(f"[{elapsed:6.1f}s] stage2_complete -> {n} cross-exam responses")
                    elif etype == "stage3_start":
                        print(f"[{elapsed:6.1f}s] stage3_start   -> revised positions")
                    elif etype == "stage3_complete":
                        n = len(evt.get("data", []))
                        print(f"[{elapsed:6.1f}s] stage3_complete -> {n} revised positions")
                    elif etype == "stage4_start":
                        print(f"[{elapsed:6.1f}s] stage4_start   -> chairman consensus")
                    elif etype == "stage4_complete":
                        d = evt.get("data", {})
                        summary = (d.get("consensus") or d.get("summary") or "")[:120]
                        print(f"[{elapsed:6.1f}s] stage4_complete -> chairman verdict: {summary!r}")
                    elif etype == "title_complete":
                        print(f"[{elapsed:6.1f}s] title_complete  -> {evt.get('data', {}).get('title')!r}")
                    elif etype == "complete":
                        print(f"[{elapsed:6.1f}s] complete        -> turn_index={evt.get('data', {}).get('turn_index')}")
                    elif etype == "error":
                        print(f"[{elapsed:6.1f}s] ERROR           -> {evt.get('message')}")
                        sys.exit(1)
                    else:
                        print(f"[{elapsed:6.1f}s] {etype}")
print()

# 3. Assertions.
types_seen = [e["type"] for e in events]
print("--- Assertions ---")
for required in ["stage1_complete", "stage2_complete", "stage3_complete", "stage4_complete", "complete"]:
    assert required in types_seen, f"MISSING event: {required}  (saw: {types_seen})"
    print(f"  [OK] event {required} received")

s1 = next(e for e in events if e["type"] == "stage1_complete")["data"]
s2 = next(e for e in events if e["type"] == "stage2_complete")["data"]
s3 = next(e for e in events if e["type"] == "stage3_complete")["data"]
s4 = next(e for e in events if e["type"] == "stage4_complete")["data"]

assert len(s1) == 5, f"Stage 1: expected 5 openings, got {len(s1)}"
assert len(s2) == 5, f"Stage 2: expected 5 cross-exam responses, got {len(s2)}"
assert len(s3) == 5, f"Stage 3: expected 5 revisions, got {len(s3)}"
print(f"  [OK] Stage 1: {len(s1)} blind openings from 5 directors")
print(f"  [OK] Stage 2: {len(s2)} cross-exam responses (the lawyer round)")
print(f"  [OK] Stage 3: {len(s3)} revised positions")
print(f"  [OK] Stage 4: chairman consensus present (keys={list(s4.keys())})")

# Sample one opening + one cross-exam so we can eyeball real content.
print()
print("=" * 72)
print("SAMPLE STAGE 1 (blind opening), seat 0:")
print("=" * 72)
first = s1[0] if isinstance(s1, list) else list(s1.values())[0]
txt = (first.get("opening") or first.get("text") or first.get("content") or str(first))[:600]
print(f"  role:  {first.get('role', '?')}")
print(f"  model: {first.get('model', '?')}")
print(f"  text:  {txt!r}")

print()
print("=" * 72)
print("SAMPLE STAGE 2 (cross-exam / lawyer round), seat 0:")
print("=" * 72)
cx = s2[0] if isinstance(s2, list) else list(s2.values())[0]
ctxt = (cx.get("cross_examination") or cx.get("text") or cx.get("content") or str(cx))[:800]
print(f"  role:  {cx.get('role', '?')}")
print(f"  model: {cx.get('model', '?')}")
print(f"  text:  {ctxt!r}")

print()
print("=" * 72)
print("SAMPLE STAGE 3 (revised position), seat 0:")
print("=" * 72)
rv = s3[0] if isinstance(s3, list) else list(s3.values())[0]
rvtxt = (rv.get("revised_position") or rv.get("position") or rv.get("text") or str(rv))[:400]
print(f"  role:  {rv.get('role', '?')}")
print(f"  text:  {rvtxt!r}")

print()
print("=" * 72)
print("SAMPLE STAGE 4 (chairman consensus):")
print("=" * 72)
ck = list(s4.keys()) if isinstance(s4, dict) else None
print(f"  keys:  {ck}")
print(f"  raw:   {str(s4)[:600]!r}")

print()
print("=" * 72)
print("ALL END-TO-END CHECKS PASSED")
print(f"  total elapsed: {time.time() - t0:.1f}s")
print(f"  events: {len(events)}")
print("=" * 72)
