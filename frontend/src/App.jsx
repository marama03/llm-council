import { useState } from 'react';
import CouncilApp from './components/CouncilApp';
import BoardroomApp from './components/BoardroomApp';
import './App.css';

function App() {
  // Mode switch between the classic 3-stage Council and the Board of Directors.
  const [mode, setMode] = useState('boardroom'); // 'council' | 'boardroom'

  return (
    <div className="app">
      <div className="mode-switch">
        <button
          className={`mode-btn ${mode === 'boardroom' ? 'active' : ''}`}
          onClick={() => setMode('boardroom')}
          title="Board of Directors - blind openings, cross-examination, revised positions, chairman consensus"
        >
          The Council
        </button>
        <button
          className={`mode-btn ${mode === 'council' ? 'active' : ''}`}
          onClick={() => setMode('council')}
          title="Classic Council - responses, peer rankings, synthesis"
        >
          Classic Mode
        </button>
      </div>
      <div className="mode-content">
        {mode === 'boardroom' ? <BoardroomApp /> : <CouncilApp />}
      </div>
    </div>
  );
}

export default App;
