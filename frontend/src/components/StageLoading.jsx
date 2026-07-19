import './StageLoading.css';

/**
 * StageLoading - a centered "the board is working" indicator with a label
 * and sublabel, used while a stage streams in.
 */
export default function StageLoading({ label, sub }) {
  return (
    <div className="stage-loading">
      <div className="stage-loading-spinner">
        <div className="pulse-ring" />
        <div className="pulse-ring delay" />
        <div className="pulse-core" />
      </div>
      <div className="stage-loading-text">
        <div className="stage-loading-label">{label}</div>
        {sub && <div className="stage-loading-sub">{sub}</div>}
      </div>
    </div>
  );
}
