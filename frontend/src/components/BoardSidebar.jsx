import { useState } from 'react';
import './BoardSidebar.css';

/**
 * BoardSidebar - list of board sessions + new-session control with a
 * counsel-type dropdown.
 */
export default function BoardSidebar({
  sessions,
  currentSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  counselTypes,
}) {
  const [showNewMenu, setShowNewMenu] = useState(false);

  const handlePick = (key) => {
    setShowNewMenu(false);
    onNewSession(key);
  };

  return (
    <div className="board-sidebar">
      <div className="board-sidebar-header">
        <div className="brand">
          <span className="brand-mark">◆</span>
          <div>
            <div className="brand-title">Board of Directors</div>
            <div className="brand-sub">The routing antidote</div>
          </div>
        </div>

        <div className="new-session-wrap">
          <button
            className="new-session-btn"
            onClick={() => setShowNewMenu((v) => !v)}
            disabled={!counselTypes.length}
          >
            + New Board
          </button>
          {showNewMenu && (
            <div className="new-session-menu">
              <div className="menu-title">Choose counsel type</div>
              {counselTypes.map((c) => (
                <button
                  key={c.key}
                  className="menu-item"
                  onClick={() => handlePick(c.key)}
                >
                  <div className="menu-item-label">{c.label}</div>
                  <div className="menu-item-desc">{c.description}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="session-list">
        {sessions.length === 0 ? (
          <div className="no-sessions">
            No boards yet. Start a new board to convene your directors.
          </div>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              className={`session-item ${s.id === currentSessionId ? 'active' : ''}`}
              onClick={() => onSelectSession(s.id)}
            >
              <div className="session-title">{s.title || 'Board Session'}</div>
              <div className="session-meta">
                <span className="session-counsel">{counselLabel(counselTypes, s.counsel_type)}</span>
                <span className="session-turns">{s.turn_count} turn{s.turn_count === 1 ? '' : 's'}</span>
              </div>
              <button
                className="session-delete"
                title="Delete board"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteSession(s.id);
                }}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      <div className="board-sidebar-footer">
        <span>1 API · many brains · via OpenRouter</span>
      </div>
    </div>
  );
}

function counselLabel(counselTypes, key) {
  const c = counselTypes.find((x) => x.key === key);
  return c ? c.label : key;
}
