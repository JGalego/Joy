"""SQLite persistence for leased webhook deliveries."""

from __future__ import annotations

import sqlite3
from typing import Optional

from .model import ClaimedDelivery


SCHEMA = """
CREATE TABLE IF NOT EXISTS deliveries (
    delivery_id TEXT PRIMARY KEY,
    endpoint TEXT NOT NULL,
    payload TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    state TEXT NOT NULL CHECK (state IN ('pending', 'sending', 'delivered')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at REAL NOT NULL,
    lease_until REAL,
    delivered_at REAL,
    last_error TEXT
);
"""


class SqliteDeliveryRepository:
    """Store and lease deliveries without holding a transaction during I/O."""

    def __init__(self, connection: sqlite3.Connection) -> None:
        self._connection = connection
        self._connection.row_factory = sqlite3.Row

    def initialize(self) -> None:
        self._connection.executescript(SCHEMA)

    def enqueue(
        self,
        delivery_id: str,
        endpoint: str,
        payload: str,
        idempotency_key: str,
        *,
        now: float,
    ) -> None:
        with self._connection:
            self._connection.execute(
                """
                INSERT INTO deliveries (
                    delivery_id, endpoint, payload, idempotency_key, state, next_attempt_at
                ) VALUES (?, ?, ?, ?, 'pending', ?)
                """,
                (delivery_id, endpoint, payload, idempotency_key, now),
            )

    def claim_due(self, *, now: float, lease_seconds: float) -> Optional[ClaimedDelivery]:
        """Lease due work; an expired sending lease is intentionally eligible again."""

        self._connection.execute("BEGIN IMMEDIATE")
        try:
            row = self._connection.execute(
                """
                SELECT delivery_id, endpoint, payload, idempotency_key, attempts
                FROM deliveries
                WHERE (state = 'pending' AND next_attempt_at <= ?)
                   OR (state = 'sending' AND lease_until <= ?)
                ORDER BY next_attempt_at, delivery_id
                LIMIT 1
                """,
                (now, now),
            ).fetchone()
            if row is None:
                self._connection.commit()
                return None

            attempt = int(row["attempts"]) + 1
            lease_until = now + lease_seconds
            self._connection.execute(
                """
                UPDATE deliveries
                SET state = 'sending', attempts = ?, lease_until = ?, last_error = NULL
                WHERE delivery_id = ?
                """,
                (attempt, lease_until, row["delivery_id"]),
            )
            self._connection.commit()
        except BaseException:
            self._connection.rollback()
            raise

        return ClaimedDelivery(
            delivery_id=str(row["delivery_id"]),
            endpoint=str(row["endpoint"]),
            payload=str(row["payload"]),
            idempotency_key=str(row["idempotency_key"]),
            attempt=attempt,
            lease_until=lease_until,
        )

    def mark_delivered(self, claim: ClaimedDelivery, *, now: float) -> bool:
        """Acknowledge only if this worker still owns the current claim generation."""

        with self._connection:
            result = self._connection.execute(
                """
                UPDATE deliveries
                SET state = 'delivered', delivered_at = ?, lease_until = NULL
                WHERE delivery_id = ? AND state = 'sending' AND attempts = ?
                """,
                (now, claim.delivery_id, claim.attempt),
            )
        return result.rowcount == 1

    def mark_retry(self, claim: ClaimedDelivery, *, retry_at: float, error: str) -> bool:
        """Release a failed claim only if a newer worker has not reclaimed it."""

        with self._connection:
            result = self._connection.execute(
                """
                UPDATE deliveries
                SET state = 'pending', next_attempt_at = ?, lease_until = NULL, last_error = ?
                WHERE delivery_id = ? AND state = 'sending' AND attempts = ?
                """,
                (retry_at, error, claim.delivery_id, claim.attempt),
            )
        return result.rowcount == 1

    def state(self, delivery_id: str) -> str:
        row = self._connection.execute(
            "SELECT state FROM deliveries WHERE delivery_id = ?",
            (delivery_id,),
        ).fetchone()
        if row is None:
            raise KeyError(delivery_id)
        return str(row["state"])
