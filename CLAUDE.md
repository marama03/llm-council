# CLAUDE.md - Technical Notes for LLM Council & Board of Directors

This file contains technical details, architectural decisions, and important implementation notes for future development sessions.

## Project Overview

The app ships **two modes** behind one FastAPI backend + one React frontend:

- **Board of Directors** (`backend/boardroom.py`, `backend/board_config.py`, `backend/board_storage.py`) — a 4-stage boardroom: blind openings → cross-examination → revised positions → chairman consensus. This is the "routing antidote" to AI psychosis: genuinely different LLM brains with roles/personas, not one model wearing many hats.
- **Classic Council** (`backend/council.py`, `backend/config.py`, `backend/storage.py`) — the original 3-stage Karpathy council: responses → anonymized peer rankings → chairman synthesis.

Both modes share one OpenRouter API key (`OPENROUTER_API_KEY` env var) and the same `backend/openrouter.py` client. The frontend switches between them via the top tab strip.

## Architecture

### Board of Directors (`backend/board_config.py`, `boardroom.py`, `board_storage.py`)

**`board_config.py`**
- `COUNSEL_TYPES`: 4 presets (general, technical, creative, crisis). Each defines an ordered list of seat templates (role + focus + persona + default_model) and a `chairman_persona`.
- `AVAILABLE_MODELS`: 9 OpenRouter model ids with display name + voice hint (for Web Speech API).
- `default_board(counsel_key)`: builds a board config (chairman model + ordered seats) for a counsel type.
- `CHAIRMAN_MODEL` (env `BOARD_CHAIRMAN_MODEL`, default `z-ai/glm-4.6`), `HOUSEKEEPING_MODEL` (env `BOARD_HOUSEKEEPING_MODEL`, default `google/gemini-2.5-flash` for session titles).
- `BOARD_DATA_DIR = "data/boards"`.

**`boardroom.py`** - The 4-stage orchestration
- `stage1_blind_openings()`: parallel queries to all seats; each seat gets ONLY its own system+user prompt (genuinely blind, no shared context). Returns `[{seat, role, focus, model, opening, failed}]`.
- `stage2_cross_examination()`: each seat reads ALL openings (deanonymized by role) and challenges the table. Returns `[{seat, role, model, cross, challenges, failed}]`. `challenges` is parsed via `_parse_challenges()` (regex for "Role: point" patterns).
- `stage3_revised_positions()`: each seat sees its own opening + the full cross-exam transcript; must emit a `STANCE: STRONGER|UNCHANGED|CONCEDED|FLIPPED` label on the first line. Returns `[{seat, role, model, revised_stance, revision, failed}]`. Stance parsed via `_parse_stance()`.
- `stage4_chairman_consensus()`: chairman gets openings (one-liners) + cross (one-liners) + FULL revised positions; must emit a structured output with exact section headers (CONSENSUS, CONFIDENCE, DECISION, RECOMMENDATION, NEXT STEPS, POINTS OF AGREEMENT, POINTS OF DISAGREEMENT). Parsed via `_parse_consensus()` into `{consensus, confidence (int 0-100), decision (enum), recommendation, next_steps[], points_of_agreement[], points_of_disagreement[]}`.
- `convene_board()`: runs all 4 stages in order, returns a full turn dict.
- `followup_turn()`: re-convenes the same board with a new question; directors answer with a compact prior-turn summary in context, then chairman re-synthesizes. Returns `(director_replies, consensus)`.
- `generate_board_title()`: short title via the housekeeping model.
- Graceful degradation: a failed model yields a placeholder opening/cross/revision and `failed: true`; the board continues with the directors who were present.

**`board_storage.py`**
- JSON storage in `data/boards/`. A session = `{id, created_at, title, counsel_type, board, turns[]}`.
- Each turn is either `{kind: "convene", question, stage1, stage2, stage3, stage4}` or `{kind: "followup", question, directors, chairman}`.

**Board API endpoints** (added to `backend/main.py`)
- `GET /api/board/counsel-types`, `GET /api/board/models`, `GET /api/board/examples` — static config for the UI.
- `GET/POST /api/board/sessions`, `GET/DELETE /api/board/sessions/{id}`, `PUT /api/board/sessions/{id}/board` — session CRUD + board config update.
- `POST /api/board/sessions/{id}/convene/stream` — SSE: `stage1_start` → `stage1_complete` → `stage2_*` → `stage3_*` → `stage4_*` → `title_complete` → `complete`.
- `POST /api/board/sessions/{id}/followup/stream` — SSE: `directors_start` → `directors_complete` → `chairman_start` → `chairman_complete` → `complete`.

