"""JSON-based storage for Board of Directors sessions.

A board session is a persisted object:
    {
      id, created_at, title, counsel_type, board (config), turns: [turn, ...]
    }

Each turn is either:
  - a "convene" turn with stage1/stage2/stage3/stage4, OR
  - a "followup" turn with directors/chairman (re-convening the same board)
"""

import json
import os
from datetime import datetime
from typing import List, Dict, Any, Optional
from pathlib import Path

from .board_config import BOARD_DATA_DIR, default_board
from .request_context import current_namespace


def _data_dir() -> str:
    ns = current_namespace()
    return os.path.join(BOARD_DATA_DIR, ns) if ns else BOARD_DATA_DIR


def _ensure_dir():
    Path(_data_dir()).mkdir(parents=True, exist_ok=True)


def _path(session_id: str) -> str:
    return os.path.join(_data_dir(), f"{session_id}.json")


def create_session(
    session_id: str,
    counsel_type: str = "general",
    board: Optional[dict] = None,
) -> Dict[str, Any]:
    """Create a new board session."""
    _ensure_dir()
    if board is None:
        board = default_board(counsel_type)
    session = {
        "id": session_id,
        "created_at": datetime.utcnow().isoformat(),
        "title": "Board Session",
        "counsel_type": counsel_type,
        "board": board,
        "turns": [],
    }
    with open(_path(session_id), "w") as f:
        json.dump(session, f, indent=2)
    return session


def get_session(session_id: str) -> Optional[Dict[str, Any]]:
    path = _path(session_id)
    if not os.path.exists(path):
        return None
    with open(path, "r") as f:
        return json.load(f)


def save_session(session: Dict[str, Any]):
    _ensure_dir()
    with open(_path(session["id"]), "w") as f:
        json.dump(session, f, indent=2)


def list_sessions() -> List[Dict[str, Any]]:
    _ensure_dir()
    out = []
    if not os.path.isdir(_data_dir()):
        return out
    for fn in os.listdir(_data_dir()):
        if not fn.endswith(".json"):
            continue
        try:
            with open(os.path.join(_data_dir(), fn), "r") as f:
                data = json.load(f)
            out.append({
                "id": data["id"],
                "created_at": data["created_at"],
                "title": data.get("title", "Board Session"),
                "counsel_type": data.get("counsel_type", "general"),
                "turn_count": len(data.get("turns", [])),
            })
        except Exception:
            continue
    out.sort(key=lambda x: x["created_at"], reverse=True)
    return out


def delete_session(session_id: str) -> bool:
    path = _path(session_id)
    if os.path.exists(path):
        os.remove(path)
        return True
    return False


def update_title(session_id: str, title: str):
    session = get_session(session_id)
    if session is None:
        return
    session["title"] = title
    save_session(session)


def update_board(session_id: str, board: dict):
    """Persist an updated board configuration (e.g. swapped seats / counsel type).

    Also syncs session.counsel_type from board.counsel_type so the orange
    header pill stays consistent when the user switches counsel type.
    """
    session = get_session(session_id)
    if session is None:
        return
    session["board"] = board
    # Keep top-level counsel_type in sync so the header pill reflects changes.
    if "counsel_type" in board:
        session["counsel_type"] = board["counsel_type"]
    save_session(session)


def append_turn(session_id: str, turn: Dict[str, Any]):
    """Append a completed turn to the session and persist."""
    session = get_session(session_id)
    if session is None:
        raise ValueError(f"Board session {session_id} not found")
    session["turns"].append(turn)
    save_session(session)


def get_turns(session_id: str) -> List[Dict[str, Any]]:
    session = get_session(session_id)
    if session is None:
        return []
    return session.get("turns", [])
