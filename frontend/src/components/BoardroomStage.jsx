import { useState, useEffect, useRef } from 'react';
import BoardConfigPanel from './BoardConfigPanel';
import BoardTurn from './BoardTurn';
import VoiceController from './VoiceController';
import './BoardroomStage.css';

/**
 * BoardroomStage - the main pane of the Board of Directors.
 *
 * Three states:
 *   1. no session  -> welcome / empty state
 *   2. session with no turns -> boardroom "table" setup (counsel selector,
 *      seat config, question input, example chips, convene button)
 *   3. session with turns -> the convened board's results, plus a follow-up
 *      bar at the bottom
 */
export default function BoardroomStage({
  session,
  counselTypes,
  models,
  examples,
  isLoading,
  error,
  onConvene,
  onFollowup,
  onUpdateBoard,
  onNewSession,
}) {
  const [question, setQuestion] = useState('');
  const [followupQuestion, setFollowupQuestion] = useState('');
  const [showConfig, setShowConfig] = useState(true);
  const resultsEndRef = useRef(null);

  const hasSession = !!session;
  const hasTurns = hasSession && session.turns && session.turns.length > 0;

  useEffect(() => {
    if (hasTurns) {
      resultsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [hasTurns, session?.turns?.length]);

  if (!hasSession) {
    const liveModels = (models || []).map((m) => m.name);
    const modelsLabel = liveModels.length
      ? liveModels.join(' · ')
      : 'loading…';
    return (
      <div className="boardroom-stage">
        <div className="boardroom-empty">
          <div className="empty-emblem">The Council</div>
          <h1>Five different models.<br /><span>One decisive answer.</span></h1>
          <p className="empty-tagline">Not one model wearing five masks.</p>

          {/* Radial ring — blending OLD circular visualization */}
          <div className="empty-circle-diagram">
            <div className="empty-circle-ring" />
            <div className="empty-circle-ring ring-2" />
            {[
              { label: 'GPT',      angle: 0 },
              { label: 'Claude',   angle: 72 },
              { label: 'DeepSeek', angle: 144 },
              { label: 'Qwen',     angle: 216 },
              { label: 'Mistral',  angle: 288 },
            ].map(({ label, angle }) => {
              const r = 88;
              const rad = ((angle - 90) * Math.PI) / 180;
              const x = 50 + (r / 2) * Math.cos(rad);
              const y = 50 + (r / 2) * Math.sin(rad);
              return (
                <div
                  key={label}
                  className="empty-dot"
                  data-label={label}
                  style={{ left: `${x}%`, top: `${y}%` }}
                />
              );
            })}
          </div>

          <p className="empty-sub">
            Pose a question. Five genuinely different LLMs deliberate in blind
            openings, cross-examine each other, revise their stances. The
            chairman synthesizes a confidence score, a decision, and next steps.
            This is the antidote to AI psychosis.
          </p>

          {/* The obvious entry point — pick a counsel type to convene a board.
              This both fixes the "I can't see how to start" UX bug AND surfaces
              a backend-reachability failure (no counsel types = clear error). */}
          <div className="empty-cta">
            <div className="empty-cta-title">Convene a board to begin</div>
            {counselTypes.length === 0 ? (
              <div className="empty-cta-loading">
                {error
                  ? `Backend not reachable: ${error}`
                  : 'Loading board types… if this persists, the backend on :8001 is not running.'}
              </div>
            ) : (
              <div className="empty-cta-cards">
                {counselTypes.map((c) => (
                  <button
                    key={c.key}
                    className="empty-cta-card"
                    onClick={() => onNewSession && onNewSession(c.key)}
                    disabled={isLoading}
                  >
                    <div className="empty-cta-card-label">{c.label}</div>
                    <div className="empty-cta-card-desc">{c.description}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="empty-models-line">
            Live brains: <strong>{modelsLabel}</strong>
          </div>
        </div>
      </div>
    );
  }

  const counsel = counselTypes.find((c) => c.key === session.counsel_type) || null;

  const handleConvene = (e) => {
    e?.preventDefault();
    const q = question.trim();
    if (!q || isLoading) return;
    setQuestion('');
    setShowConfig(false);
    onConvene(q);
  };

  const handleFollowup = (e) => {
    e?.preventDefault();
    const q = followupQuestion.trim();
    if (!q || isLoading) return;
    setFollowupQuestion('');
    onFollowup(q);
  };

  return (
    <div className="boardroom-stage">
      {/* Header strip */}
      <div className="boardroom-header">
        <div className="boardroom-header-left">
          <h2 className="session-name">{session.title || 'Board Session'}</h2>
          <span className="counsel-pill">{counsel ? counsel.label : session.counsel_type}</span>
          <span className="turn-count-pill">
            {session.turns.length} turn{session.turns.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="boardroom-header-right">
          <VoiceController session={session} />
          <button
            className="config-toggle"
            onClick={() => setShowConfig((v) => !v)}
            title="Show / hide board configuration"
          >
            {showConfig ? 'Hide board' : 'Configure board'}
          </button>
        </div>
      </div>

      {/* Configuration panel (collapsible) */}
      {showConfig && !hasTurns && (
        <BoardConfigPanel
          session={session}
          counselTypes={counselTypes}
          models={models}
          onUpdateBoard={onUpdateBoard}
        />
      )}
      {showConfig && hasTurns && (
        <BoardConfigPanel
          session={session}
          counselTypes={counselTypes}
          models={models}
          onUpdateBoard={onUpdateBoard}
          compact
        />
      )}

      {/* Setup state: question input + example chips */}
      {!hasTurns && (
        <div className="convene-area">
          <div className="convene-prompt">
            <h3>Put a decision <span>before the board</span></h3>
            <p className="convene-help">
              Directors write blind opening statements, then cross-examine each
              other, then revise their stances. The chairman synthesizes a
              decision. Execution-ready output, not a wall of opinions.
            </p>
          </div>

          {examples.length > 0 && (
            <div className="example-chips">
              <span className="example-label">Try:</span>
              {examples.map((ex, i) => (
                <button
                  key={i}
                  className="example-chip"
                  onClick={() => setQuestion(ex)}
                  disabled={isLoading}
                >
                  {ex}
                </button>
              ))}
            </div>
          )}

          <form className="convene-form" onSubmit={handleConvene}>
            <textarea
              className="convene-input"
              placeholder="State the decision... e.g. Should we build our own vector database? (Enter to convene, Shift+Enter for new line)"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleConvene(e);
                }
              }}
              disabled={isLoading}
              rows={4}
            />
            <button
              type="submit"
              className="convene-btn"
              disabled={!question.trim() || isLoading}
            >
              ◆ Convene the Board
            </button>
          </form>

          {error && <div className="board-error">{error}</div>}
        </div>
      )}

      {/* Results: one BoardTurn per turn */}
      {hasTurns && (
        <div className="turns-container">
          {session.turns.map((turn, idx) => (
            <BoardTurn
              key={idx}
              turn={turn}
              turnIndex={idx}
              counselLabel={counsel ? counsel.label : session.counsel_type}
            />
          ))}
          <div ref={resultsEndRef} />

          {/* Follow-up bar */}
          <form className="followup-bar" onSubmit={handleFollowup}>
            <input
              type="text"
              className="followup-input"
              placeholder="Dig deeper — ask the board a follow-up..."
              value={followupQuestion}
              onChange={(e) => setFollowupQuestion(e.target.value)}
              disabled={isLoading}
            />
            <button
              type="submit"
              className="followup-btn"
              disabled={!followupQuestion.trim() || isLoading}
            >
              → Re-convene
            </button>
          </form>

          {error && <div className="board-error">{error}</div>}
        </div>
      )}
    </div>
  );
}
