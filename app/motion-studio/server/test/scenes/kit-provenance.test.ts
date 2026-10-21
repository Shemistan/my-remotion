// PROVENANCE.md motion-kit сверяется с KB: у каждого компонента kit есть строка, kb_id —
// существующая запись KB или `own`, лицензия источника permissive, commit — из
// repositories.json. Код из restricted/unknown-источников в kit не попадает.
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { MOTION_KIT_DIR } from "@ms/render";
import { beforeAll, describe, expect, it } from "vitest";
import { KnowledgeAdapter } from "../../src/knowledge/adapter.js";
import { repoKnowledge, sourceRoot } from "../knowledge/helpers.js";

interface Row {
  line: number;
  components: string[];
  kbId: string;
  repo: string;
  license: string;
  taken: string;
  rendered: string;
}

const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
/** Имена в обратных кавычках: `Name`, `<Name>`, `fn(args)`, `Comp prop="…"` → имя. */
const ticked = (cell: string) => [...cell.matchAll(/`<?([A-Za-z][\w.]*)[^`]*`/g)].map((m) => m[1]!);

/** Строки таблиц происхождения (шапка «Компонент» или «Примитив»); пустая первая ячейка — продолжение. */
function parseProvenance(md: string): Row[] {
  const rows: Row[] = [];
  let inTable = false;
  let prev: string[] = [];
  md.split("\n").forEach((line, i) => {
    if (!line.startsWith("|")) {
      inTable = false;
      return;
    }
    const c = cells(line);
    if (c[0] === "Компонент" || c[0] === "Примитив") {
      inTable = c[1] === "kb_id";
      return;
    }
    if (!inTable || /^-+$/.test(c[0]!.replace(/[:\s]/g, ""))) return;
    const components = c[0] ? ticked(c[0]) : prev;
    prev = components;
    rows.push({ line: i + 1, components, kbId: c[1]!.replace(/`/g, ""), repo: c[2]!, license: c[3]!, taken: c[4]!, rendered: c[5] ?? "" });
  });
  return rows;
}

/** Экспортированные компоненты (PascalCase, не КОНСТАНТЫ) из components/*.tsx. */
async function componentExports(): Promise<string[]> {
  const dir = join(MOTION_KIT_DIR, "components");
  const out: string[] = [];
  for (const f of (await readdir(dir)).filter((n) => n.endsWith(".tsx")).sort()) {
    const src = await readFile(join(dir, f), "utf8");
    for (const m of src.matchAll(/^export (?:function|const) ([A-Z][a-z]\w*)/gm)) out.push(m[1]!);
  }
  return out;
}

describe("PROVENANCE.md motion-kit", () => {
  let kb: KnowledgeAdapter;
  let rows: Row[];
  let repos: Map<string, { name: string; commit: string }>;

  beforeAll(async () => {
    kb = await KnowledgeAdapter.load({ kbRoot: repoKnowledge, sourceRoot });
    rows = parseProvenance(await readFile(join(MOTION_KIT_DIR, "PROVENANCE.md"), "utf8"));
    const file = JSON.parse(await readFile(join(repoKnowledge, "repositories.json"), "utf8")) as { repositories: { id: string; name: string; commit: string }[] };
    repos = new Map(file.repositories.map((r) => [r.id, r]));
  });

  it("таблицы разобраны: есть строки и kb_id, и own", () => {
    expect(rows.length).toBeGreaterThan(20);
    expect(rows.some((r) => r.kbId === "own")).toBe(true);
    expect(rows.some((r) => r.kbId !== "own")).toBe(true);
  });

  it("каждый компонент из components/* есть в PROVENANCE.md", async () => {
    const listed = new Set(rows.flatMap((r) => r.components));
    const exported = await componentExports();
    expect(exported).toEqual(expect.arrayContaining(["BarChart", "AreaChart", "ComparisonSplit", "Timeline", "ProcessSteps", "Callout", "Highlight", "CodeBlock", "Particles"]));
    expect(exported.filter((name) => !listed.has(name))).toEqual([]);
  });

  it("kb_id — запись KB или own; источник permissive, commit и репозиторий — из repositories.json", () => {
    const problems: string[] = [];
    for (const r of rows) {
      const at = `PROVENANCE.md:${r.line} (${r.kbId})`;
      if (r.components.length === 0) problems.push(`${at}: нет компонента`);
      if (!/^ok\b/.test(r.rendered)) problems.push(`${at}: rendered не ok — «${r.rendered}»`);
      if (r.kbId === "own") continue;
      const cap = kb.getCapability(r.kbId);
      if (!cap) {
        problems.push(`${at}: нет в knowledge/capabilities.jsonl`);
        continue;
      }
      if (cap.license_class !== "permissive") problems.push(`${at}: лицензия ${cap.license_class} (${cap.license})`);
      const m = /^(\S+) @ (\S+)$/.exec(r.repo);
      if (!m) {
        problems.push(`${at}: репозиторий не в виде «id @ commit» — «${r.repo}»`);
        continue;
      }
      const repo = repos.get(m[1]!);
      if (!repo) problems.push(`${at}: репозитория ${m[1]} нет в repositories.json`);
      else {
        if (repo.commit !== m[2]) problems.push(`${at}: commit ${m[2]} ≠ ${repo.commit} из repositories.json`);
        if (repo.name !== cap.repository) problems.push(`${at}: kb_id из ${cap.repository}, а строка — ${repo.name}`);
      }
      if (cap.commit !== m[2]) problems.push(`${at}: commit KB ${cap.commit} ≠ ${m[2]}`);
      if (r.taken === "" || r.taken === "—") problems.push(`${at}: не сказано, что взято`);
    }
    expect(problems).toEqual([]);
  });

  it("restricted-источники не упоминаются как kb_id", () => {
    for (const r of rows.filter((x) => x.kbId !== "own")) expect(r.kbId).not.toMatch(/^(react-bits|remotion-boilerplate|remotion-skills)\//);
  });
});
