"""Free, no-API-key web search for general_answer_agent."""

from ddgs import DDGS


def web_search(query: str, max_results: int = 5) -> str:
    try:
        results = DDGS().text(query, max_results=max_results)
    except Exception as exc:  # noqa: BLE001 - network/search failures shouldn't crash the turn
        return f"(web search unavailable: {exc})"

    if not results:
        return "(no web results found)"

    blocks = []
    for r in results:
        title = r.get("title", "")
        body = r.get("body", "")
        href = r.get("href", "")
        blocks.append(f"- {title}\n  {body}\n  source: {href}")
    return "\n".join(blocks)
