// sha256 исходников KB до/после приёмки (`09` §1 п. 6, Task 22): ВСЕ файлы `templates/` и
// `official_skills/` (KB_SOURCE_ROOT — main checkout) и `knowledge/`; `.git` и `node_modules`
// не входят. ~26 тыс. файлов, ~0,7 ГБ — около 4 с.
//   node scripts/kb-hashes.mjs before <evidence> [<полные>]  → снимок «до»
//   node scripts/kb-hashes.mjs after <evidence> [<полные>]   → снимок «после» и сверка с «до»;
//                                                               код 1 при расхождении
// Полный снимок (sha256 каждого файла) — `<полные>/kb-hashes-<режим>.json` (без третьего
// аргумента — в `<evidence>`); в `<evidence>` — сводка: число файлов и общий digest, а после
// сверки — `kb-hashes-diff.json` со списком расхождений. Домашний каталог в путях — `~`.
/* global process, URL, console */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = fileURLToPath(new URL("../../../", import.meta.url)).replace(/\/$/, "");
// исходники KB лежат в main checkout; из worktree — путь до `.claude/worktrees/`
const SOURCE_ROOT = process.env.KB_SOURCE_ROOT ?? REPO.split("/.claude/worktrees/")[0];
const KB_ROOT = process.env.KB_ROOT ?? join(REPO, "knowledge");
const SKIP = new Set([".git", "node_modules"]);

function walk(root, sub = "") {
  const out = [];
  for (const e of readdirSync(join(root, sub), { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const rel = sub ? `${sub}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(root, rel));
    else if (e.isFile()) out.push(rel);
  }
  return out;
}

const sha = (data) => createHash("sha256").update(data).digest("hex");
const home = homedir();
/** Путь для evidence: домашний каталог → `~`. */
export const tilde = (p) => (p.startsWith(home) ? `~${p.slice(home.length)}` : p);

function snapshot() {
  const sources = ["templates", "official_skills"].flatMap((d) => (existsSync(join(SOURCE_ROOT, d)) ? walk(SOURCE_ROOT, d) : [])).sort();
  const files = {};
  for (const rel of sources) files[`source:${rel}`] = sha(readFileSync(join(SOURCE_ROOT, rel)));
  const knowledge = walk(KB_ROOT).sort();
  for (const rel of knowledge) files[`knowledge:${rel}`] = sha(readFileSync(join(KB_ROOT, rel)));
  return { created_at: new Date().toISOString(), source_root: tilde(SOURCE_ROOT), kb_root: tilde(KB_ROOT), sources_total: sources.length, knowledge_total: knowledge.length, files };
}

/** Сводка для evidence: без списка файлов, общий digest по «путь sha256» в порядке путей. */
export function summary(snap) {
  const keys = Object.keys(snap.files).sort();
  const digest = sha(keys.map((k) => `${k} ${snap.files[k]}\n`).join(""));
  const rest = { ...snap };
  delete rest.files;
  return { ...rest, files_total: keys.length, digest };
}

function main() {
  const [mode, dir, full = dir] = process.argv.slice(2);
  if (!["before", "after"].includes(mode) || !dir) {
    console.error("usage: kb-hashes.mjs before|after <evidence> [<полные>]");
    process.exitCode = 2;
    return;
  }
  mkdirSync(dir, { recursive: true });
  mkdirSync(full, { recursive: true });
  const t0 = Date.now();
  const snap = snapshot();
  const ms = Date.now() - t0;
  const n = Object.keys(snap.files).length;
  writeFileSync(join(full, `kb-hashes-${mode}.json`), JSON.stringify(snap, null, 2) + "\n");
  if (full !== dir) writeFileSync(join(dir, `kb-hashes-${mode}.json`), JSON.stringify({ ...summary(snap), hash_ms: ms }, null, 2) + "\n");
  if (mode === "before") {
    console.log(`kb-hashes: ${n} файлов (${snap.sources_total} исходников + ${snap.knowledge_total} knowledge/), ${ms} мс`);
    return;
  }
  const before = JSON.parse(readFileSync(join(full, "kb-hashes-before.json"), "utf8")).files;
  const keys = [...new Set([...Object.keys(before), ...Object.keys(snap.files)])].sort();
  const diff = keys.filter((k) => before[k] !== snap.files[k]).map((k) => ({ file: k, before: before[k] ?? null, after: snap.files[k] ?? null }));
  writeFileSync(join(dir, "kb-hashes-diff.json"), JSON.stringify({ compared: keys.length, changed: diff }, null, 2) + "\n");
  if (diff.length > 0) {
    console.log(`kb-hashes: РАСХОЖДЕНИЕ в ${diff.length} из ${keys.length}`);
    for (const d of diff) console.log(`  ${d.file}: ${d.before} → ${d.after}`);
    process.exitCode = 1;
  } else {
    console.log(`kb-hashes: совпадают ${keys.length} из ${keys.length}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
