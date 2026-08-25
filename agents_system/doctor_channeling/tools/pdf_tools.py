"""Hybrid PDF ingestion: PyMuPDF text extraction per page, falling back
to a rendered PNG (base64) for pages with too little extractable text
(scanned/image-only pages), for the VLM step in document_summarizer."""

import base64

import pymupdf as fitz

from llm import vision_llm

MIN_TEXT_CHARS = 40

IMAGE_DESCRIBE_PROMPT = (
    "Describe the medically relevant content of this image (findings, values, "
    "diagnoses, medications, visible symptoms) in plain text."
)


def describe_image(image_b64: str, mime: str = "image/png") -> str:
    """Sends a base64-encoded image to the vision-capable LLM and returns its
    description. Raises on failure — callers decide the user-facing fallback."""
    response = vision_llm.invoke(
        [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": IMAGE_DESCRIBE_PROMPT},
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{image_b64}"}},
                ],
            }
        ]
    )
    return str(response.content)


class PageContent:
    def __init__(self, page_number: int, text: str | None, image_b64: str | None):
        self.page_number = page_number
        self.text = text
        self.image_b64 = image_b64


def extract_pages(pdf_bytes: bytes) -> list[PageContent]:
    pages: list[PageContent] = []
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        for i, page in enumerate(doc):
            text = page.get_text().strip()
            if len(text) >= MIN_TEXT_CHARS:
                pages.append(PageContent(i + 1, text, None))
            else:
                pixmap = page.get_pixmap(dpi=150)
                image_b64 = base64.b64encode(pixmap.tobytes("png")).decode("ascii")
                pages.append(PageContent(i + 1, None, image_b64))
    finally:
        doc.close()
    return pages
