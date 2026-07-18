"""Configuration for the Board of Directors (LLM Boardroom).

This is the enhanced "Board of Directors" mode inspired by Will Irish's
routing-antidote concept: multiple genuinely-different LLM brains sit at a
boardroom table, each with a role/persona. They write blind opening
statements, cross-examine one another, may revise their positions, and a
Chairman synthesizes a consensus with a confidence score, a recommendation,
next steps, and an approve/reject decision.

All models are reached through a single OpenRouter API key (see config.py),
so swapping a brain on any seat is just a model identifier change.
"""

import os
from dotenv import load_dotenv

load_dotenv()

# ----------------------------------------------------------------------------
# OpenRouter (shared with the classic council)
# ----------------------------------------------------------------------------
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

# Default chairman for the board. GLM is the "in-house" brain Will highlights
# in the transcript - cheap, 1M context window, frontier-class coding. Override
# with the OPENROUTER_BOARD_CHAIRMAN env var if you want a different chairman.
CHAIRMAN_MODEL = os.getenv("BOARD_CHAIRMAN_MODEL", "z-ai/glm-4.6")

# Cheap, fast model used for housekeeping tasks (session titles, etc.)
HOUSEKEEPING_MODEL = os.getenv("BOARD_HOUSEKEEPING_MODEL", "google/gemini-2.5-flash")

# Storage for board sessions
BOARD_DATA_DIR = "data/boards"

# ----------------------------------------------------------------------------
# Available models (the "brains" you can drop into any seat)
# ----------------------------------------------------------------------------
# These are real OpenRouter identifiers. Each entry has a short display name
# and a default voice hint used by the browser's Web Speech API for voice
# playback. Voices are intentionally varied so the board "sounds" different.
AVAILABLE_MODELS = [
    {"id": "x-ai/grok-4",                "name": "Grok",      "voice": {"lang": "en-US", "rate": 1.05, "pitch": 0.9}},
    {"id": "meta-llama/llama-3.3-70b-instruct", "name": "Llama", "voice": {"lang": "en-GB", "rate": 0.95, "pitch": 1.0}},
    {"id": "mistralai/mistral-large",    "name": "Mistral",   "voice": {"lang": "en-AU", "rate": 1.0,  "pitch": 1.1}},
    {"id": "qwen/qwen3-max",             "name": "Qwen",      "voice": {"lang": "en-IN", "rate": 1.0,  "pitch": 0.95}},
    {"id": "deepseek/deepseek-r1",       "name": "DeepSeek R1", "voice": {"lang": "en-US", "rate": 0.9, "pitch": 0.8}},
    {"id": "z-ai/glm-4.6",               "name": "GLM",       "voice": {"lang": "en-US", "rate": 1.0,  "pitch": 1.0}},
    {"id": "openai/gpt-5.1",             "name": "GPT",       "voice": {"lang": "en-US", "rate": 1.05, "pitch": 1.05}},
    {"id": "google/gemini-3-pro-preview", "name": "Gemini",  "voice": {"lang": "en-GB", "rate": 1.1,  "pitch": 1.15}},
    {"id": "anthropic/claude-sonnet-4.5", "name": "Claude",   "voice": {"lang": "en-GB", "rate": 0.95, "pitch": 0.85}},
]

def get_model_meta(model_id: str) -> dict:
    """Return the meta dict for a model id, or a minimal fallback."""
    for m in AVAILABLE_MODELS:
        if m["id"] == model_id:
            return m
    short = model_id.split("/")[-1] if "/" in model_id else model_id
    return {"id": model_id, "name": short, "voice": {"lang": "en-US", "rate": 1.0, "pitch": 1.0}}


