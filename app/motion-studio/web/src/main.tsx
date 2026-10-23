// Точка входа UI.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ApiError } from "./api/client.js";
import { App } from "./App.js";
import "./theme.css";

const client = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2_000,
      // 4xx не повторяем (ошибка запроса), 503 и сеть — до двух раз
      retry: (n, e) => n < 2 && !(e instanceof ApiError && e.status >= 400 && e.status < 500),
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
