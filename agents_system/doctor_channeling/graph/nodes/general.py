"""general_answer_agent — answers non-clinical questions, using free web
search when the question looks like it needs current/external info."""

import re

from langchain_core.messages import AIMessage

from llm import text_llm
from state import GraphState
from tools.web_search_tool import web_search

_NEEDS_SEARCH = re.compile(
    r"\b(latest|current|today|news|price|weather|when is|who is|what is the|202[4-9])\b",
    re.IGNORECASE,
)


def general_answer_agent(state: GraphState) -> dict:
    last_message = state["messages"][-1]
    question = str(getattr(last_message, "content", ""))

    context = ""
    if _NEEDS_SEARCH.search(question):
        context = web_search(question)

    system = (
        "You are AyuLink's friendly assistant for a healthcare appointment app. "
        "Answer helpfully and concisely. You are not a doctor — never give a "
        "medical diagnosis; suggest the user describe symptoms if they want "
        "clinical help."
    )
    if context:
        system += f"\n\nRelevant web search results:\n{context}"

    response = text_llm.invoke([{"role": "system", "content": system}, {"role": "user", "content": question}])
    return {"messages": [AIMessage(content=response.content)]}
