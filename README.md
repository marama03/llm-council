# LLM Council & Board of Directors

![llmcouncil](header.jpg)

This repo ships **two modes** behind one app, both powered by a single [OpenRouter](https://openrouter.ai/) API key:

- **Board of Directors** *(new)* — the "routing antidote" to AI psychosis. A boardroom of genuinely *different* LLM brains (Grok, Llama, Mistral, Qwen, DeepSeek R1, GLM, GPT, Gemini, Claude) sit at a table, each with a role and persona. They write **blind opening statements**, **cross-examine** one another, **revise their positions**, and a **Chairman** delivers a consensus with a **confidence score**, an **approve / reject decision**, a **recommendation**, and **next steps**.
- **Classic Council** *(original)* — instead of asking one LLM, group them into your "LLM Council". Your query goes to multiple LLMs, they review and rank each other's work (anonymized), and a Chairman LLM produces the final response.

Switch between the two modes with the tabs at the top of the app.

## Board of Directors — how it works

When you convene the board, four stages run in order and stream live to the UI:

1. **Stage 1 — Blind opening statements.** Each director writes their position independently, with *no* shared context. Different brains, different training, different blind spots — so you get genuinely independent takes, not one model wearing many hats.
2. **Stage 2 — Cross-examination.** Each director now reads everyone's opening and challenges the others (the "lawyer round"). The UI shows the extracted challenges per director.
3. **Stage 3 — Revised positions.** Each director takes a final stance — `STRONGER`, `UNCHANGED`, `CONCEDED`, or `FLIPPED` — after being cross-examined.
4. **Stage 4 — Chairman's consensus.** The Chairman synthesizes a structured verdict: `CONSENSUS`, `CONFIDENCE` (0–100), `DECISION` (`APPROVE` / `APPROVE WITH CONDITIONS` / `REJECT` / `NO CONSENSUS`), `RECOMMENDATION`, `NEXT STEPS`, `POINTS OF AGREEMENT`, `POINTS OF DISAGREEMENT`.

You can then **re-convene** the same board with a follow-up question — directors answer with the prior transcript in context and the Chairman updates the consensus.

### Counsel types (board presets)

- **General Counsel** — CEO, CFO, CTO, CDO, CMO, CRO. Balanced strategic decisions.
- **Technical Counsel** — CTO, Staff Engineer, CISO, Head of Data, VP Eng, DevOps Lead. Build-vs-buy and architecture calls.
- **Creative Counsel** — CMO, Head of Product, Creative Director, Growth Lead, Customer Voice, Brand Strategist. Positioning and narrative.
- **Crisis Counsel** — CEO, CRO, CCO, General Counsel, COO, Customer Advocate. High-stakes incident and reputation decisions.

### Swap any brain on any seat

Every seat (the Chairman included) has a model dropdown — drop in any of the 9 routed models. The change persists and is used on the next convene. One OpenRouter API key, every model, no per-model setup.

### Hear the board (voice)

Each director is read aloud with a different voice/rate/pitch using the browser's free Web Speech API (no API key, no cost). Play / pause / stop from the header.

## Classic Council — how it works

1. **Stage 1: First opinions**. The user query is given to all LLMs individually, and the responses are collected. The individual responses are shown in a "tab view", so that the user can inspect them all one by one.
2. **Stage 2: Review**. Each individual LLM is given the responses of the other LLMs. Under the hood, the LLM identities are anonymized so that the LLM can't play favorites when judging their outputs. The LLM is asked to rank them in accuracy and insight.
3. **Stage 3: Final response**. The designated Chairman of the LLM Council takes all of the model's responses and compiles them into a single final answer that is presented to the user.

## Vibe Code Alert

This project was 99% vibe coded as a fun Saturday hack because I wanted to explore and evaluate a number of LLMs side by side in the process of [reading books together with LLMs](https://x.com/karpathy/status/1990577951671509438). It's nice and useful to see multiple responses side by side, and also the cross-opinions of all LLMs on each other's outputs. I'm not going to support it in any way, it's provided here as is for other people's inspiration and I don't intend to improve it. Code is ephemeral now and libraries are over, ask your LLM to change it in whatever way you like.

## Setup

### 1. Install Dependencies

The project uses [uv](https://docs.astral.sh/uv/) for project management.

**Backend:**
```bash
uv sync
```

**Frontend:**
```bash
cd frontend
npm install
cd ..
```

### 2. Configure API Key

Create a `.env` file in the project root:

```bash
OPENROUTER_API_KEY=sk-or-v1-...
```

Get your API key at [openrouter.ai](https://openrouter.ai/). Make sure to purchase the credits you need, or sign up for automatic top up.

### 3. Configure Models

**Board of Directors:** pick your counsel type and swap any brain on any seat from the in-app board configuration panel (no code edits needed). Defaults are in `backend/board_config.py` — edit `COUNSEL_TYPES` to add your own board presets, or `AVAILABLE_MODELS` to add more routed models. The default chairman is GLM (`z-ai/glm-4.6`); override with the `BOARD_CHAIRMAN_MODEL` env var.

**Classic Council:** edit `backend/config.py` to customize the council:

```python
COUNCIL_MODELS = [
    "openai/gpt-5.1",
    "anthropic/claude-sonnet-4.5",
    "qwen/qwen3-max",
    "mistralai/mistral-large",
]

CHAIRMAN_MODEL = "z-ai/glm-4.6"
```

## Running the Application

**Option 1: Use the start script**
```bash
./start.sh
```

**Option 2: Run manually**

Terminal 1 (Backend):
```bash
uv run python -m backend.main
```

Terminal 2 (Frontend):
```bash
cd frontend
npm run dev
```

Then open http://localhost:5173 in your browser.

## Tech Stack

- **Backend:** FastAPI (Python 3.10+), async httpx, OpenRouter API
- **Frontend:** React + Vite, react-markdown for rendering
- **Storage:** JSON files in `data/conversations/`
- **Package Management:** uv for Python, npm for JavaScript
