# IPS — Project 5.2: Management & Registry UX

Project 5.2 replaces the development-style management screens with a structured sports-operations layer before live scoring begins.

## What changed

### Professional management structure

- `/manage` is now an operational **Command Centre** with live/upcoming matches, registry counts, pending work and quick actions.
- Tournament creation moved to its own full-width page: `/manage/tournaments/new`.
- `/manage/tournaments` is now a clean competition directory instead of a permanent creator/sidebar split.
- Public tournament, club and player directories use full-width responsive layouts instead of empty permanent side rails.
- Management has dedicated navigation for Tournaments, Clubs, Teams, Players, Venues and Accounts & Roles.

### Club → Team → Player registry

- Create canonical clubs from `/manage/clubs/new`.
- One club can own multiple teams.
- Create a team from its club or directly from `/manage/teams/new` by selecting an authorised parent club.
- Team pages contain the active roster and preserved membership history.
- Adding a player always starts with **Search IPS first** by name, `ITA-xxxxxxx`, exact email or international phone number.
- Existing players can be attached to a new team without creating a second cricket identity.
- New players receive a permanent UUID + public IPS code automatically.

### Email, phone and WhatsApp data

The permanent cricket identity remains the player UUID + `ITA-xxxxxxx` code. Email and phone are private secondary account/search identifiers and may change later without splitting career history.

- Optional email at player creation.
- Optional international-format phone number, e.g. `+393451234567`.
- Phone may be marked for WhatsApp updates with a separate consent record.
- Contact data is private and protected by RLS.
- A signed-in account may claim an unclaimed player only when its **verified** email or phone matches the stored private player contact.

### Phone login readiness

Supabase phone OTP requires Phone Auth plus an SMS provider. IPS now contains the phone OTP UI/claim flow, but it is feature-gated so the production login page does not expose a broken option before the provider is configured.

After configuring Supabase Phone Auth + an SMS provider, set:

```env
NEXT_PUBLIC_PHONE_AUTH_ENABLED=true
```

With the flag disabled, normal email/password authentication continues to work.

### Official player photos

Player portraits are **admin-managed only**.

- Players cannot upload, replace or remove their own official portrait.
- Team/club leaders cannot change the official portrait by default.
- Authorised IPS Admin/Owner users can upload, replace and remove the final approved JPG/PNG/WEBP image.
- IPS does not enhance or generate the photo. Any image adjustment happens outside IPS before the final file is uploaded.
- Club/team logos remain manageable by authorised organisation managers.

### Project 5.1 remains intact

Tournament effective match defaults, fixture snapshots, Players per side, Overs per innings, Balls per over, wicket/bowler limits, default venue, registration mode, Playing Side terminology and audited match overrides remain in place.

## Connected Supabase project

The Supabase project used in this build has already been migrated through Project 5.2, including the registry schema, media bucket, player-photo RPC and helper-function security hardening.

**Do not rerun the Project 5.2 SQL against that same project.** The SQL/migration files are included for fresh installations or source control.

## Run locally

Copy your existing working Supabase environment file into:

`apps/web/.env.local`

The base URL must be the project URL only, with no `/rest/v1/` suffix.

Then:

```powershell
npm install
npm run dev
```

Open:

- Website / public directories: `http://localhost:3000`
- Command Centre: `http://localhost:3000/manage`
- Tournament management: `http://localhost:3000/manage/tournaments`
- Clubs: `http://localhost:3000/manage/clubs`
- Teams: `http://localhost:3000/manage/teams`
- Players: `http://localhost:3000/manage/players`
- Match Controller: `http://localhost:3001`
- Overlay shell: `http://localhost:3002`

## Recommended Project 5.2 acceptance test

1. Sign in as the Owner.
2. Open **Command Centre** and confirm the compact operational layout.
3. Create a new club.
4. Open that club and add a team.
5. Open the team and choose **Add player**.
6. Search an existing name/IPS ID first.
7. Create a new player with optional email and/or `+39...` phone.
8. Confirm the player receives a permanent `ITA-xxxxxxx` ID and appears on the roster.
9. Open the Player Registry and confirm private contact data is not exposed on public player pages.
10. As Owner/Admin, upload the final official player portrait; confirm a normal player account has no photo editing controls.
11. Create a tournament from the dedicated full-width page and confirm the tournament directory no longer contains the creator sidebar.
12. Confirm the public tournament directory uses the full width without the old empty right rail.

## Checks

```powershell
npm run project5_2:smoke
```

Project 6 remains the next major milestone: immutable match events, deterministic scoring state and realtime propagation from the Match Controller to Match Centre.
