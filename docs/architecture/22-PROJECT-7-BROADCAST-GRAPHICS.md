# IPS Project 7 — Broadcast Graphics System

## Status

This document defines the target IPS broadcast presentation architecture and the first production implementation.

The scoring engine remains authoritative. Broadcast graphics consume confirmed match state and separate short-lived Director cues. Graphics never calculate or overwrite cricket state.

## Creative direction — IPS Signal Frame

IPS Signal Frame is an original cricket television package designed to feel native beside premium international productions without copying any broadcaster.

### Visual principles

1. **Cricket information hierarchy first.** Team, score and overs dominate persistent graphics. Batter/bowler context is secondary. Rates and situational information are tertiary.
2. **Television geometry, not SaaS cards.** Sharp trimmed corners, masks, blades, hairlines and disciplined panel edges replace rounded dashboard cards.
3. **Neutral master chassis.** The master package is based on near-black, off-white and a restrained IPS signal accent. Team and tournament colours enter selected accents, masks, portrait fields and event details rather than repainting the whole package.
4. **Modular families.** Dozens of graphics are generated from a small number of coherent families: match boards, lower thirds, player features, event impacts, information takeovers, scorecards, analytics, leaderboards, results/awards, holding graphics and utilities.
5. **Broadcast motion.** Directional wipes, masked reveals, controlled scale and fast typography. No bounce-first mobile/web motion.
6. **Transparent browser source.** Program overlays render over a transparent canvas for PRISM, OBS, vMix or later broadcast compositors.

## Core visual tokens

### Palette

- Ink: `#090B10`
- Raised ink: `#121620`
- Panel: `#171C27`
- Paper: `#F5F7FA`
- Muted: `#9AA3B2`
- Master signal accent: `#6D5CFF`
- Master signal soft: `#A99DFF`
- Wicket / destructive event: `#F04F64`
- Attention / free hit: `#FFB84A`

These are the default package tokens, not permanent tournament colours. A future Overlay Editor can replace them through theme configuration without changing scoring logic.

### Geometry

- 8 px corner cut / blade language
- 2 px conventional radius where a true rectangle is needed
- 1 px broadcast hairline
- 6 degree directional motion/blade angle
- No large pill-card language for primary television graphics

### Safe areas

Primary design canvas: 1920 x 1080.

- Horizontal title-safe inset: 4%
- Top inset: 4%
- Bottom inset: 5%
- Persistent scorebar sits inside the bottom safe area.
- Full-frame graphics remain legible at 1280x720, 2560x1440 and 3840x2160 through responsive CSS rather than separate artwork.

## Motion system

| Class | IN | HOLD | UPDATE | OUT |
| --- | ---: | --- | --- | ---: |
| Data tick | 180 ms | live | changed value only | n/a |
| Lower third | 260 ms | Director/manual or preset | local data field | 220 ms |
| Full frame | 380 ms | Director/manual or preset | local content | 220 ms |
| Event impact | 220 ms | short preset | n/a | 220 ms |
| Replay/transition | 1200–1800 ms total | sting-specific | n/a | included |

Default easing prioritises a fast broadcast settle rather than spring/bounce behavior.

Director behavior:

- **PREVIEW** — send to the preview bus only.
- **TAKE LIVE** — animate onto PROGRAM and hold until manually hidden.
- **AUTO** — animate in, hold for the registry duration, animate out.
- **CUT** — send to PROGRAM without the normal entry reveal.
- **HIDE** — clear the selected logical layer.

## Layer model

1. Persistent scorebar
2. Lower third / utility strip
3. Event / information graphic
4. Fullscreen graphic
5. Transition / replay
6. Sponsor / bug

Each transient cue targets one logical layer. Clearing one layer must not clear unrelated layers.

Full-screen graphics marked `hidesScorebar` temporarily suppress the persistent scorebar. When the full-screen layer clears, the scorebar returns from confirmed match state without needing a new scorer action.

## Realtime model

### Confirmed state

Source: Supabase/PostgreSQL scoring state.

Used for:

- score / wickets
- innings
- overs / balls
- striker and non-striker
- bowler
- target / chase
- free hit
- public scorecards
- current over

The overlay subscribes to `match_live_state` and refreshes the public-safe projection whenever it changes.

### Broadcast cue

Source: `broadcast_graphic_cues`.

A cue contains:

- match
- PREVIEW or PROGRAM output
- graphic id
- mode
- logical layer
- data payload
- optional auto duration
- actor / timestamp
- monotonic sequence

