# Match event contract — draft boundary

Project 0 freezes the shape and responsibilities, not every cricket-law payload.

## Command/intention submitted by controller
Every command includes:
- `match_id`
- `client_event_id` — UUID idempotency key generated once on the device
- `expected_match_version`
- authenticated actor/scoring session
- scoring intent payload

## Accepted event
Backend assigns:
- `event_id`
- `match_id`
- `innings_id`
- monotonically increasing match sequence
- actor/scoring session
- event type + validated payload
- server timestamp
- correction relationship when relevant

## Invariants
1. `(match_id, client_event_id)` must be unique.
2. The client does not assign authoritative sequence numbers.
3. A stale `expected_match_version` is rejected instead of silently overwriting a newer event.
4. Corrections never destructively delete the original accepted event.
5. Live projection can be rebuilt from the authoritative effective event stream.
6. Every event is isolated to exactly one match.

## Initial event families
- `DELIVERY_RECORDED`
- `DELIVERY_CORRECTED`
- `PLAYER_RETIREMENT`
- `INNINGS_TRANSITION`
- `MATCH_TRANSITION`
- operational/audit events for scorer handover where required

Exact cricket payloads are frozen when the scoring-engine specification is reviewed.
