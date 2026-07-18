import { useState } from 'react';
import './BoardConfigPanel.css';

/**
 * BoardConfigPanel - shows the boardroom table: chairman + each seat with its
 * role, focus, persona, and a model selector to swap the brain on that seat.
 *
 * Swapping a seat's model calls onUpdateBoard so the change persists and is
 * used on the next convene / follow-up.
 */
export default function BoardConfigPanel({
  session,
  counselTypes,
  models,
  onUpdateBoard,
  compact = false,
}) {
  const board = session.board;
  const [expandedSeat, setExpandedSeat] = useState(null);

  if (!board) return null;

  const swapModel = (seatIdx, modelId) => {
    const seats = board.seats.map((s) =>
      s.seat === seatIdx ? { ...s, model: modelId } : s
    );
    onUpdateBoard({ ...board, seats });
  };

  const swapChairman = (modelId) => {
    onUpdateBoard({ ...board, chairman_model: modelId });
  };

  const changeCounsel = (counselKey) => {
    // Rebuild seats from the chosen counsel preset, preserving any same-index
    // model swaps the user had made (best-effort).
    const preset = counselTypes.find((c) => c.key === counselKey);
    if (!preset) return;
    const prevSeats = board.seats || [];
    const seats = preset.seats.map((s) => ({
      seat: s.seat,
      role: s.role,
      focus: s.focus,
      persona: s.persona,
      model: prevSeats[s.seat]?.model || s.default_model,
    }));
    onUpdateBoard({
      ...board,
      counsel_type: counselKey,
      chairman_persona: preset.chairman_persona,
      seats,
    });
  };

  const modelShortName = (id) => {
    const m = models.find((x) => x.id === id);
    return m ? m.name : (id.split('/').pop() || id);
  };

  return (
    <div className={`board-config ${compact ? 'compact' : ''}`}>
      <div className="config-intro">
        <h3>The Boardroom Table</h3>
        <p>
          Each seat is a role with a persona, filled by a genuinely different
          LLM brain. Swap any brain on any seat — the chairman included.
          Models are called via OpenRouter; each convene uses your OpenRouter
          credits (≈ $0.02–0.08 per full 4-stage convene).
        </p>
        <div className="counsel-select-row">
          <label>Counsel type:</label>
          <select
            value={board.counsel_type}
            onChange={(e) => changeCounsel(e.target.value)}
          >
            {counselTypes.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="table">
        {/* Chairman seat */}
        <div className="seat chairman-seat">
          <div className="seat-head">
            <span className="seat-emblem">★</span>
            <div className="seat-titles">
              <div className="seat-role">Chairman of the Board</div>
              <div className="seat-focus">Synthesizer · consensus · decision</div>
            </div>
            <select
              className="model-select"
              value={board.chairman_model}
              onChange={(e) => swapChairman(e.target.value)}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Director seats */}
        {board.seats.map((seat) => (
          <div
            className={`seat director-seat ${expandedSeat === seat.seat ? 'expanded' : ''}`}
            key={seat.seat}
          >
            <div className="seat-head">
              <span className="seat-emblem dir">◆</span>
              <div className="seat-titles">
                <div className="seat-role">{seat.role}</div>
                <div className="seat-focus">{seat.focus}</div>
              </div>
              <div className="seat-controls">
                <select
                  className="model-select"
                  value={seat.model}
                  onChange={(e) => swapModel(seat.seat, e.target.value)}
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <button
                  className="expand-btn"
                  onClick={() =>
                    setExpandedSeat(expandedSeat === seat.seat ? null : seat.seat)
                  }
                  title="Show / hide persona"
                >
                  {expandedSeat === seat.seat ? '−' : '⋯'}
                </button>
              </div>
            </div>
            {expandedSeat === seat.seat && (
              <div className="seat-persona">
                <div className="persona-label">Persona</div>
                <p>{seat.persona}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
