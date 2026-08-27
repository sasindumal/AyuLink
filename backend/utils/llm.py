"""Chat and embedding models. Provider is selected by config.LLM_PROVIDER
("lm_studio", "google", or "openrouter") — every call site elsewhere
imports text_llm, vision_llm, embed_texts()/embed_text() from here and
never touches the provider-specific classes directly, so switching
providers is a single .env change (LLM_PROVIDER) with no code changes
anywhere else.

All three implement LangChain's standard chat/embeddings interfaces
(invoke(), with_structured_output(), embed_documents()/embed_query()), so
callers built against ChatOpenAI's interface work unchanged against
ChatGoogleGenerativeAI too — including pdf_tools.py's OpenAI-style
image_url content blocks, which langchain-google-genai also accepts.
lm_studio and openrouter both use ChatOpenAI/OpenAIEmbeddings directly
since both expose an OpenAI-compatible API — only base_url/api_key/model
differ.
"""

from langchain_core.embeddings import Embeddings
from langchain_core.language_models.chat_models import BaseChatModel

from utils import config

text_llm: BaseChatModel
vision_llm: BaseChatModel
embedding_model: Embeddings

if config.LLM_PROVIDER == "google":
    from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings

    text_llm = ChatGoogleGenerativeAI(
        model=config.GOOGLE_MODEL,
        google_api_key=config.GOOGLE_API_KEY,
        temperature=0.2,
    )

    vision_llm = ChatGoogleGenerativeAI(
        model=config.GOOGLE_VISION_MODEL,
        google_api_key=config.GOOGLE_API_KEY,
        temperature=0.2,
    )

    embedding_model = GoogleGenerativeAIEmbeddings(
        model=config.GOOGLE_EMBEDDING_MODEL,
        google_api_key=config.GOOGLE_API_KEY,
    )

elif config.LLM_PROVIDER == "openrouter":
    from langchain_openai import ChatOpenAI, OpenAIEmbeddings

    text_llm = ChatOpenAI(
        base_url=config.OPENROUTER_BASE_URL,
        api_key=config.OPENROUTER_API_KEY,
        model=config.OPENROUTER_MODEL,
        temperature=0.2,
    )

    vision_llm = ChatOpenAI(
        base_url=config.OPENROUTER_BASE_URL,
        api_key=config.OPENROUTER_API_KEY,
        model=config.OPENROUTER_VISION_MODEL,
        temperature=0.2,
    )

    # OpenRouter's embedding support is limited to specific proxied models
    # (unlike its broad chat model catalog) — if OPENROUTER_EMBEDDING_MODEL
    # isn't actually available, embed_texts()/embed_text() below will raise
    # at call time; hybrid retrieval (neo4j_tools.py) already falls back to
    # CONTAINS-only matching when that happens.
    embedding_model = OpenAIEmbeddings(
        base_url=config.OPENROUTER_BASE_URL,
        api_key=config.OPENROUTER_API_KEY,
        model=config.OPENROUTER_EMBEDDING_MODEL,
        check_embedding_ctx_length=False,
    )

else:  # "lm_studio"
    from langchain_openai import ChatOpenAI, OpenAIEmbeddings

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


def streaming_llm() -> BaseChatModel:
    """A text_llm instance configured for token streaming."""
    return text_llm


def embed_texts(texts: list[str]) -> list[list[float]]:
    return embedding_model.embed_documents(texts)


def embed_text(text: str) -> list[float]:
    return embedding_model.embed_query(text)
