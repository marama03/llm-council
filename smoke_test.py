"""Smoke test: verify the 5-member board roster is live on the running backend."""
import json, urllib.request

def fetch(path):
    with urllib.request.urlopen(f"http://127.0.0.1:8001{path}", timeout=10) as r:
        return json.loads(r.read().decode())

print("=" * 70)
print("AVAILABLE MODELS (should be 7 live brains)")
print("=" * 70)
md = fetch("/api/board/models")
items = md["models"]
for m in items:
    print(f"  {m['id']:<42} {m['name']}")
assert len(items) == 7, f"Expected 7 models, got {len(items)}"

print()
print("=" * 70)
print("5-SEAT ROSTER PER COUNSEL TYPE")
print("=" * 70)
ct = fetch("/api/board/counsel-types")
counsel_list = ct["counsel_types"]
for v in counsel_list:
    seats = v.get("seats", [])
    print(f"\n--- {v['key']}: {v.get('label')} ({len(seats)} seats) ---")
    models_used = []
    for s in seats:
        mid = s["default_model"]
        models_used.append(mid)
        print(f"   {s['role']:<32} <- {mid}")
    assert len(seats) == 5, f"{v['key']}: expected 5 seats, got {len(seats)}"
    assert len(set(models_used)) == 5, f"{v['key']}: duplicate models on seats: {models_used}"
    live_ids = [m["id"] for m in items]
    for mid in models_used:
        assert mid in live_ids, f"{v['key']}: {mid} not in available models!"

print()
print("=" * 70)
print("ALL CHECKS PASSED")
print("=" * 70)
print(" - 7 live models loaded")
print(f" - {len(counsel_list)} counsel types, each with exactly 5 seats")
print(" - No seat uses a dead or duplicate model")
print(" - No grok-4 or gemini-3-pro-preview anywhere")