### Frontend - Board of Directors (`frontend/src/components/`)
- `BoardroomApp.jsx` — top-level state: sessions list, current session, counsel types, models, examples; handles convene/followup SSE streams and board config updates.
- `BoardSidebar.jsx` — session list + new-session control with counsel-type dropdown.
- `BoardroomStage.jsx` — main pane: header strip (session name, counsel pill, voice controller, config toggle), board config panel (collapsible), convene area (question input + example chips), turns container, follow-up bar.
- `BoardConfigPanel.jsx` — the boardroom table: chairman seat + director seats, each with a model dropdown to swap the brain; persona expandable; counsel-type selector rebuilds seats (preserving same-index model swaps).
- `BoardTurn.jsx` — renders one turn: blind openings (director cards), cross-examination (tabbed, with extracted challenges), revised positions (stance-colored cards), chairman consensus. Also handles followup turns.
- `ChairmanConsensus.jsx` — Stage 4 verdict UI: confidence dial (SVG ring), decision badge, consensus/recommendation/next-steps, points of agreement/disagreement, raw output toggle.
- `VoiceController.jsx` — "Hear the board": uses `window.speechSynthesis` (Web Speech API) to read each director + chairman aloud with varied voice/rate/pitch per seat. Free, no API key. Play/pause/stop.
- `StageLoading.jsx` — pulse-ring loader shown while a stage streams.
- `CouncilApp.jsx` — wraps the original 3-stage council UI (Sidebar + ChatInterface) so it lives under the same mode switch.

### Classic Council (`backend/council.py`, `config.py`, `storage.py`)

### Backend Structure (`backend/`)

**`config.py`**
- Contains `COUNCIL_MODELS` (list of OpenRouter model identifiers)
- Contains `CHAIRMAN_MODEL` (model that synthesizes final answer)
- Uses environment variable `OPENROUTER_API_KEY` from `.env`
- Backend runs on **port 8001** (NOT 8000 - user had another app on 8000)

**`openrouter.py`**
- `query_model()`: Single async model query
- `query_models_parallel()`: Parallel queries using `asyncio.gather()`
- Returns dict with 'content' and optional 'reasoning_details'
- Graceful degradation: returns None on failure, continues with successful responses

**`council.py`** - The Core Logic
- `stage1_collect_responses()`: Parallel queries to all council models
- `stage2_collect_rankings()`:
  - Anonymizes responses as "Response A, B, C, etc."
  - Creates `label_to_model` mapping for de-anonymization
  - Prompts models to evaluate and rank (with strict format requirements)
  - Returns tuple: (rankings_list, label_to_model_dict)
  - Each ranking includes both raw text and `parsed_ranking` list
- `stage3_synthesize_final()`: Chairman synthesizes from all responses + rankings
- `parse_ranking_from_text()`: Extracts "FINAL RANKING:" section, handles both numbered lists and plain format
- `calculate_aggregate_rankings()`: Computes average rank position across all peer evaluations

**`storage.py`**
- JSON-based conversation storage in `data/conversations/`
- Each conversation: `{id, created_at, messages[]}`
- Assistant messages contain: `{role, stage1, stage2, stage3}`
- Note: metadata (label_to_model, aggregate_rankings) is NOT persisted to storage, only returned via API

**`main.py`**
- FastAPI app with CORS enabled for localhost:5173 and localhost:3000
- POST `/api/conversations/{id}/message` returns metadata in addition to stages
- Metadata includes: label_to_model mapping and aggregate_rankings

### Frontend Structure (`frontend/src/`)

**`App.jsx`**
- Main orchestration: manages conversations list and current conversation
- Handles message sending and metadata storage
- Important: metadata is stored in the UI state for display but not persisted to backend JSON

**`components/ChatInterface.jsx`**
- Multiline textarea (3 rows, resizable)
- Enter to send, Shift+Enter for new line
- User messages wrapped in markdown-content class for padding

**`components/Stage1.jsx`**
- Tab view of individual model responses
- ReactMarkdown rendering with markdown-content wrapper

**`components/Stage2.jsx`**
- **Critical Feature**: Tab view showing RAW evaluation text from each model
- De-anonymization happens CLIENT-SIDE for display (models receive anonymous labels)
- Shows "Extracted Ranking" below each evaluation so users can validate parsing
- Aggregate rankings shown with average position and vote count
- Explanatory text clarifies that boldface model names are for readability only

