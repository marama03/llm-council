import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import BoardSidebar from './BoardSidebar';
import BoardroomStage from './BoardroomStage';
import './BoardroomApp.css';

/**
 * BoardroomApp - the "Board of Directors" experience.
 *
 * Left rail: list of board sessions + new-session control.
 * Main pane: boardroom stage - counsel selector, seat config, question input,
 * example chips, convene button, and the streamed 4-stage results with
 * cross-examination, revised positions, chairman consensus, voice playback,
 * download, and follow-up.
 */
export default function BoardroomApp() {
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [currentSession, setCurrentSession] = useState(null);

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

  const loadSessions = async () => {
    try {
      setSessions(await api.listBoardSessions());
    } catch (e) {
      console.error('Failed to list board sessions:', e);
    }
  };

  useEffect(() => {
    if (currentSessionId) {
      loadSession(currentSessionId);
    } else {
      setCurrentSession(null);
    }
  }, [currentSessionId]);

  const loadSession = async (id) => {
    try {
      setCurrentSession(await api.getBoardSession(id));
    } catch (e) {
      console.error('Failed to load board session:', e);
    }
  };

  // ---- Create a new board session with a chosen counsel type ----
  const handleNewSession = async (counselKey) => {
    try {
      const sess = await api.createBoardSession(counselKey, null);
      setSessions([
        {
          id: sess.id,
          created_at: sess.created_at,
          title: sess.title,
          counsel_type: sess.counsel_type,
          turn_count: 0,
        },
        ...sessions,
      ]);
      setCurrentSessionId(sess.id);
    } catch (e) {
      console.error('Failed to create board session:', e);
    }
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

  // ---- Convene the board (first turn) ----
  const handleConvene = async (question, attachments = []) => {
    if (!currentSessionId) return;
    setIsLoading(true);
    setError(null);

    // Optimistic: append an empty convene turn
    const newTurn = {
      kind: 'convene',
      question,
      stage1: null, stage2: null, stage3: null, stage4: null,
      loading: { stage1: false, stage2: false, stage3: false, stage4: false },
    };
    patchCurrentSession((prev) => ({ ...prev, turns: [...prev.turns, newTurn] }));

    try {
      await api.conveneStream(currentSessionId, question, (type, event) => {
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
            loadSessions();
            break;
          case 'complete':
            setIsLoading(false);
            loadSessions();
            // Reload to get the persisted turn with proper structure
            loadSession(currentSessionId);
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
      loading: { directors: false, chairman: false },
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

  const patchLastTurn = (fn) => {
    patchCurrentSession((prev) => {
      const turns = [...prev.turns];
      const last = turns[turns.length - 1];
      turns[turns.length - 1] = fn(last);
      return { ...prev, turns };
    });
  };

  // ---- Update the board configuration (e.g. swap a model on a seat or change counsel type) ----
  const handleUpdateBoard = async (newBoard) => {
    if (!currentSessionId) return;
    // Optimistically patch BOTH board AND session.counsel_type so the orange
    // header pill updates instantly when the user switches counsel type.
    patchCurrentSession((prev) => ({
      ...prev,
      board: newBoard,
      counsel_type: newBoard.counsel_type ?? prev.counsel_type,
    }));
    // Also update the sidebar session list entry for the active session.
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
    <div className="boardroom-app">
      <BoardSidebar
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={setCurrentSessionId}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        counselTypes={counselTypes}
      />
      <BoardroomStage
        session={currentSession}
        counselTypes={counselTypes}
        models={models}
        examples={examples}
        isLoading={isLoading}
        error={error}
        onConvene={handleConvene}
        onFollowup={handleFollowup}
        onUpdateBoard={handleUpdateBoard}
        onNewSession={handleNewSession}
      />
    </div>
  );
}
