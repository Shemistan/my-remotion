// Точка входа UI.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { shouldRetry } from "./api/client.js";
import { App } from "./App.js";
import "./theme.css";
import "./fonts.css";

const client = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2_000,
      retry: shouldRetry,
      refetchOnWindowFocus: true,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
