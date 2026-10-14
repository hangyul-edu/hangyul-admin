import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError, setErrorAudience } from "../lib/http";
import { setCurrentLanguage } from "../i18n/current";
import { ToastProvider } from "../hooks/toast";
import { AdminAuthProvider } from "./auth";
import { AdminErrorBoundary } from "./components/ErrorBoundary";
import { AdminApp } from "./App";
import "../styles/theme.css";
import "./styles/admin.css";
import "./styles/insights.css";
import "./styles/bulkImport.css";
import "./styles/checkpointContent.css";

// The portal is Korean; its errors are worded for operators (i18n/apiErrors).
setCurrentLanguage("ko");
setErrorAudience("admin");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => {
        if (err instanceof ApiError && err.status < 500 && err.status !== 429) return false;
        return count < 2;
      },
      refetchOnWindowFocus: false,
      staleTime: 15_000,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AdminErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AdminAuthProvider>
            <AdminApp />
          </AdminAuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </AdminErrorBoundary>
  </React.StrictMode>,
);
