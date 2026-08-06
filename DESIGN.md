# PaydayPilot Design Constitution

Ratified direction: **warm editorial print-tech** — cream paper ground, near-black ink,
burnt orange as the single accent — blended with Apple-style restraint and motion.
Reference: Chase's print-tech aesthetic (cream/ink/orange, editorial serif display, mono
technical labels, outlined icons, numbered orange badges, sticky-note asides).

Status: constitution in force. Bake-off resolved (PP.DS.2): current dark stays the
**default** theme app-wide; **Paper** (formerly V1) is the sole light theme. V2–V5 are
retired — their CSS is deleted, not just unused.

## North Star

> **"A friendly family ledger on beautiful paper."**

Dark is the shipped default (PP.DS.2 verdict); Paper is the first-class light
alternative, chosen per-user in Settings → Appearance. The North Star describes the
Paper theme's intent — the warm editorial print-tech read — not a bright-only mandate.

## Palette

| Role | Family | Use |
| --- | --- | --- |
| Ground | cream `#faf6ee` family | page background, "paper" |
| Ink | near-black `#1a1712` family | text, outlines, icons |
| Accent | burnt orange `#c2410c` family | actions, active states, **today** |
| Semantic green | muted-warm green | paydays / income only |
| Semantic red | muted-warm red | overdue only |
| Sticky-note yellow | warm yellow | **reserved for tips/advisor asides only** |

Green and red are tuned muted-warm so they sit inside the cream/ink scheme rather than
reading as stock traffic lights. Orange is the only color allowed to do "brand" work.

## Type — three voices

1. **Editorial serif for display** — screen titles, big money numbers.
   Fraunces (Google, Playfair/Fraunces family), loaded as `Fraunces Variable`.
2. **Clean sans for UI body** — current app sans (Geist / system-ui class). Body text,
   controls, descriptions.
3. **Mono small-caps for technical labels** — dates, "CHECK 1", due-rule text.
   IBM Plex Mono, uppercase + tracked, never for body copy.

## Components

- Ink-outline elements on paper (borders are ink at low alpha, not gray).
- Rounded chips for bills/paydays.
- Orange numbered badges for wizard/onboarding steps.
- Hand-drawn-feel underline accents on display heads — used sparingly, never on body.
- Sticky-note asides for the advisor voice only.

## Motion

Apple physics: subtle springs, weighted transitions, elements **settle** rather than
snap. Standard ease: `cubic-bezier(0.32, 0.72, 0, 1)`. No decorative bouncing, no
attention-seeking animation.

## GUARDRAILS — never

- Purple gradients.
- Glossy SaaS chrome.
- Blue-purple AI-default palettes.
- Inter-for-everything (one voice doing three jobs).
- Dark-terminal vibes.
- More than one accent color doing "brand" work.

## Check-hue rule

The PP.5.4 four-hue paycheck palette (violet/amber/teal/rose) gets **re-derived from
this scheme when the winner ships** — warm-compatible hues that live on cream paper.
The bake-off variants preview warm candidate hues (terracotta / olive / dusty teal /
plum), but the final set is chosen at ship time. Popover text ("Comes out of Check N")
stays authoritative; hue is reinforcement, never the only signal.

## Token architecture (PP.DS.1)

- All Dashboard-surface styling flows through CSS custom properties set at the app root
  via `data-theme` on `<html>`. No attribute → current dark theme, unchanged app-wide.
- Base semantic tokens are the shadcn set (`--background`, `--card`, `--primary`, …).
- PaydayPilot-specific tokens are `--pp-*`: semantic marker colors (`--pp-payday`,
  `--pp-bill`), check hues (`--pp-check-1..4`), today accent (`--pp-today`), type voices
  (`--pp-font-display`, `--pp-font-label`, `--pp-font-money`), sticky note, underline,
  motion ease, page density.
- Components carry stable hook classes (`pp-display`, `pp-label`, `pp-money`,
  `pp-underline`, `pp-chip`, `pp-status-strip`, `pp-today`) whose rendered style is
  entirely var-driven — the default (dark) theme resolves them to today's exact
  appearance.
- The Paper theme lives in `src/styles/themes.css` as a single `[data-theme='paper']`
  block. Because all app surfaces (Dashboard, Bills, Buckets, Plan, Settings) already
  style through the shared semantic tokens (`--background`, `--card`, `--primary`,
  etc.), Paper applies app-wide from that one block — no per-screen overrides needed.

## Theme (PP.DS.2)

- **Dark** (default, no `data-theme` attribute, `<html>` carries `.dark`) — the
  originally shipped appearance; unchanged.
- **Paper** (`data-theme="paper"` on `<html>`, `.dark` removed) — maximal Chase print-
  tech read: cream ground, serif display everywhere, visible hand-drawn underline
  strokes, sticky-note advisor card. The only light theme; first-class, not dev-grade.
- Chosen per-user in Settings → Appearance, persisted to `localStorage` (`pp-theme` key)
  — no `preferences`/theme column exists on `profiles` yet, so this is not synced across
  devices. Applied via an inline `<script>` in `index.html` before React mounts, so
  there's no flash of the wrong theme on load.
- V2 "Ink", V3 "Cupertino Blend", V4 "Soft Warm", and V5 "Passbook" — the four losing
  bake-off variants — are retired; their CSS and the dev-only `ThemeSwitcher` pill are
  deleted.