**`components/Stage3.jsx`**
- Final synthesized answer from chairman
- Green-tinted background (#f0fff0) to highlight conclusion

**Styling (`*.css`)**
- Light mode theme (not dark mode)
- Primary color: #4a90e2 (blue)
- Global markdown styling in `index.css` with `.markdown-content` class
- 12px padding on all markdown content to prevent cluttered appearance

## Key Design Decisions

### Board of Directors — why blind openings + cross-examination
The whole point is to break "AI psychosis": one model wearing many hats still has one set of blind spots. So Stage 1 fires every seat **in parallel with no shared context** — each director genuinely writes independently. Only in Stage 2 does each director see the others' openings and challenge them. Stage 3 lets a director concede or flip, which is the visible signal that the cross-exam moved the board. The Chairman (Stage 4) is a synthesizer, not a voter — it may overrule a majority.

### Board of Directors — structured chairman output
The Stage 4 prompt requires exact section headers (`CONSENSUS`, `CONFIDENCE`, `DECISION`, `RECOMMENDATION`, `NEXT STEPS`, `POINTS OF AGREEMENT`, `POINTS OF DISAGREEMENT`). `_parse_consensus()` uses regex with lookahead to the next known header, so it's tolerant of minor formatting variance. `DECISION` is normalized to one of `APPROVE` / `APPROVE WITH CONDITIONS` / `REJECT` / `NO CONSENSUS`. The UI renders a confidence dial (SVG ring) and a colored decision badge.

### Board of Directors — one API key, many brains
All models are reached through one OpenRouter API key (`OPENROUTER_API_KEY`). Swapping a brain on any seat is just a model-identifier change in the board config — no per-model API setup. This is the OpenRouter pattern Will highlights in the transcript.

### Board of Directors — voice playback is free
`VoiceController.jsx` uses `window.speechSynthesis` (Web Speech API), not a paid TTS API. Each seat gets a varied voice/rate/pitch hint so the board "sounds" different. No backend involvement.

### Board of Directors — follow-up turns
A follow-up skips the blind-openings stage. Each director gets a compact summary of the last prior turn (question + decision + consensus + recommendation) plus the new question, and answers in character. The Chairman then re-synthesizes. This keeps multi-turn board conversations coherent without re-running the full 4-stage ceremony.

### Classic Council — Stage 2 Prompt Format
The Stage 2 prompt is very specific to ensure parseable output:
```
1. Evaluate each response individually first
2. Provide "FINAL RANKING:" header
3. Numbered list format: "1. Response C", "2. Response A", etc.
4. No additional text after ranking section
```

This strict format allows reliable parsing while still getting thoughtful evaluations.

### De-anonymization Strategy
- Models receive: "Response A", "Response B", etc.
- Backend creates mapping: `{"Response A": "openai/gpt-5.1", ...}`
- Frontend displays model names in **bold** for readability
- Users see explanation that original evaluation used anonymous labels
- This prevents bias while maintaining transparency

### Error Handling Philosophy
- Continue with successful responses if some models fail (graceful degradation)
- Never fail the entire request due to single model failure
- Log errors but don't expose to user unless all models fail

### UI/UX Transparency
- All raw outputs are inspectable via tabs
- Parsed rankings shown below raw text for validation
- Users can verify system's interpretation of model outputs
- This builds trust and allows debugging of edge cases

## Important Implementation Details

### Relative Imports
All backend modules use relative imports (e.g., `from .config import ...`) not absolute imports. This is critical for Python's module system to work correctly when running as `python -m backend.main`.

### Port Configuration
- Backend: 8001 (changed from 8000 to avoid conflict)
- Frontend: 5173 (Vite default)
- Update both `backend/main.py` and `frontend/src/api.js` if changing

### Markdown Rendering
All ReactMarkdown components must be wrapped in `<div className="markdown-content">` for proper spacing. This class is defined globally in `index.css`.

### Model Configuration
Models are hardcoded in `backend/config.py`. Chairman can be same or different from council members. The current default is Gemini as chairman per user preference.

## Common Gotchas

1. **Module Import Errors**: Always run backend as `python -m backend.main` from project root, not from backend directory
2. **CORS Issues**: Frontend must match allowed origins in `main.py` CORS middleware
3. **Ranking Parse Failures**: If models don't follow format, fallback regex extracts any "Response X" patterns in order
4. **Missing Metadata**: Metadata is ephemeral (not persisted), only available in API responses

## Future Enhancement Ideas

- Configurable council/chairman via UI instead of config file
- Streaming responses instead of batch loading
- Export conversations to markdown/PDF
- Model performance analytics over time
- Custom ranking criteria (not just accuracy/insight)
- Support for reasoning models (o1, etc.) with special handling

## Testing Notes

Use `test_openrouter.py` to verify API connectivity and test different model identifiers before adding to council. The script tests both streaming and non-streaming modes.

## Data Flow Summary

```
User Query
    ↓
Stage 1: Parallel queries → [individual responses]
    ↓
Stage 2: Anonymize → Parallel ranking queries → [evaluations + parsed rankings]
    ↓
Aggregate Rankings Calculation → [sorted by avg position]
    ↓
Stage 3: Chairman synthesis with full context
    ↓
Return: {stage1, stage2, stage3, metadata}
    ↓
Frontend: Display with tabs + validation UI
```

The entire flow is async/parallel where possible to minimize latency.