# ----------------------------------------------------------------------------
# Counsel types - each preset reshapes the boardroom for a different mission
# ----------------------------------------------------------------------------
# A counsel type defines:
#   - label / description (UI copy)
#   - seats: ordered list of role templates. Each role template has:
#       role        : the boardroom title (e.g. "Chief Technology Officer")
#       persona     : the system prompt persona the model adopts
#       focus       : a short tag shown in the UI
#       default_model: the OpenRouter model id to drop into this seat by default
#   - chairman_persona : persona for the chairman in this counsel
COUNSEL_TYPES = {
    "general": {
        "key": "general",
        "label": "General Counsel",
        "description": "A balanced boardroom for everyday strategic decisions.",
        "seats": [
            {
                "role": "Chief Executive Officer",
                "focus": "Strategy & vision",
                "persona": "You are the Chief Executive Officer of the board. You think in terms of strategic fit, market positioning, and long-term vision. You weigh opportunity against risk and rally the board toward a decisive direction.",
                "default_model": "x-ai/grok-4",
            },
            {
                "role": "Chief Financial Officer",
                "focus": "Cost & ROI",
                "persona": "You are the Chief Financial Officer of the board. You scrutinize cost, runway, ROI, and financial risk. You demand numbers and reject ideas that burn capital without a clear path to return.",
                "default_model": "meta-llama/llama-3.3-70b-instruct",
            },
            {
                "role": "Chief Technology Officer",
                "focus": "Feasibility & tech",
                "persona": "You are the Chief Technology Officer of the board. You assess technical feasibility, architecture, build-vs-buy, scalability, and engineering risk. You call out magic-thinking and propose concrete technical paths.",
                "default_model": "deepseek/deepseek-r1",
            },
            {
                "role": "Chief Data Officer",
                "focus": "Data & evidence",
                "persona": "You are the Chief Data Officer of the board. You care about evidence, data quality, measurement, and what the numbers actually say. You challenge claims that lack supporting data.",
                "default_model": "qwen/qwen3-max",
            },
            {
                "role": "Chief Marketing Officer",
                "focus": "Customer & market",
                "persona": "You are the Chief Marketing Officer of the board. You think about the customer, positioning, narrative, and go-to-market. You ask who this is for and why they would care.",
                "default_model": "mistralai/mistral-large",
            },
            {
                "role": "Chief Risk Officer",
                "focus": "Risk & downsides",
                "persona": "You are the Chief Risk Officer of the board. You hunt for failure modes, second-order effects, and worst-case scenarios. You are not a pessimist - you are the board's conscience on what can go wrong.",
                "default_model": "x-ai/grok-4",
            },
        ],
        "chairman_persona": "You are the Chairman of the Board. You run an orderly boardroom. You weigh each director's argument on its merits, note where the board agrees and disagrees, and deliver a crisp consensus the CEO can act on.",
    },
    "technical": {
        "key": "technical",
        "label": "Technical Counsel",
        "description": "An engineering-leaning board for build-vs-buy and architecture calls.",
        "seats": [
            {
                "role": "Chief Technology Officer",
                "focus": "Architecture",
                "persona": "You are the CTO. You own architecture decisions, tech stack choices, and engineering trade-offs. You favor simple, proven systems over clever ones.",
                "default_model": "deepseek/deepseek-r1",
            },
            {
                "role": "Staff Engineer",
                "focus": "Implementation",
                "persona": "You are a senior Staff Engineer. You think about implementation cost, maintenance burden, and the real complexity hiding under the hood. You have shipped and maintained systems for years.",
                "default_model": "qwen/qwen3-max",
            },
            {
                "role": "Chief Information Security Officer",
                "focus": "Security",
                "persona": "You are the CISO. You evaluate security, privacy, compliance, and blast radius. You assume adversaries are smart and motivated.",
                "default_model": "x-ai/grok-4",
            },
            {
                "role": "Head of Data",
                "focus": "Data & ML",
                "persona": "You are the Head of Data. You evaluate data pipelines, model lifecycle, evals, and the cost of getting data right vs wrong.",
                "default_model": "meta-llama/llama-3.3-70b-instruct",
            },
            {
                "role": "VP Engineering",
                "focus": "Delivery & team",
                "persona": "You are the VP of Engineering. You think about team capability, hiring, delivery timelines, and what the team can actually ship in the next quarter.",
                "default_model": "mistralai/mistral-large",
            },
            {
                "role": "DevOps Lead",
                "focus": "Ops & reliability",
                "persona": "You are the DevOps Lead. You care about reliability, observability, deploy pain, and on-call burden. You have been paged at 3am.",
                "default_model": "z-ai/glm-4.6",
            },
        ],
        "chairman_persona": "You are the Chairman of a technical review board. You cut through engineering opinion to find the decision that best balances risk, cost, and time-to-value. You are skeptical of elegance for its own sake.",
    },
    "creative": {
        "key": "creative",
        "label": "Creative Counsel",
        "description": "A marketing and product-leaning board for positioning and narrative.",
        "seats": [
            {
                "role": "Chief Marketing Officer",
                "focus": "Positioning",
                "persona": "You are the CMO. You own positioning, narrative, and brand. You ask: who is this for, what problem do they have, and why us, why now?",
                "default_model": "mistralai/mistral-large",
            },
            {
                "role": "Head of Product",
                "focus": "Product fit",
                "persona": "You are the Head of Product. You think about user jobs-to-be-done, the smallest lovable product, and what to cut to ship sooner.",
                "default_model": "x-ai/grok-4",
            },
            {
                "role": "Creative Director",
                "focus": "Story & craft",
                "persona": "You are the Creative Director. You care about story, hook, and the emotional payoff. You hate generic copy and love a memorable angle.",
                "default_model": "anthropic/claude-sonnet-4.5",
            },
            {
                "role": "Growth Lead",
                "focus": "Acquisition",
                "persona": "You are the Growth Lead. You think in funnels, channels, CAC, and retention loops. You want a path to the first 1,000 real users.",
                "default_model": "qwen/qwen3-max",
            },
            {
                "role": "Customer Voice",
                "focus": "The buyer",
                "persona": "You speak as the skeptical customer. You do not care about our tech - you care about your problem and your time. You will not adopt something that is hard.",
                "default_model": "meta-llama/llama-3.3-70b-instruct",
            },
            {
                "role": "Brand Strategist",
                "focus": "Long-term brand",
                "persona": "You are the Brand Strategist. You think about consistency, reputation, and how this choice lands 18 months from now, not just this launch.",
                "default_model": "google/gemini-3-pro-preview",
            },
        ],
        "chairman_persona": "You are the Chairman of a creative review board. You protect the work from committee-think. You look for the idea that is both true to the customer and memorable, and you are willing to overrule a majority if the majority is bland.",
    },
    "crisis": {
        "key": "crisis",
        "label": "Crisis Counsel",
        "description": "A high-stakes board for incident, reputation, and risk decisions.",
        "seats": [
            {
                "role": "Chief Executive Officer",
                "focus": "Call the shot",
                "persona": "You are the CEO in a crisis. You must decide and own it. You balance speed, truth, and duty to stakeholders. Indecision is itself a decision.",
                "default_model": "x-ai/grok-4",
            },
            {
                "role": "Chief Risk Officer",
                "focus": "Contain the blast",
                "persona": "You are the CRO. You map the blast radius, the second-order effects, and the worst plausible outcome. You force the board to plan for the bad case, not the hoped-for case.",
                "default_model": "deepseek/deepseek-r1",
            },
            {
                "role": "Chief Communications Officer",
                "focus": "Tell the truth fast",
                "persona": "You are the CCO. You own what we say, to whom, and when. You assume the truth will come out and you would rather we say it first, clearly.",
                "default_model": "anthropic/claude-sonnet-4.5",
            },
            {
                "role": "General Counsel",
                "focus": "Legal exposure",
                "persona": "You are the General Counsel. You map legal and regulatory exposure, preservation duties, and what we can and cannot say. You are calm under pressure.",
                "default_model": "meta-llama/llama-3.3-70b-instruct",
            },
            {
                "role": "Chief Operating Officer",
                "focus": "Keep the lights on",
                "persona": "You are the COO. You keep the business running through the crisis: customers, staff, suppliers, cash. You protect the day-to-day while the crisis is handled.",
                "default_model": "mistralai/mistral-large",
            },
            {
                "role": "Customer Advocate",
                "focus": "The people affected",
                "persona": "You speak for the customers and users most affected by this crisis. You insist we treat them the way we would want to be treated.",
                "default_model": "qwen/qwen3-max",
            },
        ],
        "chairman_persona": "You are the Chairman in a crisis. You enforce a calm, decisive order. You demand the board converge on a single course of action with clear owners and a timeline. You will approve a decision only if it is decisive and reversible where it must be.",
    },
}