A reconnecting overlay does not replay historical transient cues. It reconstructs only confirmed match state.

## Public-safe broadcast context

`ips_public_broadcast_context(match_id)` exposes only presentation-safe information needed by graphics:

- match code / number / stage / round / format
- tournament / city
- venue
- home and away team identity
- playing sides
- public player names, IPS codes, roles and portraits
- captain / wicketkeeper marks
- public official display names/designations

It does not expose private contact details, account credentials or private profile information.

## Graphic registry

The shared `@ips/broadcast` package is the presentation contract. Every registered graphic defines:

- id
- label
- template family
- layer
- supported modes
- default mode
- default duration
- priority
- scorebar compatibility

The registry currently covers:

- match intro / versus / toss / playing XI / match conditions
- lower thirds
- batter and bowler intros
- FOUR / SIX / WICKET
- dismissal
- 50 / 100 / generic milestone
- five-wicket haul / hat-trick / maiden
- free hit / powerplay
- end of over / partnership / fall of wicket
- target / chase equation / last five / projected score / chase pressure
- batting / bowling / full innings scorecards
- worm / run-rate / partnership analytics
- boundary map / wagon wheel / bowling pitch map
- player / team comparison and head-to-head
- standings and statistical leaderboards
- innings break / result / Player of Match / tournament awards / champions
- holding, sponsor and replay graphics
- camera and LIVE identifiers
- records
- player / team / tournament statistics
- upcoming match / schedule
- social / QR
- transition and clear-layer controls

Not every advanced analytics graphic has an authoritative analytics data source yet. The renderer is already data-driven so those templates accept structured payloads without altering scoring.

## Persistent live scorebar

The scorebar is intentionally split into four information zones:

1. **Team / score / wickets / overs** — dominant
2. **Striker / non-striker / bowler** — secondary
3. **This over / FREE HIT** — immediate ball context
4. **CRR / target / need / RRR / tournament** — situational context

A normal delivery changes only the relevant numeric values with a short data tick. The entire bar does not disappear and rebuild on every ball.

## Player media fallbacks

If a public portrait is available, the player-feature family uses it.

If not:

1. player initials
2. team identity
3. role label

Broken-image placeholders must never appear.

Team marks use contained object-fit rendering so square, circular and wide transparent logos can share the same broadcast frame.

## Director Studio

Route:

`/matches/:matchId/director`

The Director must pass the same match authorization boundary as the scorer context.

The Studio provides:

- Preview monitor
- Program monitor
- complete graphics library by category
- graphic mode selection
- common text/player/team/sponsor overrides
- live match context
- PREVIEW
- CLEAR PVW
- TAKE LIVE
- AUTO
- CUT
- HIDE

Every control calls the real `ips_emit_broadcast_cue` RPC. There are no decorative/mock trigger buttons.

## Overlay routes

Browser-source output:

`/?match=<match-id>&output=program`

Preview output:

`/?match=<match-id>&output=preview`

Optional diagnostic overlay:

`&debug=1`

The Program URL should be used as the transparent browser source in PRISM/OBS/vMix.

## Source-of-truth boundary

Never put cricket-law calculations into the overlay or Director.

Flow:

```
SCORER
  -> authoritative scoring RPC
  -> match_scoring_events + match_live_state
  -> public confirmed projection
  -> Match Centre / scorecard / Director / overlay

DIRECTOR
  -> broadcast cue RPC
  -> transient broadcast cue
  -> preview/program overlay
```

This keeps "score once -> update everywhere" intact while allowing the Director to control presentation independently.

## Performance rules

- Prefer transforms, opacity, clip-path and CSS/SVG.
- Avoid large canvas/WebGL dependencies for normal graphics.
- Never poll every frame.
- One realtime state subscription per match browser source.
- One realtime cue subscription per output.
- Refresh derived public state only after confirmed match-state changes.
- Target 60 FPS on current Chromium browser sources.

## Future Overlay Editor contract

The broadcast renderer must keep these four concerns separate:

1. data
2. template
3. animation
4. trigger logic

A future editor can therefore change:

- typography
- token colours
- team accent rules
- geometry
- masks/textures
- logo placement
- portrait treatment
- sponsor slots
- transition duration
- stat fields

without changing `ips_score_delivery`, innings state or any other cricket rule.

## Acceptance test

A graphic fails the design review if it reads primarily as:

- a SaaS dashboard
- a mobile app
- a generic streamer overlay
- an esports template
- an amateur scoreboard

It passes only when the hierarchy, safe-area behavior, motion, density and compositing are credible for a professional cricket television production.
