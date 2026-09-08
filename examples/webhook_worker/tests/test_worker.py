"""Executable proof for the webhook worker's failure boundaries."""

from __future__ import annotations

import sqlite3
import unittest

from examples.webhook_worker import (
    CrashAfterSend,
    DeliveryPolicy,
    RunResult,
    SqliteDeliveryRepository,
    WebhookWorker,
)


class DeduplicatingTransport:
    """A receiver that records attempts but applies each idempotency key once."""

    def __init__(self, *, failures: int = 0) -> None:
        self.failures = failures
        self.attempts: list[str] = []
        self.effects: list[str] = []
        self._accepted_keys: set[str] = set()

    def send(self, endpoint: str, payload: str, *, idempotency_key: str) -> None:
        del endpoint
        self.attempts.append(idempotency_key)
        if self.failures:
            self.failures -= 1
            raise ConnectionError("receiver unavailable")
        if idempotency_key not in self._accepted_keys:
            self._accepted_keys.add(idempotency_key)
            self.effects.append(payload)


class WebhookWorkerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.connection = sqlite3.connect(":memory:", isolation_level=None)
        self.repository = SqliteDeliveryRepository(self.connection)
        self.repository.initialize()
        self.policy = DeliveryPolicy(lease_seconds=5, retry_base_seconds=2, retry_cap_seconds=8)

    def tearDown(self) -> None:
        self.connection.close()

    def enqueue(self, delivery_id: str = "delivery-1", key: str = "order.created:42") -> None:
        self.repository.enqueue(
            delivery_id,
            "https://receiver.invalid/hooks",
            '{"order_id":42}',
            key,
            now=100,
        )

    def test_crash_after_send_redelivers_with_one_receiver_effect(self) -> None:
        self.enqueue()
        transport = DeduplicatingTransport()
        worker = WebhookWorker(self.repository, transport, self.policy)

        with self.assertRaises(CrashAfterSend):
            worker.run_once(now=100, crash_after_send=True)

        self.assertEqual(worker.run_once(now=104), RunResult.IDLE)
        self.assertEqual(worker.run_once(now=105), RunResult.DELIVERED)
        self.assertEqual(transport.attempts, ["order.created:42", "order.created:42"])
        self.assertEqual(transport.effects, ['{"order_id":42}'])
        self.assertEqual(self.repository.state("delivery-1"), "delivered")

    def test_transport_failure_waits_for_backoff_before_retry(self) -> None:
        self.enqueue()
        transport = DeduplicatingTransport(failures=1)
        worker = WebhookWorker(self.repository, transport, self.policy)

        self.assertEqual(worker.run_once(now=100), RunResult.RETRY_SCHEDULED)
        self.assertEqual(worker.run_once(now=101), RunResult.IDLE)
        self.assertEqual(worker.run_once(now=102), RunResult.DELIVERED)
        self.assertEqual(transport.effects, ['{"order_id":42}'])

    def test_stale_worker_cannot_acknowledge_a_newer_claim(self) -> None:
        self.enqueue()

        stale_claim = self.repository.claim_due(now=100, lease_seconds=5)
        current_claim = self.repository.claim_due(now=105, lease_seconds=5)

        self.assertIsNotNone(stale_claim)
        self.assertIsNotNone(current_claim)
        assert stale_claim is not None
        assert current_claim is not None
        self.assertFalse(self.repository.mark_delivered(stale_claim, now=106))
        self.assertEqual(self.repository.state("delivery-1"), "sending")
        self.assertTrue(self.repository.mark_delivered(current_claim, now=106))
        self.assertEqual(self.repository.state("delivery-1"), "delivered")


if __name__ == "__main__":
    unittest.main()
