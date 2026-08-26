"""LM Studio-backed chat and embedding models (OpenAI-compatible endpoint)."""

from langchain_openai import ChatOpenAI, OpenAIEmbeddings

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

# Requires an embedding-capable model (e.g. nomic-embed-text, bge-small-en)
# to be loaded in LM Studio under LM_STUDIO_EMBEDDING_MODEL — it is a
# separate model slot from LM_STUDIO_MODEL/LM_STUDIO_VISION_MODEL.
embedding_model = OpenAIEmbeddings(
    base_url=config.LM_STUDIO_BASE_URL,
    api_key=config.LM_STUDIO_API_KEY,
    model=config.LM_STUDIO_EMBEDDING_MODEL,
    check_embedding_ctx_length=False,
)


def streaming_llm() -> ChatOpenAI:
    """A text_llm instance configured for token streaming."""
    return text_llm


def embed_texts(texts: list[str]) -> list[list[float]]:
    return embedding_model.embed_documents(texts)


def embed_text(text: str) -> list[float]:
    return embedding_model.embed_query(text)
