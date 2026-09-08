"""Webhook delivery loop with an explicit crash window."""

from __future__ import annotations

from enum import Enum
from typing import Protocol

from .model import DeliveryPolicy
from .repository import SqliteDeliveryRepository


class Transport(Protocol):
    def send(self, endpoint: str, payload: str, *, idempotency_key: str) -> None:
        """Deliver a payload, forwarding the stable idempotency key."""


class CrashAfterSend(RuntimeError):
    """Deterministic fault injection for the send-before-ack crash window."""


class LostLease(RuntimeError):
    """Raised when a stale worker tries to mutate a newer claim."""


class RunResult(str, Enum):
    IDLE = "idle"
    DELIVERED = "delivered"
    RETRY_SCHEDULED = "retry_scheduled"


class WebhookWorker:
    def __init__(
        self,
        repository: SqliteDeliveryRepository,
        transport: Transport,
        policy: DeliveryPolicy,
    ) -> None:
        self._repository = repository
        self._transport = transport
        self._policy = policy

    def run_once(self, *, now: float, crash_after_send: bool = False) -> RunResult:
        claim = self._repository.claim_due(now=now, lease_seconds=self._policy.lease_seconds)
        if claim is None:
            return RunResult.IDLE

        try:
            self._transport.send(
                claim.endpoint,
                claim.payload,
                idempotency_key=claim.idempotency_key,
            )
        except Exception as error:
            retry_at = self._policy.next_retry_at(now, claim.attempt)
            if not self._repository.mark_retry(claim, retry_at=retry_at, error=str(error)):
                raise LostLease(claim.delivery_id) from error
            return RunResult.RETRY_SCHEDULED

        if crash_after_send:
            raise CrashAfterSend("delivery succeeded before its local acknowledgement")

        if not self._repository.mark_delivered(claim, now=now):
            raise LostLease(claim.delivery_id)
        return RunResult.DELIVERED
