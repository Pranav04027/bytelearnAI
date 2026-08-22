# Frontend Architecture

This document outlines the current architecture of the ByteLearn frontend application. It is a factual representation of the existing structure and patterns.

## 1. Technology Stack

- **Framework:** React 19
- **Build Tool:** Vite
- **Styling:** Tailwind CSS (v3.4.17)
- **Routing:** React Router v7
- **HTTP Client:** Axios

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
- **Centralized API:** All external data fetching is routed through modules in the `src/api/` directory. A custom Axios instance (`axios.js`) is used to handle default configurations, interceptors, and authentication headers.
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
