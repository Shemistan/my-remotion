// sha256 исходников KB до/после приёмки (`09` §1 п. 6, Task 22): выборка 200 файлов
// `templates/` и `official_skills/` (KB_SOURCE_ROOT — main checkout) и все файлы `knowledge/`.
// Выборка детерминирована: все пути по алфавиту, равномерный шаг. `.git` и `node_modules`
// не входят.
//   node scripts/kb-hashes.mjs before <каталог>  → <каталог>/kb-hashes-before.json
//   node scripts/kb-hashes.mjs after <каталог>   → kb-hashes-after.json и сверка с before;
//                                                  код 1 при расхождении (список в stdout)
/* global process, URL, console */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = fileURLToPath(new URL("../../../", import.meta.url)).replace(/\/$/, "");
// исходники KB лежат в main checkout; из worktree — путь до `.claude/worktrees/`
const SOURCE_ROOT = process.env.KB_SOURCE_ROOT ?? REPO.split("/.claude/worktrees/")[0];
const KB_ROOT = process.env.KB_ROOT ?? join(REPO, "knowledge");
const SAMPLE = 200;
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

const sha = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

/** Равномерная выборка `n` из отсортированного списка (первый и последний входят). */
export function sample(paths, n) {
  const sorted = [...paths].sort();
  if (sorted.length <= n) return sorted;
  const out = [];
  for (let i = 0; i < n; i++) out.push(sorted[Math.round((i * (sorted.length - 1)) / (n - 1))]);
  return out;
}

function snapshot() {
  const sources = ["templates", "official_skills"].flatMap((d) => (existsSync(join(SOURCE_ROOT, d)) ? walk(SOURCE_ROOT, d) : []));
  const files = {};
  for (const rel of sample(sources, SAMPLE)) files[`source:${rel}`] = sha(join(SOURCE_ROOT, rel));
  for (const rel of walk(KB_ROOT).sort()) files[`knowledge:${rel}`] = sha(join(KB_ROOT, rel));
  return { created_at: new Date().toISOString(), source_root: SOURCE_ROOT, kb_root: KB_ROOT, sources_total: sources.length, sampled: SAMPLE, files };
}

function main() {
  const [mode, dir] = process.argv.slice(2);
  if (!["before", "after"].includes(mode) || !dir) {
    console.error("usage: kb-hashes.mjs before|after <каталог>");
    process.exitCode = 2;
    return;
  }
  mkdirSync(dir, { recursive: true });
  const snap = snapshot();
  writeFileSync(join(dir, `kb-hashes-${mode}.json`), JSON.stringify(snap, null, 2) + "\n");
  const n = Object.keys(snap.files).length;
  if (mode === "before") {
    console.log(`kb-hashes: ${n} файлов (выборка ${SAMPLE} из ${snap.sources_total} исходников + knowledge/)`);
    return;
  }
  const before = JSON.parse(readFileSync(join(dir, "kb-hashes-before.json"), "utf8")).files;
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
