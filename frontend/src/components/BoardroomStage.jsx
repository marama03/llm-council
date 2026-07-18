import { useState, useEffect, useRef, useCallback } from 'react';
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
  // Hide the full config strip by default when there are already turns —
  // user wants to see results, not the static seat list
  const [showConfig, setShowConfig] = useState(true);
  const [attachments, setAttachments] = useState([]); // [{type,name,data_url?,text?,preview?}]
  const [isDragOver, setIsDragOver] = useState(false);
  const resultsEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const hasSession = !!session;
  const hasTurns = hasSession && session.turns && session.turns.length > 0;

  // ---- Attachment processing ----
  const processFile = useCallback((file) => {
    const isImage = file.type.startsWith('image/');
    const isText = (
      file.type === 'text/plain' ||
      file.type === 'text/markdown' ||
      file.name.endsWith('.md') ||
      file.name.endsWith('.txt') ||
      file.name.endsWith('.csv')
    );
    const isPdf = file.type === 'application/pdf';

    if (isImage) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setAttachments((prev) => [
          ...prev,
          { type: 'image', name: file.name, data_url: e.target.result, preview: e.target.result },
        ]);
      };
      reader.readAsDataURL(file);
    } else if (isText) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setAttachments((prev) => [
          ...prev,
          { type: 'text', name: file.name, text: e.target.result },
        ]);
      };
      reader.readAsText(file);
    } else if (isPdf) {
      // PDF: we pass it as a note to extract text on the backend is complex,
      // so we read it as text (basic extraction for text-based PDFs).
      const reader = new FileReader();
      reader.onload = (e) => {
        // Simple: treat as binary text — models will handle garbled PDF streams.
        // For real PDF parsing we'd need pdf.js on the frontend.
        // As a UX concession we add a note so the user understands the limitation.
        const raw = e.target.result;
        // Extract readable-ish text snippets from PDF bytestream
        const decoded = raw.replace(/[^\x20-\x7E\n]/g, ' ').replace(/\s{3,}/g, '\n').trim();
        setAttachments((prev) => [
          ...prev,
          {
            type: 'text',
            name: file.name,
            text: `[PDF: ${file.name} — text extracted]\n\n${decoded.slice(0, 8000)}`,
          },
        ]);
      };
      reader.readAsBinaryString(file);
    }
    // Other file types: silently ignore (or could add a toast)
  }, []);

  const handleFilePick = useCallback((e) => {
    Array.from(e.target.files || []).forEach(processFile);
    e.target.value = ''; // reset so same file can be picked again
  }, [processFile]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
    Array.from(e.dataTransfer.files || []).forEach(processFile);
    // Also handle image drag from browser (dataTransfer.items with image/...)
    Array.from(e.dataTransfer.items || []).forEach((item) => {
      if (item.kind === 'file') return; // already handled above
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) processFile(file);
      }
    });
  }, [processFile]);

  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) processFile(file);
      }
    }
  }, [processFile]);

  const removeAttachment = (idx) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

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
    // Serialize attachments for the API (images: data_url, text: text content)
    const apiAttachments = attachments.map(({ type, name, data_url, text }) => ({
      type,
      name,
      ...(type === 'image' ? { data_url } : { text: text || '' }),
    }));
    setAttachments([]);
    setShowConfig(false);
    onConvene(q, apiAttachments);
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

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.txt,.md,.csv"
            style={{ display: 'none' }}
            onChange={handleFilePick}
          />

          <form
            className={`convene-form${isDragOver ? ' drag-over' : ''}`}
            onSubmit={handleConvene}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDragOver(false); }}
          >
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
              onPaste={handlePaste}
              disabled={isLoading}
              rows={4}
            />

            {/* Attachment strip — shown when files are attached */}
            {attachments.length > 0 && (
              <div className="attachment-strip">
                {attachments.map((att, idx) => (
                  <div key={idx} className={`attachment-chip ${att.type}`}>
                    {att.type === 'image' && att.preview
                      ? <img src={att.preview} alt={att.name} className="attachment-thumb" />
                      : <span className="attachment-icon">{att.type === 'image' ? '🖼' : '📄'}</span>
                    }
                    <span className="attachment-name">{att.name || (att.type === 'image' ? 'image' : 'file')}</span>
                    <button
                      type="button"
                      className="attachment-remove"
                      onClick={() => removeAttachment(idx)}
                      title="Remove"
                    >×</button>
                  </div>
                ))}
              </div>
            )}

            <div className="convene-actions">
              <button
                type="button"
                className="attach-btn"
                onClick={() => fileInputRef.current?.click()}
                title="Attach image or file (images, PDF, TXT, CSV)"
                disabled={isLoading}
              >
                📎 Attach
              </button>
              <span className="attach-hint">
                or paste / drag an image
              </span>
              <button
                type="submit"
                className="convene-btn"
                disabled={!question.trim() || isLoading}
              >
                ◆ Convene the Board
              </button>
            </div>
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
