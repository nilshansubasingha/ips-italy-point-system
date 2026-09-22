# CricketGraphicsStudioPremiumV2 migration matrix

The uploaded CGS project remains an untouched reference copy outside this new codebase.

| Existing area | Decision | IPS direction |
|---|---|---|
| `public/overlay.html`, overlay CSS/JS concepts | Migrate selectively | Recreate as IPS overlay components using confirmed match projection |
| Theme JSON concept | Keep concept, redesign format | Versioned broadcast themes and tournament branding |
| FOUR/SIX/WICKET animation queue | Keep concept | Separate transient `broadcast_cue` stream from score state |
| Sponsor/tournament branding | Keep concept | Assets managed centrally by IPS |
| Controller visual controls | Redesign | Mobile-first scoring surface plus separate broadcast area |
| `server.js` single `state` object | Replace | Match-scoped PostgreSQL records and event streams |
| `data/state.json` | Replace | Central database + rebuildable live projection |
| Global `io.emit()` | Replace | Match/tournament-scoped realtime subscriptions |
| Controller-side official calculations | Replace | Shared deterministic server-authoritative scoring engine |
| typed striker/non-striker/bowler fields | Replace | Official player IDs from playing XI |
| snapshot history undo | Replace | Correction/reversal events with actor, reason and target |
| manual target/result editing | Replace | Derived from match facts and rules |
| file-system team-logo upload | Replace | Central managed storage assets |
