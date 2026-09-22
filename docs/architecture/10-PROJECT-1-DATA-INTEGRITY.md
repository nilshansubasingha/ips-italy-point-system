# Project 1 — Data Integrity Rules

1. A player uses an internal UUID and one permanent public IPS code.
2. Display names are never relationship keys.
3. Player/team changes create membership history instead of replacing player identity.
4. Club names are unique within a city; team names are unique within a club.
5. Tournament codes and match codes are globally unique operational identifiers.
6. A match cannot contain the same team on both sides.
7. A match team must already exist in that tournament's `tournament_teams` set.
8. Rulesets are versioned so future rule changes do not require controller hard-coding.
9. Draft tournaments are not public through the Project 1 anonymous RLS policy.
10. Project 1 exposes no anonymous/authenticated database write policy.
11. The service-role key must never be exposed as a `NEXT_PUBLIC_*` environment variable.
12. Scoring, certification, statistics and rankings remain outside Project 1 to prevent accidental coupling before their contracts are frozen.
