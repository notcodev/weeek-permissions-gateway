# Design

> Visual contract for the Weeek Permissions Gateway admin. Read alongside
> `PRODUCT.md`, which carries the strategic / register / personality layer.
> This document is the seed; it will be regenerated against real tokens via
> `/impeccable document` after the first UI lands.

## Theme

Both light and dark, auto-following `prefers-color-scheme`. There is no
"primary" theme — both are first-class. A user pulling up the admin in a
sunlit office and a tech lead opening it next to a 2 AM production console
should see something built for their environment, not a compromise that
serves neither.

### Scene sentence (anchors the choice)

> "A tech lead at a 27-inch monitor at 11 PM, glancing between this admin
> and a terminal, deciding whether to revoke a sub-key."

Forces: dim-ambient legibility, no glare bursts, no playful hues, generous
density, calm contrast.

## Color strategy

**Restrained.** Tinted neutrals carry the surface. Accents are reserved for
mutation states (destructive, success after irreversible action) and focus.
There is no decorative color and no brand color: this is a tool, not a
landing page.

The palette tracks `shadcn/ui`'s `neutral` base color and is expressed in
OKLCH per the impeccable color law. Neutrals are pulled imperceptibly cool
(chroma < 0.01) to read as "off-white" and "warm graphite" rather than the
clinical paper white that most admins default to.

### Light tokens

| Role           | OKLCH                    | Notes                                 |
|----------------|--------------------------|---------------------------------------|
| `background`   | `oklch(1 0 0)`            | Surface; never pure on text           |
| `foreground`   | `oklch(0.145 0 0)`        | Body text                             |
| `card`         | `oklch(1 0 0)`            | Same as bg; cards rely on borders     |
| `border`       | `oklch(0.922 0 0)`        | 1px hairlines                         |
| `muted`        | `oklch(0.97 0 0)`         | Striped rows, code blocks             |
| `muted-fg`     | `oklch(0.556 0 0)`        | Secondary copy, timestamps            |
| `primary`      | `oklch(0.205 0 0)`        | Mutation CTAs, active nav             |
| `primary-fg`   | `oklch(0.985 0 0)`        | Text on primary                       |
| `destructive`  | `oklch(0.577 0.245 27)`   | `Revoke`, `Delete workspace`          |
| `ring`         | `oklch(0.708 0 0)`        | Focus ring                            |

### Dark tokens

| Role           | OKLCH                       | Notes                              |
|----------------|-----------------------------|------------------------------------|
| `background`   | `oklch(0.145 0 0)`          | Soft graphite, never `#000`        |
| `foreground`   | `oklch(0.985 0 0)`          | Body                               |
| `card`         | `oklch(0.205 0 0)`          | Subtle elevation via tone, not shadow |
| `border`       | `oklch(1 0 0 / 0.10)`       | Translucent hairline               |
| `muted`        | `oklch(0.269 0 0)`          | Striped rows                       |
| `muted-fg`     | `oklch(0.708 0 0)`          | Secondary copy                     |
| `primary`      | `oklch(0.922 0 0)`          | Mutation CTAs, active nav          |
| `primary-fg`   | `oklch(0.205 0 0)`          | Text on primary                    |
| `destructive`  | `oklch(0.704 0.191 22)`     | Brighter red on dark               |
| `ring`         | `oklch(0.556 0 0)`          | Focus ring                         |

These match `shadcn/ui` `new-york` neutrals so the standard component output
is on-brand without theme overrides; only `destructive` may be tuned hotter
than shadcn's default to enforce mutation legibility.

### Accent budget

There is no decorative accent. Color **earns** its appearance by signalling
mutation or status:

- `destructive` for irreversible operations (`Revoke`, `Delete`).
- A muted positive (`oklch(0.62 0.12 150)`) only on the "key created" toast
  and the audit-log status pill for HTTP 2xx — never as a CTA.
- Focus rings use `ring`. No glow.

## Typography

| Role            | Family                                 | Weight     |
|-----------------|----------------------------------------|------------|
| UI / body       | Geist Sans, then `system-ui` fallback   | 400 / 500  |
| Headings        | Geist Sans                              | 600        |
| Data / mono     | Geist Mono                              | 400 / 500  |

Loaded via `next/font/google` (Geist family is on Google Fonts) with
`display: "swap"` and only the weights above subset to keep payload small.

### Mono usage rules

`font-mono` is reserved, never decorative:

