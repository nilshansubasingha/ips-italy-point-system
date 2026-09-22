# Project 2.2 — Premium UI Upgrade

## Approved direction
The existing Project 2 data architecture is unchanged. This release upgrades the presentation layer across the public IPS website, Match Controller shell, and PRISM overlay shell.

## PROPOSED CHANGES / ADDITIONS — implemented as approved UI work

### Premium rankings shell
- **Change/add:** New `/rankings` page and homepage ranking preview inspired by professional international cricket ranking presentation.
- **Why:** Rankings are a flagship public surface and need high information density, strong player identity, movement-ready rows, and category panels.
- **Benefit:** Establishes the final visual language before the ranking engine exists.
- **Possible downside:** The UI exists before official rating data.
- **Scope/data impact:** No ranking values are invented; ratings remain blank until certified match statistics and ranking algorithms are implemented.
- **Timing:** Now for UI, later for ranking calculations.

### Eliminate dead desktop space
- **Change/add:** Directory pages now use contextual right rails, featured tournament cards, system-flow cards, network metrics, and useful navigation rather than leaving large blank areas.
- **Why:** Desktop layouts felt unfinished when only one or two database records existed.
- **Benefit:** Balanced composition even with small datasets.
- **Possible downside:** More responsive layout rules.
- **Scope/data impact:** Presentation only.
- **Timing:** Now.

### Whole-site sports design system
- **Change/add:** Reworked header, hero system, cards, filters, Match Centre, club/player/tournament/city profiles, database health screen styling, empty/error/loading states, and responsive rules.
- **Why:** IPS should look like a professional sports platform, not a generic SaaS directory.
- **Benefit:** Consistent premium identity and higher information density.
- **Possible downside:** Larger CSS surface that must be maintained as modules expand.
- **Scope/data impact:** None.
- **Timing:** Now.

### Controller visual overhaul
- **Change/add:** Rebuilt the controller shell around one-handed live scoring: score state, striker/non-striker/bowler, current over, large run buttons, dedicated wicket action, contextual extras, and bottom navigation.
- **Why:** The scorer is standing beside a ground on a smartphone.
- **Benefit:** Faster scanning and fewer operational mistakes when the scoring engine is connected later.
- **Possible downside:** This is intentionally still a UX shell; scoring semantics are not implemented here.
- **Scope/data impact:** No official scoring behavior changed.
- **Timing:** Now for UX shell; scoring engine later.

### PRISM overlay visual overhaul
- **Change/add:** Premium broadcast scorebar with stronger hierarchy for team score, overs, batters, bowler, current over, target/required state and IPS branding.
- **Why:** Broadcast output must feel like the same IPS product family.
- **Benefit:** More professional live-stream presentation.
- **Possible downside:** Responsive overlay dimensions will need device testing when PRISM integration is live.
- **Scope/data impact:** Output-only UI.
- **Timing:** Now for shell; realtime binding later.

## Explicitly not changed
- Supabase schema
- central data source
- canonical player/club/team identities
- tournament rulesets
- fixture model
- certification architecture
- event-ledger architecture
- ranking formulas
- live scoring engine
- authentication/roles (Project 3)
