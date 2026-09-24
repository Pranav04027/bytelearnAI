# Frontend Architecture

This document outlines the current architecture of the ByteLearn frontend application. It is a factual representation of the existing structure and patterns.

## 1. Technology Stack

- **Framework:** React 19
- **Build Tool:** Vite
- **Styling:** Tailwind CSS (v3.4.17)
- **Routing:** React Router v7
- **HTTP Clients:** Axios for ordinary API calls; native fetch for chat SSE

## 2. Directory Structure

The application source code is primarily organized within the `src/` directory:

- `src/api/`: Contains isolated API service modules (e.g., `auth.js`, `videos.js`, `axios.js`). This layer manages API communication and abstracts HTTP requests.
- `src/components/`: Houses reusable layout and UI components (e.g., `Layout.jsx`, `Navbar.jsx`, `Footer.jsx`, `ToastHost.jsx`), as well as route guards (`ProtectedRoute.jsx`, `RoleRoute.jsx`).
- `src/contexts/`: Contains React Context providers for global state (e.g., `AuthContext.jsx`).
- `src/hooks/`: Contains custom React hooks (e.g., `useAuth.js`).
- `src/pages/`: Contains the application's page-level components, grouped by feature domain (e.g., `Auth/`, `Videos/`, `Dashboard/`, `Profile/`).
- `src/routes/`: Contains the main routing configuration (`AppRoutes.jsx`).

## 3. Core Patterns

### Routing
The application utilizes client-side routing via `react-router-dom`. The routing configuration is centralized in `src/routes/AppRoutes.jsx`.
- **Public Routes:** Accessible to all users (e.g., Home, Login, Register, Search).
- **Protected Routes:** Wrapped in `ProtectedRoute.jsx` to enforce authentication.
- **Role-Based Routes:** Wrapped in `RoleRoute.jsx` to restrict access based on user roles (e.g., `INSTRUCTOR` vs. `LEARNER`).

### API and Data Fetching
- **API modules:** Ordinary requests use `src/api/` and its shared Axios instance (`axios.js`) for configuration and interceptors. Public video chat uses native `fetch` directly in `VideoChatBody.jsx`, reusing the Axios base URL so it can consume a streaming POST response.
- **Fetching Strategy:** Data fetching within components is managed using native React hooks (`useEffect` and `useState`). Loading and error states are handled locally within individual page components.

### State Management
- **Global State:** React's Context API is used for application-wide state. `AuthContext.jsx` specifically manages user sessions, tokens, and role information.
- **Local State:** Component-specific state (such as UI toggles, form inputs, and localized data) is managed via `useState` and `useMemo`.

### Component Structure
- **Layout Wrapper:** The application uses a unified `Layout.jsx` component that wraps the main content area, providing a persistent navigation bar and conditionally rendering the footer.
- **Page Components:** Components in `src/pages/` serve as the entry points for routes. Some page components currently contain inline definitions of smaller UI elements (e.g., cards, chips) rather than importing them from the `components/` directory.

### Styling System
- The primary styling mechanism is Tailwind CSS.
- **Global Theme:** A global baseline theme (fonts, default background, text colors, and font-sizing) is defined in `src/index.css`.
- **Utility Classes:** Styling is predominantly applied via Tailwind utility classes directly in JSX. Hex colors (e.g., `#1b0e0e`, `#fcf8f8`, `#994d51`) are heavily utilized as hardcoded values within class names across the application.
- **Responsive Design:** Standard Tailwind responsive prefixes (`sm:`, `md:`, `lg:`) are used to adapt layouts across different viewport sizes.

## 4. Conversational video chat

Video selection routes to `src/pages/Videos/VideoDetail.jsx`, whose media element
is shared with the desktop chat panel and mobile drawer through `onSeekToMs`.
`VideoChatBody.jsx` owns component-local bubbles and a UUID v4 under
`bytelearn:conversation:${videoId}` in sessionStorage. It sends
`{ videoId, question, conversationId }` to `/api/v1/embeddings/answer` (or the
configured base plus `/embeddings/answer`). This endpoint is public; the UUID is
a resume identifier, not user authentication.

The fetch reader uses buffered streaming TextDecoder decoding and blank-line SSE
framing. Tokens append to a draft; done supplies final text/current-source metadata.
Error or premature EOF removes the incomplete draft and shows an error. Sources
become timestamp chips; the parent converts startMs to seconds for `currentTime`.
Canonical abstention is displayed as “Not covered in this video”.

New conversation first broadcasts abort to both mounted surfaces, then replaces
the stored ID and clears UI state. Storage/UUID failure disables sending; there
is no fallback to the old ID after a failed reset. Unmount/video change aborts and
clears local state; stale fetch results cannot mutate a new conversation.

Backend state uses PostgreSQL checkpoints. The old in-memory-only comment in
`VideoChatBody.jsx` does not describe the current injected production runtime.
Session storage preserves the ID across refresh, not old visible messages; no
history-restoration endpoint is called. Reset does not delete old checkpoints.

For graph, persistence, cancellation and trust limits, see the
[final architecture](../../Backend/BYTELEARN_V2_ARCHITECTURE_MAP.md).
[Stage 9](../../Backend/docs/stage-9-acceptance.md) verified chat in jsdom/fake fetch;
real browser seek/reset/cancellation and full live acceptance were not run.
