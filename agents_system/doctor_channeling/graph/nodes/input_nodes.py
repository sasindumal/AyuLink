"""normalise_input, pdf_to_images, document_summarizer.

Two entry points converge here: typed text (messages already carries
the HumanMessage) and PDF upload (pdf_bytes -> images/text -> a
HumanMessage summary appended by document_summarizer before this
node ever runs for that turn).
"""

from langchain_core.messages import HumanMessage

from llm import text_llm, vision_llm
from state import GraphState
from tools.pdf_tools import extract_pages


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
                response = vision_llm.invoke(
                    [
                        HumanMessage(
                            content=[
                                {
                                    "type": "text",
                                    "text": "Describe the medically relevant content of this report page "
                                    "(findings, values, diagnoses, medications) in plain text.",
                                },
                                {
                                    "type": "image_url",
                                    "image_url": {"url": f"data:image/png;base64,{page.image_b64}"},
                                },
                            ]
                        )
                    ]
                )
                image_summaries.append(f"[Page {page.page_number} (image)]\n{response.content}")
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
