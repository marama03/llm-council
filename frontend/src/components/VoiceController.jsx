import { useState, useEffect, useRef, useCallback } from 'react';
import './VoiceController.css';

/**
 * VoiceController - "talk to the board, hear the board".
 *
 * Uses the browser's free Web Speech API (window.speechSynthesis) so each
 * director can be read aloud with a different voice/rate/pitch, matching the
 * "different voices" feature Will describes in the transcript. No API key,
 * no cost - the browser does all the synthesis locally.
 *
 * It scans the current session's latest turn for director text (openings for
 * a convene turn, replies for a follow-up) and the chairman's consensus, and
 * plays them in order, assigning each seat its voice hint from board_config.
 */
export default function VoiceController({ session }) {
  const [supported, setSupported] = useState(false);
  const [voices, setVoices] = useState([]);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [currentLabel, setCurrentLabel] = useState('');
  const queueRef = useRef([]);
  const idxRef = useRef(0);
  const stopRef = useRef(false);

  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    setSupported(true);

    const loadVoices = () => setVoices(synth.getVoices());
    loadVoices();
    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = loadVoices;
    }
    return () => {
      stopRef.current = true;
      try { synth.cancel(); } catch {}
    };
  }, []);

  const pickVoice = useCallback(
    (hint) => {
      if (!voices.length) return null;
      const lang = hint?.lang || 'en-US';
      // Prefer an exact lang match, then a prefix match, then anything English.
      const exact = voices.find((v) => v.lang === lang);
      if (exact) return exact;
      const prefix = voices.find((v) => v.lang?.startsWith(lang.split('-')[0]));
      if (prefix) return prefix;
      const anyEn = voices.find((v) => v.lang?.toLowerCase().startsWith('en'));
      return anyEn || voices[0];
    },
    [voices]
  );

  const speakOne = useCallback(
    (item, onDone) => {
      const synth = window.speechSynthesis;
      if (stopRef.current) return onDone();
      const utter = new SpeechSynthesisUtterance(item.text);
      const voice = pickVoice(item.hint);
      if (voice) utter.voice = voice;
      utter.rate = item.hint?.rate ?? 1.0;
      utter.pitch = item.hint?.pitch ?? 1.0;
      utter.lang = item.hint?.lang || 'en-US';
      utter.onend = () => onDone();
      utter.onerror = () => onDone();
      setCurrentLabel(item.label);
      synth.speak(utter);
    },
    [pickVoice]
  );

  const drainQueue = useCallback(() => {
    const synth = window.speechSynthesis;
    if (stopRef.current) {
      setSpeaking(false);
      setPaused(false);
      setCurrentLabel('');
      return;
    }
    if (idxRef.current >= queueRef.current.length) {
      setSpeaking(false);
      setPaused(false);
      setCurrentLabel('');
      return;
    }
    const item = queueRef.current[idxRef.current];
    idxRef.current += 1;
    speakOne(item, () => {
      // small pause between speakers
      setTimeout(drainQueue, 250);
    });
  }, [speakOne]);

  const buildQueue = useCallback(() => {
    if (!session || !session.turns || !session.turns.length) return [];
    const lastTurn = session.turns[session.turns.length - 1];
    const board = session.board || {};
    const seats = board.seats || [];
    const findSeat = (seatIdx) => seats.find((s) => s.seat === seatIdx);
    const findModel = (modelId) => {
      // we only have model id; voice hint comes from the seat's model meta on
      // the backend. As a fallback we vary by seat index so voices still differ.
      return null;
    };

    const q = [];
    if (lastTurn.kind === 'convene') {
      (lastTurn.stage1 || []).forEach((o) => {
        const seat = findSeat(o.seat);
        const hint = seatVoice(seat, o.seat);
        q.push({
          label: `${o.role} (opening)`,
          text: stripMd(o.opening),
          hint,
        });
      });
      if (lastTurn.stage4 && lastTurn.stage4.consensus) {
        q.push({
          label: 'Chairman (consensus)',
          text: stripMd(lastTurn.stage4.consensus),
          hint: { lang: 'en-GB', rate: 0.95, pitch: 0.85 },
        });
      }
    } else {
      (lastTurn.directors || []).forEach((d, i) => {
        const seat = findSeat(d.seat);
        const hint = seatVoice(seat, d.seat);
        q.push({
          label: `${d.role} (reply)`,
          text: stripMd(d.reply),
          hint,
        });
      });
      if (lastTurn.chairman && lastTurn.chairman.consensus) {
        q.push({
          label: 'Chairman (consensus)',
          text: stripMd(lastTurn.chairman.consensus),
          hint: { lang: 'en-GB', rate: 0.95, pitch: 0.85 },
        });
      }
    }
    return q.slice(0, 12); // cap for sanity
  }, [session]);

  const handlePlay = () => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (speaking && paused) {
      synth.resume();
      setPaused(false);
      return;
    }
    if (speaking) {
      // restart from current
      stopRef.current = true;
      synth.cancel();
    }
    const q = buildQueue();
    if (!q.length) return;
    stopRef.current = false;
    queueRef.current = q;
    idxRef.current = 0;
    setSpeaking(true);
    setPaused(false);
    drainQueue();
  };

  const handlePause = () => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.pause();
    setPaused(true);
  };

  const handleStop = () => {
    const synth = window.speechSynthesis;
    stopRef.current = true;
    try { synth.cancel(); } catch {}
    setSpeaking(false);
    setPaused(false);
    setCurrentLabel('');
  };

  if (!supported) {
    return <span className="voice-unsupported" title="Your browser does not support speech synthesis.">voice off</span>;
  }

  return (
    <div className="voice-controller">
      {speaking ? (
        <>
          {paused ? (
            <button className="vc-btn" onClick={handlePlay} title="Resume">▶</button>
          ) : (
            <button className="vc-btn" onClick={handlePause} title="Pause">⏸</button>
          )}
          <button className="vc-btn" onClick={handleStop} title="Stop">⏹</button>
          <span className="vc-now" title={currentLabel}>
            <span className="vc-dot" /> {truncate(currentLabel, 26)}
          </span>
        </>
      ) : (
        <button className="vc-play" onClick={handlePlay} title="Hear the board read aloud">
          ♪ Hear the board
        </button>
      )}
    </div>
  );
}

