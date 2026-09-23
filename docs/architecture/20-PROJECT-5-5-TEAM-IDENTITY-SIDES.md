# Project 5.5 — Team Identity + Competitive Sides

## Product model

IPS no longer exposes a Club layer.

Public hierarchy:

City → Team identity → optional competitive sides (MAIN / A / B / C / …) → players → tournament squad → match playing side.

Examples:

- Vesuvio Kings → MAIN side
- Napoli Youth → A side + B side

The Team identity owns the public name, city and crest. Competitive sides own independent rosters and are the entities that enter tournaments, fixtures, playing-side selection and scoring.

## Compatibility mapping

For this migration cycle the existing PostgreSQL table names are intentionally retained to avoid breaking tournament and match foreign keys:

- `public.clubs` = **Team identity** (technical legacy table name only)
- `public.teams` = **Competitive side**

No user-facing screen should describe `public.clubs` as clubs.

## Side fields

`public.teams.side_label`
- `MAIN` for a single-side Team
- `A`, `B`, `C`, etc. for multi-side Teams

`public.teams.side_order` controls presentation order.

## Permissions

- GLOBAL OWNER / GLOBAL ADMIN: all Team identities and sides; destructive deletion subject to history protection.
- CITY ADMIN: Team identities in that city.
- ADMIN + legacy `CLUB` scope: one Team identity and all its sides. UI label: **TEAM · ALL SIDES**.
- ADMIN + `TEAM` scope: one competitive side only.
- Team/player hard deletion remains GLOBAL OWNER / GLOBAL ADMIN only.

## Deletion rule

Hard deletion is only allowed when no tournament/match history references the Team/side/player. Historical entities remain canonical and must not be removed from official records.

## Rankings

Team and player rankings remain blank until certified match facts and a versioned ranking algorithm exist. Directory UI may display ranking slots, but must not fabricate positions or ratings.
