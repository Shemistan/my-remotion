// `render_lock_sha256` (ruling 2026-10-23): отпечаток только зависимостей рендера — замыкание
// workspace `@ms/render` (вместе с Remotion и workspace-ссылками) по package-lock.json.
// Зависимости UI (`web`) и dev-инструменты на него не влияют.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderLockSha256 } from "../../src/pipeline/render-env.js";

type Lock = { packages: Record<string, Record<string, unknown>> };

const pkg = (version: string, deps: Record<string, string> = {}, over: Record<string, unknown> = {}) => ({
  version, resolved: `https://registry.npmjs.org/x/-/x-${version}.tgz`, integrity: `sha512-${version}`, dependencies: deps, ...over,
});

function fixture(): Lock {
  return {
    packages: {
      "": { name: "motion-studio", workspaces: ["contracts", "render", "web"], devDependencies: { vitest: "1" } },
      contracts: { name: "@ms/contracts", dependencies: { zod: "^3" } },
      render: { name: "@ms/render", dependencies: { "@ms/contracts": "*", remotion: "4.0.0", react: "19" }, devDependencies: { "enhanced-resolve": "1" } },
      web: { name: "@ms/web", dependencies: { react: "19", "@tanstack/react-query": "5" }, devDependencies: { vite: "8", jsdom: "29" } },
      "node_modules/@ms/contracts": { resolved: "contracts", link: true },
      "node_modules/@ms/render": { resolved: "render", link: true },
      "node_modules/@ms/web": { resolved: "web", link: true },
      "node_modules/zod": pkg("3.25.0"),
      "node_modules/remotion": pkg("4.0.0", { scheduler: "^1" }),
      "node_modules/scheduler": pkg("1.0.0"),
      "node_modules/react": pkg("19.2.3"),
      "node_modules/@tanstack/react-query": pkg("5.104.1"),
      "node_modules/vite": pkg("8.3.4", { rollup: "^4" }),
      "node_modules/rollup": pkg("4.0.0"),
      "node_modules/vitest": pkg("4.0.0"),
      "node_modules/enhanced-resolve": pkg("5.0.0"),
      "web/node_modules/jsdom": pkg("29.1.1"),
    },
  };
}

const hash = (l: Lock) => renderLockSha256(JSON.stringify(l));
const edit = (fn: (p: Lock["packages"]) => void): Lock => {
  const l = fixture();
  fn(l.packages);
  return l;
};

describe("renderLockSha256", () => {
  it("изменение зависимостей web, dev-инструментов и root не меняет отпечаток", () => {
    const base = hash(fixture());
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(hash(edit((p) => (p["node_modules/vite"] = pkg("8.4.0", { rollup: "^4" }))))).toBe(base);
    expect(hash(edit((p) => (p["node_modules/rollup"] = pkg("4.1.0"))))).toBe(base);
    expect(hash(edit((p) => (p["web/node_modules/jsdom"] = pkg("30.0.0"))))).toBe(base);
    expect(hash(edit((p) => (p["node_modules/@tanstack/react-query"] = pkg("5.200.0"))))).toBe(base);
    expect(hash(edit((p) => (p["node_modules/vitest"] = pkg("5.0.0"))))).toBe(base);
    // devDependencies самого render в рантайм рендера не попадают
    expect(hash(edit((p) => (p["node_modules/enhanced-resolve"] = pkg("6.0.0"))))).toBe(base);
    // новый пакет UI
    expect(hash(edit((p) => (p["node_modules/@playwright/test"] = pkg("1.64.0"))))).toBe(base);
  });

  it("изменение remotion, его транзитивной зависимости, общего react или workspace-ссылки меняет отпечаток", () => {
    const base = hash(fixture());
    expect(hash(edit((p) => (p["node_modules/remotion"] = pkg("4.0.1", { scheduler: "^1" }))))).not.toBe(base);
    expect(hash(edit((p) => (p["node_modules/scheduler"] = pkg("1.0.1"))))).not.toBe(base);
    expect(hash(edit((p) => (p["node_modules/react"] = pkg("19.2.4"))))).not.toBe(base);
    expect(hash(edit((p) => (p["node_modules/zod"] = pkg("3.26.0"))))).not.toBe(base);
    // вложенная копия у render важнее поднятой
    expect(hash(edit((p) => (p["render/node_modules/remotion"] = pkg("4.0.9", { scheduler: "^1" }))))).not.toBe(base);
  });

  it("реальный package-lock.json: смена версии jsdom (web) не меняет отпечаток, remotion — меняет", () => {
    const lock = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "..", "package-lock.json"), "utf8")) as Lock;
    const base = hash(lock);
    const web = structuredClone(lock);
    const jsdomKey = Object.keys(web.packages).find((k) => k.endsWith("node_modules/jsdom"))!;
    web.packages[jsdomKey] = { ...web.packages[jsdomKey], version: "99.0.0", integrity: "sha512-other" };
    expect(hash(web)).toBe(base);
    const rem = structuredClone(lock);
    rem.packages["node_modules/remotion"] = { ...rem.packages["node_modules/remotion"], version: "9.9.9", integrity: "sha512-other" };
    expect(hash(rem)).not.toBe(base);
  });
});
