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

# Extended "reasoning"/"thinking" (extra chain-of-thought tokens a model
# generates before its real answer) is off everywhere on purpose — this
# agent's calls are all short classification/extraction/chat turns where
# that reasoning is pure token-and-latency overhead, not better answers.
# Measured live against openrouter/deepseek/deepseek-v4-flash-0731: with
# reasoning on, a trivial call spent 9 of 16 completion tokens on
# reasoning (34 total tokens, ~$7.5e-6); with it off, 0 reasoning tokens
# (20 total tokens, ~$6.9e-7) — a ~41% token cut and ~11x cost cut on
# that call alone. Only skip this for a provider/model that has no such
# switch at all (plain embedding calls, most local LM Studio chat models).
OPENAI_COMPATIBLE_NO_REASONING = {"reasoning": {"effort": "none"}}

if config.LLM_PROVIDER == "google":
    from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings

    # thinking_budget=0 disables Gemini's internal "thinking" tokens for
    # models that support turning it off entirely (2.5 Flash/Flash-Lite —
    # 2.5 Pro only allows a reduced budget, never fully off).
    text_llm = ChatGoogleGenerativeAI(
        model=config.GOOGLE_MODEL,
        google_api_key=config.GOOGLE_API_KEY,
        temperature=0.2,
        thinking_budget=0,
    )

    vision_llm = ChatGoogleGenerativeAI(
        model=config.GOOGLE_VISION_MODEL,
        google_api_key=config.GOOGLE_API_KEY,
        temperature=0.2,
        thinking_budget=0,
    )

    embedding_model = GoogleGenerativeAIEmbeddings(
        model=config.GOOGLE_EMBEDDING_MODEL,
        google_api_key=config.GOOGLE_API_KEY,
    )

elif config.LLM_PROVIDER == "openrouter":
    from langchain_openai import ChatOpenAI, OpenAIEmbeddings

    # OpenRouter's unified reasoning control — {"reasoning": {"effort":
    # "none"}} in the request body — works across every reasoning-capable
    # model it proxies, not just one vendor's API shape. Models that
    # mandate reasoning (reasoning.mandatory=true in OpenRouter's models
    # catalog) reject this; deepseek/deepseek-v4-flash-0731 (the default
    # here) is not one of them as of this writing.
    text_llm = ChatOpenAI(
        base_url=config.OPENROUTER_BASE_URL,
        api_key=config.OPENROUTER_API_KEY,
        model=config.OPENROUTER_MODEL,
        temperature=0.2,
        extra_body=OPENAI_COMPATIBLE_NO_REASONING,
    )

    vision_llm = ChatOpenAI(
        base_url=config.OPENROUTER_BASE_URL,
        api_key=config.OPENROUTER_API_KEY,
        model=config.OPENROUTER_VISION_MODEL,
        temperature=0.2,
        extra_body=OPENAI_COMPATIBLE_NO_REASONING,
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

    # Best-effort — whether this does anything depends entirely on which
    # model is loaded. Reasoning-capable local models served through an
    # OpenAI-compatible endpoint generally honor the same {"reasoning":
    # {"effort": "none"}} body field OpenRouter uses; a model with no
    # reasoning mode at all just ignores the unrecognized field.
    text_llm = ChatOpenAI(
        base_url=config.LM_STUDIO_BASE_URL,
        api_key=config.LM_STUDIO_API_KEY,
        model=config.LM_STUDIO_MODEL,
        temperature=0.2,
        extra_body=OPENAI_COMPATIBLE_NO_REASONING,
    )

    vision_llm = ChatOpenAI(
        base_url=config.LM_STUDIO_BASE_URL,
        api_key=config.LM_STUDIO_API_KEY,
        model=config.LM_STUDIO_VISION_MODEL,
        temperature=0.2,
        extra_body=OPENAI_COMPATIBLE_NO_REASONING,
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
