/**
 * API client for the LLM Council & Board of Directors backend.
 *
 * In dev (Vite) we use an EMPTY base so the browser fetches same-origin relative
 * URLs ("/api/..."); Vite's dev-server proxy (see vite.config.js) forwards
 * /api/* to the FastAPI backend on :8001. This avoids mixed-content errors
 * (https page -> http://localhost:8001) and CORS issues in the sandbox preview.
 * For a separate production deploy, set VITE_API_BASE to the backend's absolute
 * URL (e.g. "https://api.example.com") and the calls below will use it as-is.
 */
const API_BASE = (import.meta.env.VITE_API_BASE || '');

// ---------------------------------------------------------------------------
// Streaming helper (Server-Sent Events over fetch)
// ---------------------------------------------------------------------------
async function streamSSE(url, body, onEvent) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Stream request failed (${response.status}): ${text}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep partial line
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const event = JSON.parse(line.slice(6));
          onEvent(event.type, event);
        } catch (e) {
          console.error('Failed to parse SSE event:', e, line);
        }
      }
    }
  }
}

export const api = {
  API_BASE,

  // -------------------------------------------------------------------------
  // Classic Council
  // -------------------------------------------------------------------------
  async listConversations() {
    const r = await fetch(`${API_BASE}/api/conversations`);
    if (!r.ok) throw new Error('Failed to list conversations');
    return r.json();
  },
  async createConversation() {
    const r = await fetch(`${API_BASE}/api/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!r.ok) throw new Error('Failed to create conversation');
    return r.json();
  },
  async getConversation(id) {
    const r = await fetch(`${API_BASE}/api/conversations/${id}`);
    if (!r.ok) throw new Error('Failed to get conversation');
    return r.json();
  },
  async sendMessageStream(conversationId, content, onEvent) {
    return streamSSE(
      `${API_BASE}/api/conversations/${conversationId}/message/stream`,
      { content },
      onEvent
    );
  },

  // -------------------------------------------------------------------------
  // Board of Directors - config
  // -------------------------------------------------------------------------
  async getCounselTypes() {
    const r = await fetch(`${API_BASE}/api/board/counsel-types`);
    if (!r.ok) throw new Error('Failed to load counsel types');
    const data = await r.json();
    return data.counsel_types;
  },
  async getModels() {
    const r = await fetch(`${API_BASE}/api/board/models`);
    if (!r.ok) throw new Error('Failed to load models');
    const data = await r.json();
    return data.models;
  },
  async getExamples() {
    const r = await fetch(`${API_BASE}/api/board/examples`);
    if (!r.ok) throw new Error('Failed to load examples');
    const data = await r.json();
    return data.examples;
  },

  // -------------------------------------------------------------------------
  // Board of Directors - sessions
  // -------------------------------------------------------------------------
  async listBoardSessions() {
    const r = await fetch(`${API_BASE}/api/board/sessions`);
    if (!r.ok) throw new Error('Failed to list board sessions');
    return r.json();
  },
  async createBoardSession(counselType, board) {
    const r = await fetch(`${API_BASE}/api/board/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ counsel_type: counselType, board: board || null }),
    });
    if (!r.ok) throw new Error('Failed to create board session');
    return r.json();
  },
  async getBoardSession(id) {
    const r = await fetch(`${API_BASE}/api/board/sessions/${id}`);
    if (!r.ok) throw new Error('Failed to load board session');
    return r.json();
  },
  async deleteBoardSession(id) {
    const r = await fetch(`${API_BASE}/api/board/sessions/${id}`, {
      method: 'DELETE',
    });
    if (!r.ok) throw new Error('Failed to delete board session');
    return r.json();
  },
  async updateBoardConfig(sessionId, board) {
    const r = await fetch(`${API_BASE}/api/board/sessions/${sessionId}/board`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(board),
    });
    if (!r.ok) throw new Error('Failed to update board config');
    return r.json();
  },

  // -------------------------------------------------------------------------
  // Board of Directors - convene & follow-up (streaming)
  // -------------------------------------------------------------------------
  async conveneStream(sessionId, question, onEvent) {
    return streamSSE(
      `${API_BASE}/api/board/sessions/${sessionId}/convene/stream`,
      { question },
      onEvent
    );
  },
  async followupStream(sessionId, question, onEvent) {
    return streamSSE(
      `${API_BASE}/api/board/sessions/${sessionId}/followup/stream`,
      { question },
      onEvent
    );
  },
};
