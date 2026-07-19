import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import BoardSidebar from './BoardSidebar';
import BoardroomStage from './BoardroomStage';
import './BoardroomApp.css';

/**
 * BoardroomApp - the "Board of Directors" experience.
 *
 * Ghost-session fix: we no longer create a DB session when the user picks a
 * counsel type on the welcome screen. Instead we track a `pendingCounsel`
 * (just the counsel key string) and only call api.createBoardSession when the
 * user actually submits a question (handleConvene). This eliminates 0-turn
 * ghost sessions in the sidebar.
 */
export default function BoardroomApp() {
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [currentSession, setCurrentSession] = useState(null);

  // "Pending" counsel type — chosen on welcome screen but no session created yet
  const [pendingCounsel, setPendingCounsel] = useState(null);
  const [navOpen, setNavOpen] = useState(false);   // mobile drawer

  const [counselTypes, setCounselTypes] = useState([]);
  const [models, setModels] = useState([]);
  const [examples, setExamples] = useState([]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // ---- Load static config on mount ----
  useEffect(() => {
    (async () => {
      try {
        const [ct, m, ex] = await Promise.all([
          api.getCounselTypes(),
          api.getModels(),
          api.getExamples(),
        ]);
        setCounselTypes(ct);
        setModels(m);
        setExamples(ex);
      } catch (e) {
        setError(`Could not reach the backend at ${api.API_BASE}. Is it running?`);
      }
    })();
    loadSessions();
  }, []);

  useEffect(() => {
    if (currentSessionId) {
      loadSession(currentSessionId);
      setPendingCounsel(null); // clear pending when a real session is active
    } else {
      setCurrentSession(null);
    }
  }, [currentSessionId]);

  const loadSessions = async () => {
    try {
      const all = await api.listBoardSessions();
      // Filter out any 0-turn sessions that might have leaked previously
      setSessions(all.filter((s) => s.turn_count > 0));
    } catch (e) {
      console.error('Failed to list board sessions:', e);
    }
  };

  const loadSession = async (id) => {
    try {
      setCurrentSession(await api.getBoardSession(id));
    } catch (e) {
      console.error('Failed to load board session:', e);
    }
  };

  // ---- Logo click: return to home/welcome screen ----
  const handleGoHome = () => {
    setCurrentSessionId(null);
    setCurrentSession(null);
    setPendingCounsel(null);
  };

  // ---- Welcome screen: pick a counsel type (NO session created yet) ----
  const handlePickCounsel = (counselKey) => {
    setPendingCounsel(counselKey);
    setCurrentSessionId(null);
  };

  // ---- Sidebar: "+ Convene Board" also just picks a counsel type ----
  // The session is actually created only when the user submits a question.
  const handleNewSession = (counselKey) => {
    setPendingCounsel(counselKey);
    setCurrentSessionId(null);
  };

  const handleDeleteSession = async (id) => {
    try {
      await api.deleteBoardSession(id);
      setSessions(sessions.filter((s) => s.id !== id));
      if (currentSessionId === id) {
        setCurrentSessionId(null);
        setCurrentSession(null);
      }
    } catch (e) {
      console.error('Failed to delete board session:', e);
    }
  };

  // ---- Patch the latest turn in the current session (used during streaming) ----
  const patchCurrentSession = useCallback((fn) => {
    setCurrentSession((prev) => (prev ? fn(prev) : prev));
  }, []);

  const patchLastTurn = useCallback((fn) => {
    patchCurrentSession((prev) => {
      const turns = [...prev.turns];
      const last = turns[turns.length - 1];
      turns[turns.length - 1] = fn(last);
      return { ...prev, turns };
    });
  }, [patchCurrentSession]);

  // ---- Convene the board (first turn) ----
  // If there is no current session yet (pending counsel), create one now.
  const handleConvene = async (question, attachments = []) => {
    setIsLoading(true);
    setError(null);

    let sessionId = currentSessionId;

    // Lazy session creation — only happens when the user actually asks a question
    if (!sessionId) {
      const key = pendingCounsel || (counselTypes[0]?.key);
      if (!key) {
        setError('No counsel type selected.');
        setIsLoading(false);
        return;
      }
      try {
        const sess = await api.createBoardSession(key, null);
        sessionId = sess.id;
        setCurrentSessionId(sess.id);
        setCurrentSession(sess);
        // Don't add to sidebar list until it has turns — we add it after complete
      } catch (e) {
        setError('Failed to create board session.');
        setIsLoading(false);
        return;
      }
    }

    // Optimistic: append an empty convene turn
    const newTurn = {
      kind: 'convene',
      question,
      stage1: null, stage2: null, stage3: null, stage4: null,
      loading: { stage1: true, stage2: false, stage3: false, stage4: false },
    };
    patchCurrentSession((prev) => ({ ...prev, turns: [...(prev?.turns || []), newTurn] }));

    try {
      await api.conveneStream(sessionId, question, (type, event) => {
        switch (type) {
          case 'stage1_start':
            patchLastTurn((t) => ({ ...t, loading: { ...t.loading, stage1: true } }));
            break;
          case 'stage1_complete':
            patchLastTurn((t) => ({ ...t, stage1: event.data, loading: { ...t.loading, stage1: false } }));
            break;
          case 'stage2_start':
            patchLastTurn((t) => ({ ...t, loading: { ...t.loading, stage2: true } }));
            break;
          case 'stage2_complete':
            patchLastTurn((t) => ({ ...t, stage2: event.data, loading: { ...t.loading, stage2: false } }));
            break;
          case 'stage3_start':
            patchLastTurn((t) => ({ ...t, loading: { ...t.loading, stage3: true } }));
            break;
          case 'stage3_complete':
            patchLastTurn((t) => ({ ...t, stage3: event.data, loading: { ...t.loading, stage3: false } }));
            break;
          case 'stage4_start':
            patchLastTurn((t) => ({ ...t, loading: { ...t.loading, stage4: true } }));
            break;
          case 'stage4_complete':
            patchLastTurn((t) => ({ ...t, stage4: event.data, loading: { ...t.loading, stage4: false } }));
            break;
          case 'title_complete':
            patchCurrentSession((prev) => ({ ...prev, title: event.data.title }));
            break;
          case 'complete':
            setIsLoading(false);
            // Now add/refresh the session in the sidebar (it has turns now)
            loadSessions();
            loadSession(sessionId);
            break;
          case 'error':
            setError(event.message || 'The board could not convene.');
            setIsLoading(false);
            break;
          default:
            break;
        }
      }, attachments);
    } catch (e) {
      setError(e.message || 'The board could not convene.');
      setIsLoading(false);
    }
  };

  // ---- Follow-up turn ----
  const handleFollowup = async (question) => {
    if (!currentSessionId) return;
    setIsLoading(true);
    setError(null);

    const newTurn = {
      kind: 'followup',
      question,
      directors: null,
      chairman: null,
      loading: { directors: true, chairman: false },
    };
    patchCurrentSession((prev) => ({ ...prev, turns: [...prev.turns, newTurn] }));

    try {
      await api.followupStream(currentSessionId, question, (type, event) => {
        switch (type) {
          case 'directors_start':
            patchLastTurn((t) => ({ ...t, loading: { ...t.loading, directors: true } }));
            break;
          case 'directors_complete':
            patchLastTurn((t) => ({ ...t, directors: event.data, loading: { ...t.loading, directors: false } }));
            break;
          case 'chairman_start':
            patchLastTurn((t) => ({ ...t, loading: { ...t.loading, chairman: true } }));
            break;
          case 'chairman_complete':
            patchLastTurn((t) => ({ ...t, chairman: event.data, loading: { ...t.loading, chairman: false } }));
            break;
          case 'complete':
            setIsLoading(false);
            loadSessions();
            loadSession(currentSessionId);
            break;
          case 'error':
            setError(event.message || 'The follow-up failed.');
            setIsLoading(false);
            break;
          default:
            break;
        }
      });
    } catch (e) {
      setError(e.message || 'The follow-up failed.');
      setIsLoading(false);
    }
  };

  // ---- Update the board configuration ----
  const handleUpdateBoard = async (newBoard) => {
    if (!currentSessionId) return;
    patchCurrentSession((prev) => ({
      ...prev,
      board: newBoard,
      counsel_type: newBoard.counsel_type ?? prev.counsel_type,
    }));
    setSessions((prev) =>
      prev.map((s) =>
        s.id === currentSessionId
          ? { ...s, counsel_type: newBoard.counsel_type ?? s.counsel_type }
          : s
      )
    );
    try {
      await api.updateBoardConfig(currentSessionId, newBoard);
    } catch (e) {
      console.error('Failed to persist board config:', e);
    }
  };

  return (
    <div className={'boardroom-app' + (navOpen ? ' nav-open' : '')}>
      <button className="mobile-nav-toggle" onClick={() => setNavOpen((v) => !v)} title="Sessions">☰</button>
      <div className="nav-backdrop" onClick={() => setNavOpen(false)} />
      <BoardSidebar
        sessions={sessions}
        currentSessionId={currentSessionId}
        pendingCounsel={pendingCounsel}
        onSelectSession={(id) => { setCurrentSessionId(id); setNavOpen(false); }}
        onNewSession={(k) => { handleNewSession(k); setNavOpen(false); }}
        onDeleteSession={handleDeleteSession}
        onGoHome={() => { handleGoHome(); setNavOpen(false); }}
        counselTypes={counselTypes}
      />
      <BoardroomStage
        session={currentSession}
        pendingCounsel={pendingCounsel}
        counselTypes={counselTypes}
        models={models}
        examples={examples}
        isLoading={isLoading}
        error={error}
        onConvene={handleConvene}
        onFollowup={handleFollowup}
        onUpdateBoard={handleUpdateBoard}
        onPickCounsel={handlePickCounsel}
      />
    </div>
  );
}