- API keys, both the one-time reveal and the `wgw_…last4` chip
- Workspace IDs, project IDs, board IDs, member IDs in audit and detail panels
- HTTP method, path, query string, status code in the audit log
- Code samples and example `curl` snippets in docs/help blocks

Everything else (labels, navigation, body, button text) is sans.

### Scale

| Token        | Size   | Line height | Usage                              |
|--------------|--------|-------------|------------------------------------|
| `text-xs`    | 12px   | 16px        | Audit metadata, badges             |
| `text-sm`    | 13px   | 20px        | Tables, secondary body             |
| `text-base`  | 14px   | 22px        | Body, forms                        |
| `text-lg`    | 16px   | 24px        | Section intros                     |
| `text-xl`    | 20px   | 28px        | Card titles                        |
| `text-2xl`   | 24px   | 32px        | Page titles                        |

Body anchors at 14px (Vercel-tight). The `text-sm` row in tables is the most
common density — confirmed by the "Vercel-as-is" reference. Headings step
≥ 1.25 in scale, satisfying the impeccable hierarchy rule.

## Layout

- Vercel-tight density: 14px body, 13px tables, 32–40px row heights for
  sub-key and audit tables. Padding is varied by region — never the same
  number everywhere.
- Cards exist only where data has a real boundary (a workspace card on the
  dashboard; a sub-key detail panel). No nested cards. Tables are not cards.
- The shell is a left rail (org / personal switcher + workspace nav) and a
  content column capped at `max-w-6xl` for forms, full-bleed for tables.
- Forms use a single column with right-aligned helper text, never two-column
  splits, even at wide widths.
- Tables show data, not chrome: hairline borders only, alternating row
  background only when row scanning is the dominant task (audit log).

## Motion

**Quiet.** Total motion budget per interaction is small.

- Durations: 120ms (micro: hover, focus), 200ms (state: dialog open, toast),
  280ms cap for anything else.
- Easing: `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out-quart). No bounce, no
  back-easing, no spring.
- Animatable properties: `opacity`, `transform`, `filter`. Never `width`,
  `height`, `top`, `left`, `margin`, or `padding`.
- Page transitions: none. Route changes are instantaneous; loading state
  lives in a single row of the affected component.
- Toast enter/exit is the only opinionated motion in the system.

`prefers-reduced-motion: reduce` collapses everything except focus-ring
appearance and toast fade — confirmation must remain visible.

## Components (early signal; finalised in phase 1)

Built on `shadcn/ui new-york` primitives. Concrete first set: `Button`,
`Input`, `Label`, `Card`, `Form`, `Sonner` (toast), `Dialog`, `AlertDialog`,
`DropdownMenu`, `Table`, `Badge`, `Tabs`, `Tooltip`. Composed feature
components live under `src/components/feature/` and own no styling tokens
of their own — they consume the primitives.

### Component attitude

- **Buttons.** Default = `primary` (filled). Secondary = `outline`. There is
  no `ghost` button on top-level CTAs (only inside menus). `destructive`
  variant only on revocation / deletion; never on "Cancel".
- **Tables.** Hairline `1px` borders, `text-sm`, monospace cells for IDs and
  paths, sans for labels. No row icons. No "actions" column with three
  buttons; row → row-action menu (`DropdownMenu`) on the right edge.
- **Badges.** Tonal backgrounds at low chroma, never gradient. Status
  semantics: `active`, `revoked`, `failed`, `denied (<reason>)`.
- **Dialogs.** Mutation flows (issue sub-key, confirm revoke) only.
  Forms that aren't destructive live in-page, not in a dialog.
- **Empty states.** Plain prose + a single CTA. No illustrations.

## Iconography

`lucide-react` only. Icons accompany navigation, status, and irreversible
buttons. Tables and labels stay icon-free. Stroke 1.5, size matches the
neighbouring text token (`14px` next to `text-sm`, `16px` next to
`text-base`).

## Things this design refuses

The PRODUCT anti-references made these explicit; they are repeated here as
visual law:

- No purple-to-blue / pink-to-purple gradients anywhere.
- No `border-left: 4px <accent>` side stripes on cards or alerts.
- No `background-clip: text` gradient text.
- No drop-shadow elevation. Elevation is achieved via tone only (`card` vs
  `background`).
- No icon in every table row, no emoji in copy.
- No hero-metric template (big number, small label, supporting stats).
- No identical card grids on the dashboard.
- No modal as the first thought for any non-mutation flow.
- No dashed borders on dropzones; `border` + tone shift, or nothing.
