# Frontend Conventions

This document outlines the coding patterns and conventions that are currently established in the ByteLearn frontend codebase. It serves as a factual guide based on the existing implementation.

## 1. File Naming and Extensions
- **React Components:** Use PascalCase and the `.jsx` extension (e.g., `Layout.jsx`, `VideoList.jsx`, `ProtectedRoute.jsx`).
- **Hooks, Contexts, and Utilities:** Use camelCase and the `.js` extension (e.g., `useAuth.js`, `auth.js`, `axios.js`).

## 2. Component Structure
- **Function Components:** Components are written as arrow functions (e.g., `const ComponentName = () => { ... }`).
- **Exports:** Components are exported using `export default ComponentName;` at the bottom of the file.
- **Props:** Components accept props directly (e.g., `const VideoCard = ({ video }) => { ... }`).
- **Inline Components:** Some files currently define small, helper components (like `Chip`) within the same file as the primary page component.

## 3. API Integration
- **Named Exports:** API service functions are individually exported as named arrow functions (e.g., `export const searchVideos = async () => { ... }`).
- **Error Handling:** All API calls are wrapped in `try/catch` blocks. The catch block consistently extracts the error message using: `throw error.response?.data || error.message;`.
- **Axios Wrapper:** An internal `axios` instance from `src/api/axios.js` is imported and used for all network requests.

## 4. State and Data Fetching
- **Local State:** Component data, loading states, and error messages are managed locally using `useState`.
- **Effect Cleanup:** `useEffect` hooks that perform async operations use a local `let mounted = true;` flag to prevent state updates on unmounted components (e.g., setting `mounted = false` in the cleanup function).
- **Loading/Error States:** Explicit state variables (`const [loading, setLoading] = useState(true)` and `const [error, setError] = useState("")`) are used to toggle UI rendering. Error/loading placeholders are currently basic text elements.

## 5. Styling
- **Tailwind Utility Classes:** Styling is applied using Tailwind CSS utility classes directly within the `className` attribute.
- **Hardcoded Colors:** Specific hex values are hardcoded as arbitrary values in utility classes rather than mapped to theme variables (e.g., `text-[#1b0e0e]`, `bg-[#f3e7e8]`).
- **Global Styles:** A few global generic classes (`.btn`, `.input`) are constructed using Tailwind's `@apply` directive inside `src/index.css`.

## 6. Routing and Imports
- **Imports:** Imports utilize relative paths (e.g., `../../api/videos.js`). No path aliases (like `@/`) are currently configured.
- **Routing Wrappers:** Protected access is enforced by wrapping elements in `ProtectedRoute` and `RoleRoute` directly within the route definitions in `AppRoutes.jsx`.