// --- helpers ---

// Map a seat to a varied voice hint. We vary by seat index so that even
// without per-model voice metadata from the backend, each director sounds
// different. The chairman uses a steadier "board leader" voice.
function seatVoice(seat, seatIdx) {
  const palette = [
    { lang: 'en-US', rate: 1.05, pitch: 0.9 },
    { lang: 'en-GB', rate: 0.95, pitch: 1.0 },
    { lang: 'en-AU', rate: 1.0, pitch: 1.1 },
    { lang: 'en-IN', rate: 1.0, pitch: 0.95 },
    { lang: 'en-US', rate: 0.9, pitch: 0.8 },
    { lang: 'en-GB', rate: 1.1, pitch: 1.15 },
  ];
  return palette[seatIdx % palette.length];
}

// Strip markdown to something readable by TTS.
function stripMd(text) {
  if (!text) return '';
  return String(text)
    .replace(/^#{1,6}\s+/gm, '')          // headings
    .replace(/\*\*([^*]+)\*\*/g, '$1')    // bold
    .replace(/\*([^*]+)\*/g, '$1')        // italic
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')          // code
    .replace(/^\s*[-*+]\s+/gm, '')        // bullets
    .replace(/^\s*\d+\.\s+/gm, '')        // numbered
    .replace(/^\s*>\s+/gm, '')            // blockquote
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1') // links
    .replace(/^STANCE:\s*.*$/m, '')       // stance label
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
