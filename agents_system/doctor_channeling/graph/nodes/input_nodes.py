"""normalise_input, pdf_to_images, image_to_summary, document_summarizer.

Three entry points converge here: typed text (messages already carries
the HumanMessage), PDF upload (pdf_bytes -> images/text -> a
HumanMessage summary), and image upload (image_bytes -> a HumanMessage
summary) — document_summarizer runs after either upload path, before
this node ever sees plain text for that turn.
"""

import base64

from langchain_core.messages import HumanMessage

from llm import text_llm
from state import GraphState
from tools.pdf_tools import describe_image, extract_pages


def normalise_input(state: GraphState) -> dict:
    """No LLM call — pure passthrough. Downstream nodes read state via
    .get() with defaults, so there is nothing to initialize here."""
    return {}


def pdf_to_images(state: GraphState) -> dict:
    pdf_bytes = state.get("pdf_bytes")
    if not pdf_bytes:
        return {}
    pages = extract_pages(pdf_bytes)
    text_parts = []
    image_summaries = []

    for page in pages:
        if page.text:
            text_parts.append(f"[Page {page.page_number}]\n{page.text}")
        else:
            try:
                description = describe_image(page.image_b64, "image/png")
                image_summaries.append(f"[Page {page.page_number} (image)]\n{description}")
            except Exception:  # noqa: BLE001 - no VLM loaded / unreachable, degrade gracefully
                image_summaries.append(
                    f"[Page {page.page_number} (image) — could not be read: no vision model available]"
                )

    combined = "\n\n".join(text_parts + image_summaries)
    if not combined.strip():
        combined = (
            "The uploaded report contains only image content I can't read yet — "
            "please describe your symptoms in your own words."
        )

    return {"messages": [HumanMessage(content=f"[Uploaded medical report]\n{combined}")]}


def image_to_summary(state: GraphState) -> dict:
    image_bytes = state.get("image_bytes")
    if not image_bytes:
        return {}

    mime = state.get("image_mime") or "image/jpeg"
    image_b64 = base64.b64encode(image_bytes).decode("ascii")

    try:
        description = describe_image(image_b64, mime)
    except Exception:  # noqa: BLE001 - no VLM loaded / unreachable, degrade gracefully
        description = (
            "The attached image contains content I can't read yet — "
            "please describe your symptoms in your own words."
        )

    return {"messages": [HumanMessage(content=f"[Uploaded medical report]\n{description}")]}


def document_summarizer(state: GraphState) -> dict:
    """Summarizes the raw extracted/described report content (already appended
    to messages by pdf_to_images) into a concise clinical summary."""
    last = state["messages"][-1]
    raw = getattr(last, "content", "")
    if not raw or "[Uploaded medical report]" not in str(raw):
        return {}

    prompt = (
        "Summarize the following medical report content into a short, plain-language "
        "summary of key findings, diagnoses, and symptoms mentioned. This is not a "
        "diagnosis, just a summary for triage purposes.\n\n" + str(raw)
    )
    response = text_llm.invoke([HumanMessage(content=prompt)])
    return {"messages": [HumanMessage(content=f"[Report summary]\n{response.content}")]}
