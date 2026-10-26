// Маршруты UI на History API (без библиотеки): сервер на любой не-API путь отдаёт index.html
// (SPA-fallback). `navigate` меняет адрес и оповещает подписчиков.
import { useSyncExternalStore } from "react";

export type Route =
  | { name: "dashboard" }
  | { name: "project"; id: string }
  | { name: "scene"; id: string; version?: string }
  | { name: "compare"; sceneId: string; a: string; b: string }
  | { name: "kb"; q?: string; id?: string }
  | { name: "jobs"; status?: string }
  | { name: "settings" }
  // Phase 6 (Task 35′): диагностика (Task 48), центр восстановления (Task 47)
  | { name: "diagnostics" }
  | { name: "recovery" }
  | { name: "notFound" };

export function parseRoute(pathname: string, search: string): Route {
  const q = new URLSearchParams(search);
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const opt = (k: string) => q.get(k) ?? undefined;
  if (parts.length === 0) return { name: "dashboard" };
  const [head, id, sub] = parts;
  if (head === "projects" && id && parts.length === 2) return { name: "project", id };
  if (head === "scenes" && id && parts.length === 2) return { name: "scene", id, ...(opt("v") ? { version: opt("v")! } : {}) };
  if (head === "scenes" && id && sub === "compare" && q.get("a") && q.get("b")) return { name: "compare", sceneId: id, a: q.get("a")!, b: q.get("b")! };
  if (head === "kb" && parts.length === 1) return { name: "kb", ...(opt("q") ? { q: opt("q")! } : {}), ...(opt("id") ? { id: opt("id")! } : {}) };
  if (head === "jobs" && parts.length === 1) return { name: "jobs", ...(opt("status") ? { status: opt("status")! } : {}) };
  if (head === "settings" && parts.length === 1) return { name: "settings" };
  if (head === "diagnostics" && parts.length === 1) return { name: "diagnostics" };
  if (head === "recovery" && parts.length === 1) return { name: "recovery" };
  return { name: "notFound" };
}

export function href(r: Route): string {
  const enc = encodeURIComponent;
  const qs = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries(o).filter((e): e is [string, string] => Boolean(e[1])));
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  switch (r.name) {
    case "dashboard": return "/";
    case "project": return `/projects/${enc(r.id)}`;
    case "scene": return `/scenes/${enc(r.id)}${qs({ v: r.version })}`;
    case "compare": return `/scenes/${enc(r.sceneId)}/compare${qs({ a: r.a, b: r.b })}`;
    case "kb": return `/kb${qs({ q: r.q, id: r.id })}`;
    case "jobs": return `/jobs${qs({ status: r.status })}`;
    case "settings": return "/settings";
    case "diagnostics": return "/diagnostics";
    case "recovery": return "/recovery";
    case "notFound": return "/";
  }
}

const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  window.addEventListener("popstate", l);
  return () => {
    listeners.delete(l);
    window.removeEventListener("popstate", l);
  };
};
const snapshot = () => `${window.location.pathname}${window.location.search}`;

export function navigate(to: Route | string, opts: { replace?: boolean } = {}): void {
  const url = typeof to === "string" ? to : href(to);
  if (url === snapshot()) return;
  if (opts.replace) window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
  for (const l of [...listeners]) l();
  if (!opts.replace) window.scrollTo?.(0, 0);
}

export function useRoute(): Route {
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  const i = s.indexOf("?");
  return parseRoute(i < 0 ? s : s.slice(0, i), i < 0 ? "" : s.slice(i));
}

/** Строка запроса текущего адреса (`?…` или пусто): меняется при `navigate` и «назад». */
export function useSearch(): string {
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  const i = s.indexOf("?");
  return i < 0 ? "" : s.slice(i);
}
