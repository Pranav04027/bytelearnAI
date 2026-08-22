# Frontend Agent Instructions

## Project Context

This is the frontend application for the project.

The frontend is a fully functional React 19 + Vite application. The current goal is to significantly improve its UI/UX and visual design while preserving existing functionality.

The backend is located in `../backend`.

---

## Primary Objective

Improve the frontend's:

* visual design
* UX
* consistency
* responsiveness
* accessibility
* loading/error/empty states
* component reusability
* overall polish

The redesign must not break existing application functionality.

---

## Technology

* React 19
* Vite
* Tailwind CSS 3.4.17
* React Router v7
* Axios
* React Context API

The existing project architecture should be respected unless a change is explicitly justified.

---

## Critical Functional Boundaries

The following functionality must be preserved unless explicitly requested otherwise.

### API Layer

`src/api/`

Do not change:

* API endpoint paths
* request payloads
* response contracts
* authentication headers
* existing backend integration behavior

UI changes should consume the existing API layer rather than bypassing it.

### Authentication

Preserve the existing behavior of:

* `AuthContext.jsx`
* token persistence
* user session handling
* role validation

Do not rewrite authentication as part of a UI redesign.

### Routing

Preserve existing route paths in:

`src/routes/AppRoutes.jsx`

Do not change route URLs or remove routes unless explicitly requested.

### Route Guards

Preserve the functional behavior of:

* `ProtectedRoute.jsx`
* `RoleRoute.jsx`

Do not weaken or bypass authentication or role-based access controls.

---

## UI/UX Guidelines

When redesigning UI:

* Prioritize visual hierarchy and clarity.
* Maintain consistent spacing and typography.
* Build responsive layouts for mobile, tablet, and desktop.
* Use accessible semantic HTML.
* Provide polished loading, error, and empty states.
* Use consistent interaction states such as hover, focus, active, and disabled.
* Prefer subtle, purposeful animations over excessive animation.
* Avoid visual clutter.
* Reuse existing components where appropriate.

The goal is a cohesive product, not a collection of individually attractive pages.

---

## Styling

The current application uses Tailwind CSS and a global theme in `src/index.css`.

Before introducing new styling patterns:

1. Inspect the existing styling system.
2. Check whether an existing token or utility can be reused.
3. Prefer centralized design tokens for values that are reused throughout the application.
4. Avoid unnecessarily scattering hardcoded colors throughout JSX.

Do not introduce a second styling system without a clear reason.

---

## Component Reuse

Before creating a new component:

1. Search for an existing component that performs a similar function.
2. Determine whether the existing component can be improved or generalized.
3. Avoid creating duplicate implementations of the same UI pattern.

Inline components may be extracted when doing so meaningfully improves reuse and maintainability.

Do not refactor components solely for the sake of refactoring.

---

## Refactoring

UI refactoring is allowed when it directly supports the redesign.

However:

* Do not perform unrelated architectural rewrites.
* Do not change working business logic unnecessarily.
* Do not replace libraries without a clear reason.
* Do not introduce new dependencies merely for convenience.
* Preserve existing API, authentication, routing, and role behavior.

If a proposed visual improvement requires a significant architectural or functional change, explain the tradeoff before implementing it.

---

## Existing Design

The current design system and frontend conventions are documented in:

* `docs/design-system.md`
* `docs/frontend-conventions.md`
* `docs/architecture.md`

Read the relevant documentation before making substantial UI changes.

These documents describe the current project and should be updated when important design or architectural decisions are made.

---

## Implementation Workflow

For a significant UI change:

1. Inspect the existing implementation.
2. Understand its functionality and dependencies.
3. Identify reusable components.
4. Check the relevant documentation.
5. Propose the visual/UX approach when the desired design is ambiguous.
6. Implement the change.
7. Verify that existing functionality still works.
8. Check responsive behavior.
9. Check loading, error, and empty states where applicable.
10. Run relevant type checks, linting, and tests.

Do not make unrelated changes while implementing a UI feature.

---

## Verification

Before considering a UI task complete:

* Verify the affected page in the browser.
* Check desktop and mobile layouts.
* Check interactive states.
* Check existing navigation and functionality.
* Check API-driven states.
* Run available type checks.
* Run available linting.
* Run relevant tests.

A visually successful change that breaks existing functionality is not considered successful.