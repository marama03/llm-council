"""Council -> Cockpit usage metering.

OpenRouter is the Cockpit's ONE metered engine (everything else rides flat subscriptions), so every
council model call must land in the operator's usage ledger. OpenRouter returns exact billed cost
per call when the request asks for it (payload {"usage": {"include": true}}); we append it to the
Cockpit's own meter file in the same record shape the Claude/Codex lanes use, so the Usage screen
needs no special handling.

Tenant sessions run on the tenant's OWN key (X-OpenRouter-Key) — their spend is still recorded
(it is real money and real activity) but labeled with the tenant namespace so the operator can
tell house spend from tenant spend at a glance.

Never raises: metering must not break a board session.
"""

import json
from datetime import datetime, timezone
from pathlib import Path

from .request_context import current_namespace

# council/backend/ -> Cockpit/ -> build/server/data/usage-meter.jsonl
_METER = Path(__file__).resolve().parents[2] / "build" / "server" / "data" / "usage-meter.jsonl"


def record(model: str, usage: dict, duration_ms: int) -> None:
    try:
        if not isinstance(usage, dict):
            return
        ns = current_namespace()
        rec = {
            "at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "agent_id": "council",
            "agent_name": "The Council" + (f" (tenant {ns})" if ns else ""),
            "provider": "openrouter",
            "ns": ns or "house",
            "model": model,
            "input_tokens": usage.get("prompt_tokens") or 0,
            "output_tokens": usage.get("completion_tokens") or 0,
            "cost_usd": usage.get("cost") if isinstance(usage.get("cost"), (int, float)) else 0,
            "duration_ms": duration_ms,
        }
        with open(_METER, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec) + "\n")
    except Exception:
        pass