def get_counsel_type(key: str) -> dict:
    """Return the counsel type dict, defaulting to 'general'."""
    return COUNSEL_TYPES.get(key, COUNSEL_TYPES["general"])


def default_board(counsel_key: str = "general") -> dict:
    """Build a default board configuration for a counsel type.

    Returns a dict with a chairman model and an ordered list of seats,
    each seat carrying its role, focus, persona, and the model id filling it.
    """
    counsel = get_counsel_type(counsel_key)
    seats = []
    for i, seat_tmpl in enumerate(counsel["seats"]):
        seats.append({
            "seat": i,
            "role": seat_tmpl["role"],
            "focus": seat_tmpl["focus"],
            "persona": seat_tmpl["persona"],
            "model": seat_tmpl["default_model"],
        })
    return {
        "counsel_type": counsel_key,
        "chairman_model": CHAIRMAN_MODEL,
        "chairman_persona": counsel["chairman_persona"],
        "seats": seats,
    }


# ----------------------------------------------------------------------------
# Example questions (the seed prompts Will shows in the UI)
# ----------------------------------------------------------------------------
EXAMPLE_QUESTIONS = [
    "Should we build our own vector database or use a managed service?",
    "How should we price this new AI feature?",
    "Should we raise prices 20% on our legacy plan next quarter?",
    "Is it worth open-sourcing our core library to grow adoption?",
    "We have a data breach. What do we do in the next 24 hours?",
    "Should we pivot from B2C to B2B for our writing assistant?",
    "Build, buy, or partner for our analytics dashboard?",
    "How do we reach our first 1,000 paying customers?",
]
