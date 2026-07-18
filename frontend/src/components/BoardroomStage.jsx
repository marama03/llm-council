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
    return (
      <div className="boardroom-stage">
        <div className="boardroom-empty">
          <div className="empty-emblem">◆</div>
          <h1>Board of Directors</h1>
          <p className="empty-tagline">
            One question. Six brains. Cross-examination. A chairman's consensus.
          </p>
          <p className="empty-sub">
            Convene a board of genuinely different LLMs to break AI psychosis.
            Each director writes a blind opening, then cross-examines the table,
            then revises their stance. The chairman delivers a consensus with a
            confidence score, a decision, and next steps.
          </p>
          <div className="empty-arrow">← Start a new board from the sidebar</div>
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
            <h3>Put your question to the board</h3>
            <p className="convene-help">
              The directors will write blind opening statements, cross-examine
              one another, revise their positions, and the chairman will deliver
              a consensus.
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
              placeholder="State the decision the board should debate... (Enter to convene, Shift+Enter for a new line)"
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
              Convene the Board
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
              placeholder="Ask the board a follow-up question..."
              value={followupQuestion}
              onChange={(e) => setFollowupQuestion(e.target.value)}
              disabled={isLoading}
            />
            <button
              type="submit"
              className="followup-btn"
              disabled={!followupQuestion.trim() || isLoading}
            >
              Re-convene
            </button>
          </form>

          {error && <div className="board-error">{error}</div>}
        </div>
      )}
    </div>
  );
}
