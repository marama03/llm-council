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
          <div className="brand-mark">M</div>
          <div>
            <div className="brand-title">The Council</div>
            <div className="brand-sub">by Marama Marketing</div>
          </div>
        </div>

        <div className="new-session-wrap">
          <button
            className="new-session-btn"
            onClick={() => setShowNewMenu((v) => !v)}
            disabled={!counselTypes.length}
          >
+ Convene Board
          </button>
          {showNewMenu && (
            <div className="new-session-menu">
              <div className="menu-title">Select board type</div>
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
            <strong>No boards yet.</strong>
            Convene your first board. Put a real decision in front of six genuinely different brains.
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
        <span>Execution trumps knowledge.</span>
      </div>
    </div>
  );
}

function counselLabel(counselTypes, key) {
  const c = counselTypes.find((x) => x.key === key);
  return c ? c.label : key;
}
