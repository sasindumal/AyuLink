"""LM Studio-backed chat models (OpenAI-compatible endpoint)."""

from langchain_openai import ChatOpenAI

from utils import config

text_llm = ChatOpenAI(
    base_url=config.LM_STUDIO_BASE_URL,
    api_key=config.LM_STUDIO_API_KEY,
    model=config.LM_STUDIO_MODEL,
    temperature=0.2,
)

vision_llm = ChatOpenAI(
    base_url=config.LM_STUDIO_BASE_URL,
    api_key=config.LM_STUDIO_API_KEY,
    model=config.LM_STUDIO_VISION_MODEL,
    temperature=0.2,
)


def streaming_llm() -> ChatOpenAI:
    """A text_llm instance configured for token streaming."""
    return text_llm
