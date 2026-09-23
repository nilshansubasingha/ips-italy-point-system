# Project 5.6 — Registration, Identity Resolution, Provisional Rosters & Transfers

## Frozen identity rules

1. A name is never a unique cricket identity.
2. Every official player has one permanent IPS player ID (`ITA-xxxxxxx`).
3. Public display name is separate from private identity data.
4. Strong duplicate signals are:
   - exact account/contact email,
   - exact phone,
   - full legal name + date of birth.
5. Name-only matches are warnings for human review, not automatic merges.
6. A player may have only one active top-level Team identity at a time.
7. Moving between top-level Teams is a Transfer, never a second active membership.
8. A/B/C are competitive sides under the same public Team identity.
9. New-Team roster names are provisional until individually matched or approved.
10. Signup creates an account/request; administrator approval creates or links the official cricket identity.

## Registration flow

Account signup
→ city + Team/side selection
→ private identity fields
→ request appears in scoped Management queue
→ duplicate check
→ approve existing player OR create new IPS player
→ if existing player is on another Team, create Transfer Request
→ release from current Team
→ City/Global final approval
→ destination membership active.

Unconfirmed signups are visible to authorised administrators with status `PENDING_EMAIL`, but cannot be approved until the account email/phone is confirmed.

## Scoped approval

- Global Owner / Global Admin: all requests.
- City Admin: player and Team requests in that city; transfer finalisation for destination city.
- Team Admin (legacy DB scope `CLUB`, UI label `TEAM · ALL SIDES`): player requests for that Team and its sides.
- Competitive-side Admin: player requests for that side.
- New Team creation requests: Global or relevant City Admin only.
- Current Team Admin / City / Global: release a transfer.
- Destination City / Global: finalise a transfer.

## Privacy

Public `players` rows contain cricket-facing identity only.
Private full legal name and date of birth are stored in `player_private_identities`.
Registration phone/email are never exposed publicly. Management review surfaces masked contact values and only the identity details necessary for duplicate resolution.

## New Team requests

A requester can propose:
- Team name,
- city,
- structure: single / A+B / A+B+C,
- provisional roster names,
- optional DOB/contact,
- requested A/B/C side,
- playing role.

Approving a Team creates the Team identity and side structure. It does **not** automatically create all provisional player identities. Each provisional member must be resolved individually.

## Direct Team roster operations

Direct "add existing player" uses `ips_request_existing_player_for_team`:
- unattached → add,
- same Team/different side → audited side move when authorised,
- different top-level Team → transfer request.

Direct new-player creation uses private full name/DOB plus email/phone duplicate checks through `ips_create_player_for_team_v2`.

## Technical compatibility

The physical table names from earlier projects remain for migration safety:
- `public.clubs` = public Team identity,
- `public.teams` = competitive side.

No user-facing product screen should expose the old Club terminology.
