"""Postgres-backed LangGraph checkpointer (survives server restarts).

Must point at a session-mode connection (direct 5432, or Supavisor
session pooler) — the transaction-mode pooler doesn't support the
server-side prepared statements AsyncPostgresSaver relies on.
"""

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg_pool import AsyncConnectionPool

from utils import config

_pool: AsyncConnectionPool | None = None
_checkpointer: AsyncPostgresSaver | None = None


async def init_checkpointer() -> AsyncPostgresSaver:
    global _pool, _checkpointer
    if _checkpointer is not None:
        return _checkpointer

    _pool = AsyncConnectionPool(
        conninfo=config.AGENTS_CHECKPOINT_DATABASE_URL,
        kwargs={"autocommit": True, "prepare_threshold": None},
        open=False,
        # Supabase's pooler silently closes idle backend connections; without
        # a liveness check the pool hands out a dead connection and the
        # in-flight request fails instead of transparently reconnecting.
        check=AsyncConnectionPool.check_connection,
        max_idle=120,
    )
    await _pool.open()
    _checkpointer = AsyncPostgresSaver(_pool)
    await _checkpointer.setup()
    return _checkpointer


async def close_checkpointer() -> None:
    global _pool, _checkpointer
    if _pool is not None:
        await _pool.close()
    _pool = None
    _checkpointer = None
