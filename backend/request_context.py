"""Per-request context for multi-tenant use behind the Cockpit proxy.

The Cockpit injects two headers on proxied requests:
  X-OpenRouter-Key : the key to bill this request to (a tenant's own key, or absent for the
                     operator, in which case the process-level OPENROUTER_API_KEY applies).
  X-Council-NS     : a storage namespace ("t-<tenant-id>"), so tenant boards live in their own
                     subdirectory and tenants can never list or read the operator's sessions.

Both default to operator behavior when absent, so the app runs standalone exactly as before.
"""

from contextvars import ContextVar

request_api_key: ContextVar[str] = ContextVar("request_api_key", default="")
request_namespace: ContextVar[str] = ContextVar("request_namespace", default="")


def current_api_key(fallback: str) -> str:
    key = request_api_key.get()
    return key if key else fallback


def current_namespace() -> str:
    ns = request_namespace.get()
    # Hard sanitation: a namespace is only ever a simple slug — never a path.
    return "".join(c for c in ns if c.isalnum() or c in "-_")[:64]
