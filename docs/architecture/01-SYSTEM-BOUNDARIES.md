# IPS system boundaries

```text
IPS Web/Admin ───────────────┐
                            │ read/write official administration data
IPS Match Controller ───────┼──> IPS API / trusted backend functions ──> PostgreSQL
                            │                                      │
                            │                                      ├─ immutable match_events
                            │                                      └─ match_live_state projection
                            │
                            └<──────── confirmed realtime state ───┘
                                             │
                                             ├─ Web Match Centre
                                             ├─ Controller confirmation
                                             ├─ Tournament dashboard
                                             └─ PRISM Overlay
```

## Authority rule
The client never becomes the official authority simply because it can render a score. A scoring intent becomes confirmed live state only after backend authorization, validation and commit.

## Broadcast rule
Broadcast animation cues are transient outputs. They are not match facts and should not be replayed as historical scoring truth.
