# Crash-safe webhook worker

This fixture makes the Joy case study executable. It models the failure window where a remote webhook succeeds but the worker crashes before recording the local acknowledgement.

## Ownership boundary

- **Keep:** the at-least-once guarantee, stable idempotency key, lease duration, and retry policy.
- **Pair:** the claim-generation invariant and the send-before-ack crash timeline.
- **Delegate:** SQLite plumbing, deterministic fault injection, tests, and this explanation.

## Invariant

A claim increments `attempts`, which also acts as its generation. A worker may acknowledge or reschedule only the generation it claimed. After a lease expires, a newer worker can reclaim the delivery; stale acknowledgements then fail safely.

The send and local acknowledgement cannot be atomic. A crash between them therefore causes intentional redelivery with the same idempotency key. The fixture promises **at-least-once delivery**, not exactly-once delivery. Its fake receiver demonstrates how idempotency turns repeated attempts into one observable effect.

This is a focused executable model, not a production queue. A deployment would also need process-level SQLite connection management and busy-timeout policy, operational visibility, endpoint controls, and an explicit dead-letter decision.

## Run the proof

From the repository root:

```sh
python3 -m unittest discover -s examples/webhook_worker/tests -v
```

The suite injects a crash after a successful send, verifies the lease boundary, exercises retry backoff, and rejects an acknowledgement from a stale worker.
