# ByteLearn Frontend Design Specification

**Status:** Desired product UI (normative)

**Applies to:** every user-facing surface in `Frontend/`

**Audience:** designers and implementation agents

**Source of truth:** this document defines the intended visual language. It takes precedence over incidental styles already present in the codebase. `frontend-conventions.md` defines coding conventions; it does not override this design specification.

## How to use this document

Use the requirements in this document when building or restyling a screen, component, loading state, error state, or empty state. Preserve the existing API, authentication, routing, and business behavior unless the task explicitly authorizes a functional change.

The terms **MUST**, **SHOULD**, and **MAY** are normative:

- **MUST**: required for a conforming implementation.
- **SHOULD**: expected unless a documented, screen-specific reason makes it unsuitable.
- **MAY**: optional when it improves the experience without reducing consistency.

Before creating a new pattern, reuse the closest existing component or extend it. If this specification needs to be changed, update it in the same change set as the UI so the document remains accurate.

## Product character

ByteLearn should feel calm, capable, and welcoming: a focused learning workspace, not a generic dashboard. Favor readable content, clear task hierarchy, warm neutral surfaces, and a restrained burgundy accent. Use whitespace and grouping to guide attention. Do not use decorative gradients, heavy glass effects, large shadows, or animation that competes with learning content.

## Foundations

### Typography

| Role | Font | Use | Tailwind guidance |
| --- | --- | --- | --- |
| Display and headings | Plus Jakarta Sans | Page titles, section titles, key metrics, primary actions | `font-semibold` or `font-bold`, `tracking-tight` |
| Body and controls | Noto Sans | Paragraphs, labels, inputs, tables, metadata | Regular by default; `font-medium` for emphasis |

- The default UI text MUST be legible at normal browser zoom. Do not reduce body text below `text-sm` (14px) except for compact, nonessential metadata.
- Establish hierarchy through size, weight, spacing, and placement before introducing more color.
- Use sentence case for labels, buttons, and headings. Keep button labels action-oriented (for example, “Upload video”, not “Submit”).

### Color tokens

Use these semantic tokens consistently. When the Tailwind theme does not yet expose a named token, use the specified value sparingly and centralize it before repeating it broadly.

| Token | Value | Intended use |
| --- | --- | --- |
| App background | `#fcf8f8` | Default page canvas |
| Surface | `#ffffff` | Cards, panels, dialogs, raised content |
| Primary | `#994d51` | Primary actions, selected/active states, meaningful links |
| Primary hover | `#7a3d41` | Hover and pressed feedback for primary controls |
| Secondary surface | `#f3e7e8` | Quiet controls, input fills, tags, selected-context backgrounds |
| Primary text | `slate-900` | Headings and essential content |
| Secondary text | `slate-500` | Supporting text, timestamps, low-priority metadata |
| Border | `slate-200` | Dividers and control boundaries |
| Destructive | semantic red | Errors and destructive actions only |

- Primary color MUST signal an actionable or selected state; it is not general decoration.
- Text and controls MUST meet accessible contrast requirements. Do not rely on color alone to communicate status.
- A surface is normally opaque white. Translucency is reserved for the sticky navigation layer only.

### Spacing, layout, and radii

- Use Tailwind’s spacing scale and favor a consistent rhythm: `gap-2`/`gap-3` within compact controls, `gap-4`/`gap-6` within sections, and `py-6`/`py-8` between major page regions.
- Page content SHOULD use a centered, responsive container. Retain the existing `max-w-7xl mx-auto` convention unless the content is intentionally narrow (for example, an authentication form or reading view).
- Use `rounded-lg` for buttons, inputs, dropdowns, and small panels; use `rounded-2xl` for video players and prominent cards; use `rounded-full` only for avatars, pills, and compact tags.
- Use borders and surface contrast before shadows. Cards use `shadow-sm` at rest and MAY use `shadow-md` on hover when the whole card is interactive. Dialogs and the chat drawer use `shadow-2xl`.

## Components and states

