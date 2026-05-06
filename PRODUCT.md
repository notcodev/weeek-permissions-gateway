# Product

## Register

product

## Users

The primary user is a **tech lead in a small engineering team** who imports a
Weeek workspace into the gateway and issues sub-keys for colleagues, CI jobs,
and one-off integrations. Adjacent users are **solo developers** issuing keys
for their own bots and **platform engineers** in larger orgs managing dozens
of keys with a real audit trail. They open the admin in a desktop browser at a
27-inch monitor while triaging an integration issue or onboarding a new
script — task-driven sessions, not browsing.

The job to be done: "Give this script the smallest possible surface area into
my Weeek workspace and make sure I can revoke it later without ambiguity."

## Product Purpose

A multi-tenant gateway that issues scoped, revocable, audited API keys in
front of Weeek's API tokens, which natively cannot be restricted. Importing a
workspace, issuing a sub-key with explicit project/board/verb scope, revoking
it, and reading audit log are first-class flows. Success means a tech lead
hands a sub-key to a teammate or to an integration with the same confidence
they'd hand over a least-privilege IAM credential.

## Brand Personality

**Terminal-native, expert.** Quiet, precise, monospace-where-it-earns-it. The
admin should feel like a tool built by someone who has rotated their share of
production tokens — not like a marketing surface or a generic SaaS. No
mascots, no purple gradients, no "AI for X" copy. Voice is the voice of good
docs: literal, exact, no marketing words.

## Anti-references

Specifically not:

- **Atlassian / Jira-style SaaS-cream:** beige cards, capsule layouts, generic
  blue CTAs.
- **AI-startup violet:** purple gradients, glow effects, neon backgrounds,
  "AI shimmer".
- **Material Design:** drop shadows everywhere, FAB buttons, ripple effects,
  card-grid as a layout strategy.
- **Crypto neon:** black backgrounds with acid-green / electric-pink accents.
- **Icon spam:** an emoji or icon in every table row, button, and badge. Icons
  are reserved for affordance (status, navigation), never decoration.

## Design Principles

1. **Default to expertise.** No onboarding tour explaining what an API key is.
   Inline hints appear only where behaviour is non-obvious — chiefly that
   `revoke` is irreversible and the raw key is shown exactly once.
2. **Monospace earns its place.** Keys, IDs, paths, query strings, project
   ids in audit log — `font-mono`. Labels, navigation, body copy — sans. The
   UI is not a terminal cosplay; it borrows monospace where data is literal.
3. **Density without theater.** Vercel-tight (~14px body, narrow row heights),
   but no decorative density. No hero metrics, no "stat tile in every corner",
   no widgets with no job.
4. **Mutations announce themselves.** Issuing or revoking a key, deleting a
   workspace get visual weight, an `AlertDialog`, and a confirmation gesture.
   Reads stay quiet — scannable tables, no nagging tooltips.
5. **Refuse the category reflex.** No purple AI gradients, no SaaS cream, no
   Material shadows, no crypto neon, no icon-stuffed tables. If a choice
   would land on the first thing someone pictures when they hear "developer
   admin tool", reconsider.

## Accessibility & Inclusion

- Target **WCAG 2.2 AA**: contrast ≥ 4.5:1 for body text and ≥ 3:1 for
  large text and UI controls.
- All actions reachable by keyboard. Visible focus rings (no `outline: none`
  without an equivalent replacement).
- Honour `prefers-reduced-motion`: disable non-essential transitions,
  preserve micro-feedback.
- Status / state communicated by more than colour alone (icon + label, not
  just a coloured dot).
- Form fields always have associated `<label>`; error messages are tied via
  `aria-describedby`.
