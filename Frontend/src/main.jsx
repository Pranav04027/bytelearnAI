import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import AppRoutes from "./routes/AppRoutes.jsx";
import AuthProvider from "./contexts/AuthContext.jsx";
import "./index.css";

// Disable the browser's automatic scroll restoration. Otherwise it re-applies
// the previous page's scroll offset to the new history entry once content
// loads, overriding our manual scroll-to-top on navigation.
if ("scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
