// Общее для юнит-тестов UI: фейковый fetch (только логика UI, без сервера) и рендер с
// QueryClient.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";

export interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

type Route = (call: Call) => { status?: number; body?: unknown } | undefined;

/** Подменяет `fetch`: ответ по первому совпавшему маршруту, иначе 404; все вызовы — в `calls`. */
export function fakeFetch(routes: Route[] = []) {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((v, k) => (headers[k] = v));
    const call: Call = {
      method: (init.method ?? "GET").toUpperCase(),
      url: String(input),
      headers,
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    for (const r of routes) {
      const out = r(call);
      if (out) return new Response(JSON.stringify(out.body ?? {}), { status: out.status ?? 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: "not_found", message: "нет" }), { status: 404, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fn);
  return { calls, fn };
}

export const on = (method: string, path: string | RegExp, body: unknown, status = 200): Route => (c) =>
  c.method === method && (typeof path === "string" ? c.url === path : path.test(c.url)) ? { status, body } : undefined;

export function renderQ(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) };
}

export const TS = "2026-10-23T10:00:00.000Z";

export function job(over: Record<string, unknown> = {}) {
  return {
    id: "job_1", type: "playground.generate", project_id: "p1", scene_id: "s1", version_id: null, parent_job_id: null,
    status: "running", progress: 0.4, stage: "render", attempt: 1, max_attempts: 3, interrupts: 0, input: {}, input_hash: null,
    output_refs: null, error: null, idempotency_key: "k", lease_owner: null, lease_until: null, cancel_requested: false,
    created_at: TS, started_at: TS, finished_at: null, ...over,
  };
}
