import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import './ChairmanConsensus.css';

/**
 * ChairmanConsensus - the Stage 4 output: the chairman's verdict.
 *
 * Renders the structured consensus: confidence dial, decision badge,
 * consensus text, recommendation, next steps, points of agreement /
 * disagreement, and the raw output (collapsible) for transparency.
 */
const DECISION_META = {
  APPROVE: { label: 'Approve', tone: 'approve' },
  'APPROVE WITH CONDITIONS': { label: 'Approve with Conditions', tone: 'conditions' },
  REJECT: { label: 'Reject', tone: 'reject' },
  'NO CONSENSUS': { label: 'No Consensus', tone: 'noconsensus' },
};

export default function ChairmanConsensus({ consensus, followup = false }) {
  const [showRaw, setShowRaw] = useState(false);
  if (!consensus) return null;

  const decision = DECISION_META[consensus.decision] || DECISION_META['NO CONSENSUS'];
  const confidence = typeof consensus.confidence === 'number' ? consensus.confidence : null;
  const scorers = consensus.confidence_scorers || [];
  const splitInfo = consensus.split_info || null;
  const triggerConditions = consensus.trigger_conditions || '';

  // Confidence tooltip: who scored it
  const scorerNames = scorers.map(s => s.split('/').pop()).join(' + ');
  const confidenceTitle = scorerNames
    ? `Convergence scored independently by ${scorerNames} — the Chair does not grade its own homework`
    : 'Board confidence in the consensus';

  return (
    <div className={`chairman-consensus ${decision.tone} ${followup ? 'followup' : ''}`}>
      <div className="cc-header">
        <div className="cc-title-row">
          <span className="cc-emblem">THE CHAIR</span>
          <h3>{followup ? "The Chair's Updated Decision" : "The Chair's Decision"}</h3>
          <span className="cc-brain">{shortModel(consensus.model)}</span>
        </div>
        <div className="cc-verdict-row">
          <div className={`decision-badge ${decision.tone}`}>{decision.label}</div>
          {splitInfo?.split && (
            <div className="split-badge" title={`${splitInfo.split_label} split — trigger conditions required`}>
              ⚡ {splitInfo.split_label} split
            </div>
          )}
          {confidence !== null && (
            <div className="confidence-dial" title={confidenceTitle}>
              <div className="confidence-ring">
                <svg width="48" height="48" viewBox="0 0 48 48">
                  <circle cx="24" cy="24" r="20" fill="none" stroke="#e6e6ea" strokeWidth="4" />
                  <circle
                    cx="24" cy="24" r="20" fill="none" stroke="currentColor"
                    strokeWidth="4" strokeLinecap="round"
                    strokeDasharray={`${(confidence / 100) * 125.66} 125.66`}
                    transform="rotate(-90 24 24)"
                  />
                </svg>
                <span className="confidence-num">{confidence}</span>
              </div>
              <span className="confidence-label">convergence</span>
              {scorers.length > 0 && (
                <span className="confidence-scorer-note" title={confidenceTitle}>not self-scored</span>
              )}
            </div>
          )}
        </div>
      </div>

      {consensus.consensus && (
        <div className="cc-section cc-consensus">
          <div className="cc-section-label">Consensus</div>
          <div className="markdown-content">
            <ReactMarkdown>{consensus.consensus}</ReactMarkdown>
          </div>
        </div>
      )}

      {consensus.recommendation && (
        <div className="cc-section cc-recommendation">
          <div className="cc-section-label">Recommendation</div>
          <div className="markdown-content">
            <ReactMarkdown>{consensus.recommendation}</ReactMarkdown>
          </div>
        </div>
      )}

      {consensus.next_steps && consensus.next_steps.length > 0 && (
        <div className="cc-section cc-next-steps">
          <div className="cc-section-label">Next Steps</div>
          <ol className="next-steps-list">
            {consensus.next_steps.map((step, i) => (
              <li key={i}><ReactMarkdown>{step}</ReactMarkdown></li>
            ))}
          </ol>
        </div>
      )}

      {triggerConditions && (
        <div className="cc-section cc-trigger">
          <div className="cc-section-label cc-section-label-trigger">⚡ Trigger Conditions — What Would Change This Decision</div>
          <div className="cc-trigger-body">{triggerConditions}</div>
        </div>
      )}

      <div className="cc-two-col">
        {consensus.points_of_agreement && consensus.points_of_agreement.length > 0 && (
          <div className="cc-section cc-agreement">
            <div className="cc-section-label">Points of Agreement</div>
            <ul className="cc-bullets agree">
              {consensus.points_of_agreement.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        )}
        {consensus.points_of_disagreement && consensus.points_of_disagreement.length > 0 && (
          <div className="cc-section cc-disagreement">
            <div className="cc-section-label">Points of Disagreement</div>
            <ul className="cc-bullets disagree">
              {consensus.points_of_disagreement.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="cc-raw-toggle">
        <button onClick={() => setShowRaw((v) => !v)}>
          {showRaw ? '− Hide raw chairman output' : '+ Show raw chairman output'}
        </button>
        {showRaw && (
          <pre className="cc-raw">{consensus.raw}</pre>
        )}
      </div>

      {consensus.failed && (
        <div className="cc-failed-note">
          The chairman could not be reached for this turn. Reconvene to try again.
        </div>
      )}
    </div>
  );
}

function shortModel(id) {
  if (!id) return '?';
  return id.split('/').pop() || id;
}
