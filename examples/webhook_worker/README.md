# Crash-safe webhook worker

This fixture models a webhook send that succeeds just before the worker crashes, leaving no local acknowledgement.

## Ownership boundary

- **Keep:** the at-least-once guarantee, stable idempotency key, lease duration, and retry policy.
- **Pair:** the claim-generation invariant and the send-before-ack crash timeline.
- **Delegate:** SQLite storage, fault injection, and tests.

## Invariant

A claim increments `attempts`, which also acts as its generation. A worker may acknowledge or reschedule only the generation it claimed. After a lease expires, a newer worker can reclaim the delivery; stale acknowledgements then fail safely.

The send and local acknowledgement cannot be atomic. A crash between them therefore causes intentional redelivery with the same idempotency key. The fixture promises **at-least-once delivery**, not exactly-once delivery. Its fake receiver demonstrates how idempotency turns repeated attempts into one observable effect.

This is a test fixture, not a production queue. A deployment would also need process-level SQLite connection management, a busy-timeout policy, monitoring, endpoint controls, and a dead-letter policy.

## Run the tests

From the repository root:

```sh
python3 -m unittest discover -s examples/webhook_worker/tests -v
```

The suite injects a crash after a successful send, verifies the lease boundary, exercises retry backoff, and rejects an acknowledgement from a stale worker.