### Navigation

- The sticky header MUST preserve orientation and access to the most important actions without obscuring page content.
- Use `bg-white/70 backdrop-blur-md shadow-sm` for the sticky navigation treatment. Keep the effect subtle and pair it with a border or shadow that clearly separates it from scrolling content.
- Collapse secondary navigation before hiding primary navigation on smaller screens. Any hidden action MUST remain available through an accessible menu or alternate control.

### Buttons and links

- Each region SHOULD have one visually dominant primary action. Use the primary burgundy treatment for it.
- Secondary actions use a white or secondary-surface treatment with clear text and a visible border when needed for contrast.
- Icon-only buttons MUST have an accessible name and a visible hover/focus affordance.
- Buttons MUST communicate hover, active, disabled, and loading states. Disabled controls use `opacity-50 cursor-not-allowed` and cannot be the sole explanation for why an action is unavailable.
- Inline links use the primary color and remain distinguishable from surrounding text without depending only on color (for example, by context or underline on hover/focus).

### Inputs and forms

- Every input MUST have a persistent visible label; placeholders supplement labels and do not replace them.
- Inputs use the secondary surface or white surface, `rounded-lg`, and a subtle border. Validation feedback appears near the relevant field in text as well as color.
- Keep form actions grouped at the end of the form, with the primary action on the logical reading end.

### Cards, media, and collections

- Cards group related content and MUST not become arbitrary containers for every element. Prefer a simple page surface when grouping is unnecessary.
- Interactive cards provide a clear hover and keyboard-focus treatment without shifting surrounding layout.
- Video thumbnails use a stable aspect ratio, `object-cover`, and rounded corners. Important status or duration information MUST remain readable over imagery.
- Tags and chips are compact metadata, not primary controls: use `rounded-full bg-[#f3e7e8] text-slate-900` with restrained padding.

### Overlay surfaces

- Modals and the RAG chat drawer MUST sit above content with `shadow-2xl`, an accessible dismiss action, focus management, and an obvious return path to the triggering context.
- Drawers MAY use a transform transition (such as `-translate-x` to its resting position), but the transition MUST respect reduced-motion preferences.

### Feedback states

Every API-driven view MUST implement all applicable states:

| State | Required behavior |
| --- | --- |
| Loading | Show a layout-shaped placeholder or concise progress indicator; do not leave a blank region. |
| Empty | Explain what is absent and provide the next useful action when one exists. |
| Error | Explain what failed in plain language and offer retry or recovery when possible. |
| Success | Confirm consequential actions without interrupting the user unnecessarily. |

## Interaction, motion, and accessibility

- All interactive elements MUST provide a visible keyboard focus style: `focus:outline-none focus:ring-2 focus:ring-[#994d51]/50` or an equivalent accessible treatment.
- Use semantic HTML first. Controls must be operable by keyboard, icon-only controls need accessible names, and images need meaningful alternative text unless decorative.
- Respect `prefers-reduced-motion`. Motion SHOULD be brief, purposeful, and limited to feedback, entering/exiting overlays, and non-layout-breaking transitions.
- Responsive design is required: validate small mobile, tablet, and desktop widths. Do not rely on hover for functionality, use horizontal scrolling only when it is the clearest treatment, and prevent clipped controls or text.

## Implementation and review checklist

An implementation conforms to this specification when it:

- uses the type roles, semantic colors, spacing rhythm, and radius scale above;
- has an intentional primary action and coherent information hierarchy;
- covers hover, focus, active, disabled, loading, empty, and error states as applicable;
- works with keyboard navigation and at mobile, tablet, and desktop widths;
- reuses or sensibly extends existing components without changing API, auth, route, or role behavior; and
- avoids new one-off hardcoded styling when an existing semantic token or reusable pattern fits.

## Notes for future changes

This is a desired-state specification, not an inventory of current CSS. Legacy styles may not yet conform. When a task touches a legacy surface, move it toward this specification within the task’s scope; do not perform unrelated visual rewrites.
