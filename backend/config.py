"""Configuration for the LLM Council."""

import os
from dotenv import load_dotenv

load_dotenv()

# OpenRouter API key
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

# Council members - list of OpenRouter model identifiers.
# All four probed live against OpenRouter. Dead slugs removed.
COUNCIL_MODELS = [
    "openai/gpt-5.1",
    "anthropic/claude-sonnet-4.5",
    "qwen/qwen3-max",
    "mistralai/mistral-large",
]

# Chairman model - synthesizes final response
CHAIRMAN_MODEL = "z-ai/glm-4.6"

# OpenRouter API endpoint
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

# Data directory for conversation storage
DATA_DIR = "data/conversations"
