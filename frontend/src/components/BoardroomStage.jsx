import { useState, useEffect, useRef, useCallback } from 'react';
import BoardConfigPanel from './BoardConfigPanel';
import BoardTurn from './BoardTurn';
import VoiceController from './VoiceController';
import './BoardroomStage.css';

/* ─────────────────────────────────────────────────────────────────────────────
   RoundtableDiagram
   A high-tech, glowing SVG boardroom roundtable in Marama Marketing colors.
   Five AI directors sit around a glowing navy/orange table with connective
   light lines, pulsing aura rings, and branded seat labels.
───────────────────────────────────────────────────────────────────────────── */
function RoundtableDiagram() {
  const seats = [
    { label: 'GPT',      angle: -90,  color: '#ef4124', glow: 'rgba(239,65,36,0.7)',   initials: 'G' },
    { label: 'Claude',   angle: -18,  color: '#ec7323', glow: 'rgba(236,115,35,0.7)',  initials: 'C' },
    { label: 'DeepSeek', angle:  54,  color: '#efca08', glow: 'rgba(239,202,8,0.65)',  initials: 'D' },
    { label: 'Qwen',     angle: 126,  color: '#ece4b7', glow: 'rgba(236,228,183,0.6)', initials: 'Q' },
    { label: 'Mistral',  angle: 198,  color: '#ec7323', glow: 'rgba(236,115,35,0.7)',  initials: 'M' },
  ];

  const cx = 200, cy = 200, r = 130;

  const toXY = (angleDeg, radius) => {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  };

  return (
    <svg
      className="roundtable-svg"
      viewBox="0 0 400 400"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Five AI models around a council roundtable"
    >
      <defs>
        {/* Table surface radial glow */}
        <radialGradient id="tableGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#141450" />
          <stop offset="55%"  stopColor="#0a0a3a" />
          <stop offset="100%" stopColor="#000022" />
        </radialGradient>

        {/* Orange rim glow */}
        <radialGradient id="rimGlow" cx="50%" cy="50%" r="50%">
          <stop offset="60%"  stopColor="transparent" />
          <stop offset="100%" stopColor="rgba(239,65,36,0.25)" />
        </radialGradient>

        {/* Inner table shimmer */}
        <radialGradient id="innerShimmer" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="rgba(239,65,36,0.08)" />
          <stop offset="40%"  stopColor="rgba(239,202,8,0.04)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>

        {/* Per-seat glows */}
        {seats.map((s) => {
          const pos = toXY(s.angle, r);
          return (
            <radialGradient key={`rg-${s.label}`} id={`sg-${s.label}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor={s.color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </radialGradient>
          );
        })}

        {/* Drop-shadow filter for seat nodes */}
        <filter id="nodeShadow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>

        {/* Soft glow filter for table edge */}
        <filter id="edgeGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>

        {/* Line glow */}
        <filter id="lineGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* ── Outer atmosphere pulse ring ── */}
      <circle cx={cx} cy={cy} r="185" fill="none" stroke="rgba(239,65,36,0.06)" strokeWidth="1">
        <animate attributeName="r" values="182;190;182" dur="5s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.4;0.8;0.4" dur="5s" repeatCount="indefinite" />
      </circle>
      <circle cx={cx} cy={cy} r="170" fill="none" stroke="rgba(239,202,8,0.05)" strokeWidth="1">
        <animate attributeName="r" values="168;174;168" dur="7s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.3;0.6;0.3" dur="7s" repeatCount="indefinite" />
      </circle>

      {/* ── Table surface ── */}
      <circle cx={cx} cy={cy} r="110" fill="url(#tableGlow)" />

      {/* Table edge glow ring */}
      <circle cx={cx} cy={cy} r="110" fill="none"
        stroke="rgba(239,65,36,0.55)" strokeWidth="2" filter="url(#edgeGlow)" />
      <circle cx={cx} cy={cy} r="110" fill="none"
        stroke="rgba(239,65,36,0.9)" strokeWidth="1.2" />

      {/* Inner table highlights */}
      <circle cx={cx} cy={cy} r="110" fill="url(#innerShimmer)" />
      <circle cx={cx} cy={cy} r="88" fill="none"
        stroke="rgba(239,202,8,0.1)" strokeWidth="0.8" />
      <circle cx={cx} cy={cy} r="60" fill="none"
        stroke="rgba(239,65,36,0.12)" strokeWidth="0.6" />

      {/* Council emblem lines (star from center) */}
      {seats.map((s) => {
        const pos = toXY(s.angle, 100);
        return (
          <line key={`cl-${s.label}`}
            x1={cx} y1={cy} x2={pos.x} y2={pos.y}
            stroke={s.color} strokeWidth="0.5" strokeOpacity="0.18"
          />
        );
      })}

      {/* Connector polygon (seats joined by glowing ring) */}
      <polygon
        points={seats.map((s) => { const p = toXY(s.angle, r); return `${p.x},${p.y}`; }).join(' ')}
        fill="none"
        stroke="rgba(239,65,36,0.15)"
        strokeWidth="1"
        filter="url(#lineGlow)"
      />
      {/* Brighter connector lines between adjacent seats */}
      {seats.map((s, i) => {
        const a = toXY(s.angle, r);
        const b = toXY(seats[(i + 1) % seats.length].angle, r);
        return (
          <line key={`ln-${i}`}
            x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke={s.color} strokeWidth="0.8" strokeOpacity="0.22"
            filter="url(#lineGlow)"
          />
        );
      })}

      {/* ── Seat nodes ── */}
      {seats.map((s, i) => {
        const pos = toXY(s.angle, r);
        const labelPos = toXY(s.angle, r + 34);
        const animDelay = `${i * 0.6}s`;
        return (
          <g key={s.label}>
            {/* Seat glow halo */}
            <circle cx={pos.x} cy={pos.y} r="26"
              fill={`url(#sg-${s.label})`}>
              <animate attributeName="r" values="24;30;24" dur="4s" begin={animDelay} repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.6;1;0.6" dur="4s" begin={animDelay} repeatCount="indefinite" />
            </circle>

            {/* Chair back arc */}
            <circle cx={pos.x} cy={pos.y} r="18"
              fill="rgba(0,0,34,0.85)"
              stroke={s.color} strokeWidth="1.8"
              filter="url(#nodeShadow)"
            />

            {/* Chair inner shimmer */}
            <circle cx={pos.x} cy={pos.y} r="14"
              fill="rgba(255,255,255,0.03)"
              stroke={s.color} strokeWidth="0.6" strokeOpacity="0.5"
            />

            {/* Initials */}
            <text
              x={pos.x} y={pos.y + 5}
              textAnchor="middle"
              fontSize="11"
              fontWeight="800"
              fontFamily="Inter, sans-serif"
              fill={s.color}
              style={{ userSelect: 'none' }}
            >{s.initials}</text>

            {/* Label beneath */}
            <text
              x={labelPos.x} y={labelPos.y + 4}
              textAnchor="middle"
              fontSize="9.5"
              fontWeight="700"
              fontFamily="Inter, sans-serif"
              letterSpacing="0.8"
              fill="rgba(236,228,183,0.85)"
              style={{ userSelect: 'none', textTransform: 'uppercase' }}
            >{s.label}</text>
          </g>
        );
      })}

      {/* ── Central chairman mark ── */}
      <circle cx={cx} cy={cy} r="18" fill="rgba(0,0,34,0.9)"
        stroke="rgba(239,65,36,0.8)" strokeWidth="1.5" filter="url(#edgeGlow)" />
      <circle cx={cx} cy={cy} r="18" fill="none"
        stroke="rgba(239,65,36,0.9)" strokeWidth="1.2" />
      <circle cx={cx} cy={cy} r="13" fill="rgba(239,65,36,0.08)"
        stroke="rgba(239,202,8,0.4)" strokeWidth="0.8" />
      {/* Chairman crown diamond */}
      <polygon
        points={`${cx},${cy - 8} ${cx + 5},${cy} ${cx},${cy + 6} ${cx - 5},${cy}`}
        fill="rgba(239,65,36,0.9)"
        stroke="rgba(239,202,8,0.6)" strokeWidth="0.5"
      >
        <animate attributeName="opacity" values="0.7;1;0.7" dur="2.5s" repeatCount="indefinite" />
      </polygon>
    </svg>
  );
}

/**
 * BoardroomStage - the main pane of the Board of Directors.
 *
 * Three states:
 *   1. no session + no pendingCounsel  -> welcome / empty state (pick a counsel type)
 *   2. pendingCounsel set (no session) -> setup: question input, no session created yet
 *   3. session with turns              -> results + follow-up bar
 */
export default function BoardroomStage({
  session,
  pendingCounsel,
  counselTypes,
  models,
  examples,
  isLoading,
  error,
  onConvene,
  onFollowup,
  onUpdateBoard,
  onPickCounsel,
}) {
  const [question, setQuestion] = useState('');
  const [followupQuestion, setFollowupQuestion] = useState('');
  const [showConfig, setShowConfig] = useState(true);
  const [attachments, setAttachments] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const resultsEndRef = useRef(null);
  const fileInputRef = useRef(null);
  // Track whether we just convened (to enable auto-scroll during streaming)
  const isConvening = useRef(false);

  const hasSession = !!session;
  const hasTurns = hasSession && session.turns && session.turns.length > 0;
  // Show the setup pane if there's a pending counsel type OR an active session with no turns yet
  const showSetup = pendingCounsel || (hasSession && !hasTurns);

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
      const reader = new FileReader();
      reader.onload = (e) => {
        const raw = e.target.result;
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
  }, []);

  const handleFilePick = useCallback((e) => {
    Array.from(e.target.files || []).forEach(processFile);
    e.target.value = '';
  }, [processFile]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
    Array.from(e.dataTransfer.files || []).forEach(processFile);
    Array.from(e.dataTransfer.items || []).forEach((item) => {
      if (item.kind === 'file') return;
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

  // Auto-scroll ONLY while actively convening/streaming, not when switching sessions
  useEffect(() => {
    if (hasTurns && isConvening.current) {
      resultsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [hasTurns, session?.turns?.length]);

  // Stop the convening ref once loading completes
  useEffect(() => {
    if (!isLoading) {
      isConvening.current = false;
    }
  }, [isLoading]);

  // ---- Welcome screen: no session and no pending counsel ----
  if (!hasSession && !pendingCounsel) {
    const liveModels = (models || []).map((m) => m.name);
    const modelsLabel = liveModels.length ? liveModels.join(' · ') : 'loading…';
    return (
      <div className="boardroom-stage">
        <div className="boardroom-empty">
          <div className="empty-emblem">The Council</div>
          <h1>Five different models.<br /><span>One decisive answer.</span></h1>
          <p className="empty-tagline">Not one model wearing five masks.</p>

          <RoundtableDiagram />

          <p className="empty-sub">
            Pose a question. Five genuinely different LLMs deliberate in blind
            openings, cross-examine each other, revise their stances. The
            chairman synthesizes a confidence score, a decision, and next steps.
            This is the antidote to AI psychosis.
          </p>

          <div className="empty-cta">
            <div className="empty-cta-title">Choose a board type to begin</div>
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
                    onClick={() => onPickCounsel && onPickCounsel(c.key)}
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

  // ---- Resolve counsel info ----
  const activeCounselKey = session?.counsel_type || pendingCounsel;
  const counsel = counselTypes.find((c) => c.key === activeCounselKey) || null;

  const handleConvene = (e) => {
    e?.preventDefault();
    const q = question.trim();
    if (!q || isLoading) return;
    isConvening.current = true;
    setQuestion('');
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
    isConvening.current = true;
    setFollowupQuestion('');
    onFollowup(q);
  };

  return (
    <div className="boardroom-stage">
      {/* Header strip */}
      <div className="boardroom-header">
        <div className="boardroom-header-left">
          <h2 className="session-name">
            {session?.title || (counsel ? counsel.label : 'New Board')}
          </h2>
          <span className="counsel-pill">{counsel ? counsel.label : activeCounselKey}</span>
          {hasTurns && (
            <span className="turn-count-pill">
              {session.turns.length} turn{session.turns.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <div className="boardroom-header-right">
          {hasSession && <VoiceController session={session} />}
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
      {showConfig && session && (
        <BoardConfigPanel
          session={session}
          counselTypes={counselTypes}
          models={models}
          onUpdateBoard={onUpdateBoard}
          compact={hasTurns}
        />
      )}

      {/* Setup state: question input + example chips */}
      {showSetup && (
        <div className="convene-area">
          <div className="convene-prompt">
            <h3>Put a decision <span>before the board</span></h3>
            {counsel && (
              <p className="convene-counsel-desc">{counsel.description}</p>
            )}
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
              placeholder="State the decision… e.g. Should we build our own vector database? (Enter to convene, Shift+Enter for new line)"
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
              <span className="attach-hint">or paste / drag an image</span>
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
