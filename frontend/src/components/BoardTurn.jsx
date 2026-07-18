import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import ChairmanConsensus from './ChairmanConsensus';
import StageLoading from './StageLoading';
import './BoardTurn.css';

/**
 * BoardTurn - renders one turn of a board session.
 *
 * A "convene" turn has stages 1-4:
 *   stage1 = blind openings
 *   stage2 = cross-examination
 *   stage3 = revised positions
 *   stage4 = chairman consensus
 *
 * A "followup" turn has:
 *   directors = each director's reply (with prior context)
 *   chairman = the chairman's consensus on the follow-up
 */
export default function BoardTurn({ turn, turnIndex, counselLabel }) {
  const isConvene = turn.kind === 'convene';

  if (isConvene) {
    return (
      <div className="board-turn">
        <div className="turn-banner">
          <span className="turn-num">Turn {turnIndex + 1}</span>
          <span className="turn-kind">Convene</span>
          <span className="turn-counsel">{counselLabel}</span>
        </div>
        <div className="turn-question">
          <span className="turn-question-label">The board was asked:</span>
          <div className="turn-question-text">{turn.question}</div>
        </div>

        {/* Stage 1: blind openings */}
        {turn.loading?.stage1 && !turn.stage1 && (
          <StageLoading label="Stage 1 · Blind opening statements" sub="Each director writes independently, no shared context." />
        )}
        {turn.stage1 && <BlindOpenings openings={turn.stage1} />}

        {/* Stage 2: cross-examination */}
        {turn.loading?.stage2 && !turn.stage2 && (
          <StageLoading label="Stage 2 · Cross-examination" sub="Each director challenges the others. The lawyer round." />
        )}
        {turn.stage2 && <CrossExamination cross={turn.stage2} />}

        {/* Stage 3: revised positions */}
        {turn.loading?.stage3 && !turn.stage3 && (
          <StageLoading label="Stage 3 · Revised positions" sub="Directors may stand firm, concede, or flip." />
        )}
        {turn.stage3 && <RevisedPositions revisions={turn.stage3} />}

        {/* Stage 4: chairman consensus */}
        {turn.loading?.stage4 && !turn.stage4 && (
          <StageLoading label="Stage 4 · Chairman's consensus" sub="The chairman synthesizes a decision." />
        )}
        {turn.stage4 && <ChairmanConsensus consensus={turn.stage4} />}
      </div>
    );
  }

  // Follow-up turn
  return (
    <div className="board-turn followup-turn">
      <div className="turn-banner">
        <span className="turn-num">Turn {turnIndex + 1}</span>
        <span className="turn-kind">Follow-up</span>
      </div>
      <div className="turn-question">
        <span className="turn-question-label">Follow-up question:</span>
        <div className="turn-question-text">{turn.question}</div>
      </div>

      {turn.loading?.directors && !turn.directors && (
        <StageLoading label="Directors re-convening" sub="Each director answers with the prior transcript in context." />
      )}
      {turn.directors && <FollowupReplies replies={turn.directors} />}

      {turn.loading?.chairman && !turn.chairman && (
        <StageLoading label="Chairman's updated consensus" />
      )}
      {turn.chairman && <ChairmanConsensus consensus={turn.chairman} followup />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage 1: Blind openings
// ---------------------------------------------------------------------------
function BlindOpenings({ openings }) {
  const [open, setOpen] = useState({});
  // Default: all open
  if (!openings || !openings.length) return null;
  const toggle = (i) => setOpen((o) => ({ ...o, [i]: o[i] === false ? true : false }));

  return (
    <div className="stage-block openings">
      <div className="stage-header">
        <h3>Round I · Blind Opening Statements</h3>
        <span className="stage-sub">Each director wrote independently. Zero shared context. Pure signal.</span>
      </div>
      <div className="director-cards">
        {openings.map((o, i) => {
          const isOpen = open[i] !== false;
          return (
            <div className={`director-card ${o.failed ? 'failed' : ''}`} key={i} data-seat={i}>
              <div className="director-card-head" onClick={() => toggle(i)}>
                <span className="dir-emblem">{shortRole(o.role)}</span>
                <div className="dir-info">
                  <div className="dir-role">{o.role}</div>
                  <div className="dir-focus">{o.focus}</div>
                </div>
                <span className="dir-brain">{shortModel(o.model)}</span>
                <span className="dir-toggle">{isOpen ? '▾' : '▸'}</span>
              </div>
              {isOpen && (
                <div className="director-card-body markdown-content">
                  <ReactMarkdown>{o.opening}</ReactMarkdown>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage 2: Cross-examination
// ---------------------------------------------------------------------------
function CrossExamination({ cross }) {
  const [active, setActive] = useState(0);
  if (!cross || !cross.length) return null;

  return (
    <div className="stage-block cross">
      <div className="stage-header">
        <h3>Round II · Cross-Examination</h3>
        <span className="stage-sub">Each director reads the full table and challenges the assumptions.</span>
      </div>

      <div className="cross-layout">
        <div className="cross-tabs">
          {cross.map((c, i) => (
            <button
              key={i}
              className={`cross-tab ${active === i ? 'active' : ''}`}
              onClick={() => setActive(i)}
            >
              <span className="cross-tab-role">{c.role}</span>
              <span className="cross-tab-brain">{shortModel(c.model)}</span>
            </button>
          ))}
        </div>
        <div className="cross-content">
          {cross[active].challenges?.length > 0 && (
            <div className="challenges">
              <div className="challenges-label">Extracted challenges:</div>
              <ul>
                {cross[active].challenges.map((ch, j) => (
                  <li key={j}>
                    <span className="ch-role">→ {ch.role}:</span>{' '}
                    <span className="ch-point">{ch.point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="cross-text markdown-content">
            <ReactMarkdown>{cross[active].cross}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage 3: Revised positions
// ---------------------------------------------------------------------------
function RevisedPositions({ revisions }) {
  if (!revisions || !revisions.length) return null;
  return (
    <div className="stage-block revisions">
      <div className="stage-header">
        <h3>Round III · Revised Positions</h3>
        <span className="stage-sub">Stand firm, concede, or flip. Every stance earns its label.</span>
      </div>
      <div className="revisions-grid">
        {revisions.map((r, i) => (
          <div className={`revision-card stance-${r.revised_stance.toLowerCase()}`} key={i}>
            <div className="revision-head">
              <span className="dir-emblem">{shortRole(r.role)}</span>
              <div className="dir-info">
                <div className="dir-role">{r.role}</div>
                <div className="dir-focus">{r.focus}</div>
              </div>
              <span className={`stance-badge stance-${r.revised_stance.toLowerCase()}`}>
                {r.revised_stance}
              </span>
            </div>
            <div className="revision-body markdown-content">
              <ReactMarkdown>{r.revision}</ReactMarkdown>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Follow-up: director replies
// ---------------------------------------------------------------------------
function FollowupReplies({ replies }) {
  const [active, setActive] = useState(0);
  if (!replies || !replies.length) return null;
  return (
    <div className="stage-block followup-replies">
      <div className="stage-header">
        <h3>Directors' Responses</h3>
        <span className="stage-sub">Re-convened with full prior transcript. Context intact.</span>
      </div>
      <div className="cross-layout">
        <div className="cross-tabs">
          {replies.map((r, i) => (
            <button
              key={i}
              className={`cross-tab ${active === i ? 'active' : ''}`}
              onClick={() => setActive(i)}
            >
              <span className="cross-tab-role">{r.role}</span>
              <span className="cross-tab-brain">{shortModel(r.model)}</span>
            </button>
          ))}
        </div>
        <div className="cross-content">
          <div className="cross-text markdown-content">
            <ReactMarkdown>{replies[active].reply}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function shortModel(id) {
  if (!id) return '?';
  return id.split('/').pop() || id;
}

// Two-letter initials for the emblem circle
function shortRole(role) {
  if (!role) return '??';
  const words = role.replace(/chief/i, '').trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return role.slice(0, 2).toUpperCase();
}
