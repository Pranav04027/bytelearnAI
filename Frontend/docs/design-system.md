# Design System

This document catalogs the current design patterns, visual elements, and UI components as they exist in the ByteLearn frontend codebase.

## 1. Typography
- **Primary Font Family:** "Plus Jakarta Sans", "Noto Sans", system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif.
- **Global Scaling:** The root `html` font-size is set to `15px` to create a subtle global zoom-out effect.
- **Classes Used:** Standard Tailwind text sizing (`text-sm`, `text-[15px]`, `text-[32px]`) and font weights (`font-medium`, `font-semibold`, `font-bold`) are heavily used.

## 2. Color Palette
The application relies heavily on hardcoded hex colors defined in utility classes, rather than named theme colors in `tailwind.config.js`.

- **Background (App):** `#fcf8f8`
- **Primary Text:** `#1b0e0e`
- **Secondary / Accent Text:** `#994d51`
- **Secondary Backgrounds (Inputs, Chips, Hover States):** `#f3e7e8`
- **Borders / Dividers:** `#e7d0d1` (and `white/30` or `white/20` for glass effects)
- **Primary Button Background:** Blue (`bg-blue-600` in `.btn`) and Dark (`#1b0e0e` for some UI buttons).

## 3. Spacing & Sizing
- Spacing relies entirely on Tailwind's default spacing scale.
- Common padding values: `px-4 py-2` (buttons), `p-3` (cards), `gap-2`, `gap-3` (flex containers).
- Component-specific heights: `h-10` (search bar), `h-16` (navbar), `h-9` w-9` (avatars).

## 4. Component Styles

### Buttons
- **Global `.btn` Class (from `index.css`):** `@apply bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700;`
- **Dark Action Buttons (e.g., Upload, Sign Up):** `bg-[#1b0e0e] text-white px-4 py-2 rounded-lg text-sm font-bold hover:opacity-90`
- **Secondary/Icon Buttons:** `bg-[#f3e7e8] text-[#1b0e0e] rounded-lg`

### Inputs & Forms
- **Global `.input` Class (from `index.css`):** `@apply block w-full mb-4 p-2 border rounded;`
- **Search Bar (Navbar):** Uses a custom gray background (`bg-[#f3e7e8]`), rounded corners (`rounded-lg`), with border-none to blend the input field and search icon. Text color is `#1b0e0e` and placeholder is `#994d51`.

### Cards
- **Video Cards:** 
  - Background: `bg-white/70` with `hover:bg-white`.
  - Border/Shadow: `rounded-xl`, `shadow-sm`, `hover:shadow-md`.
  - Layout: `p-3` padding, flex/grid internal structure with `transition` effects on hover.
  - Image: `w-full h-44 object-cover rounded-lg`.

### Badges / Chips
- **Category & Difficulty Chips:** `rounded-full bg-[#f3e7e8] text-[#1b0e0e] px-2 py-0.5 text-[11px] font-medium`.

### Navigation & Layout
- **Navbar (Header):** Features a glassmorphism effect: `bg-white/60 backdrop-blur-md border-b border-white/30`. It is positioned via `relative z-50` with a height of `h-16`.
- **Main Container:** Constrained to `max-w-7xl mx-auto`.
- **Dropdown Menus (Avatar):** Floating menus use `bg-white/70 backdrop-blur-lg shadow-xl rounded-lg border border-white/20`.

## 5. Responsive Behavior
- **Breakpoints:** The app uses Tailwind's default breakpoints (`sm:`, `md:`, `lg:`).
- **Navigation Collapse:** Elements like search bars and secondary navigation links are hidden on small screens (`hidden md:flex`, `hidden sm:flex`).
- **Grids:** The video list utilizes a responsive grid layout: `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4`.
