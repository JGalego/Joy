"""Delivery policy and claim model."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ClaimedDelivery:
    """A leased delivery attempt returned by the repository."""

    delivery_id: str
    endpoint: str
    payload: str
    idempotency_key: str
    attempt: int
    lease_until: float


@dataclass(frozen=True)
class DeliveryPolicy:
    """Lease duration and retry backoff settings."""

    lease_seconds: float = 5.0
    retry_base_seconds: float = 2.0
    retry_cap_seconds: float = 60.0

    def __post_init__(self) -> None:
        if self.lease_seconds <= 0:
            raise ValueError("lease_seconds must be positive")
        if self.retry_base_seconds <= 0:
            raise ValueError("retry_base_seconds must be positive")
        if self.retry_cap_seconds < self.retry_base_seconds:
            raise ValueError("retry_cap_seconds must not be smaller than retry_base_seconds")

    def next_retry_at(self, now: float, attempt: int) -> float:
        """Return the next eligible time using capped exponential backoff."""

        if attempt < 1:
            raise ValueError("attempt must be positive")
        # Compare the integer growth with the cap ratio before multiplying: after enough
        # attempts the growth no longer fits in a float, and retries must keep working.
        growth = 2 ** (attempt - 1)
        if growth >= self.retry_cap_seconds / self.retry_base_seconds:
            return now + self.retry_cap_seconds
        return now + self.retry_base_seconds * growth
