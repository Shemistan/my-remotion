// KnowledgeAdapter: только чтение, всё в памяти. Источник — knowledge/capabilities.jsonl
// (+ repositories.json, compatibility/results.jsonl). Исходники (templates/, official_skills/) —
// в sourceRoot, оригиналы не изменяются; в draft копируются только permissive-источники.
// Файлы KB перечитываются лениво при смене mtime/размера (integration-map §4.1). Недописанная
// KB (пересборка идёт, битый JSON, пустой индекс, пропавшие карточки) не заменяет последний
// исправный индекс: адаптер пишет предупреждение и отвечает по прежнему.
import { existsSync, readFileSync, statSync } from "node:fs";
import { copyFile, lstat, mkdir, readFile } from "node:fs/promises";
import { isAbsolute, join, resolve, sep } from "node:path";
import { confidenceOf, licenseClass } from "./license.js";
import { buildIndex, indexTokens, searchDocs, type IndexedDoc, type SearchIndex } from "./search.js";

export { isVisual } from "./search.js";
import type {
  CapabilityView,
  CompatibilityStatus,
  CopyResult,
  ResultRecord,
  SearchFilters,
  SearchHit,
  SourceReference,
} from "./types.js";

interface RawRecord {
  id: string;
  name: string;
  repo: string;
  kind: string;
  category: string;
  visualizes: string;
  use_when: string;
  voiceover_cues: string[];
  inputs: string;
  adaptations: string;
  patterns: string[];
  compat_flags: string[];
  source_files: string[];
  docs: string[];
  remotion_compat: CompatibilityStatus;
  verification: string;
  license: string;
  card: string;
}

interface RepoInfo {
  id: string;
  name?: string;
  url?: string;
  commit?: string;
}

const ID_RE = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9.-]*$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const UNKNOWN = "unknown";
const STRING_FIELDS = [
  "id", "name", "repo", "kind", "category", "visualizes", "use_when", "inputs", "adaptations",
  "remotion_compat", "verification", "license", "card",
] as const;
const LIST_FIELDS = ["voiceover_cues", "patterns", "compat_flags", "source_files", "docs"] as const;

const fileStamp = (path: string): string => {
  try {
    const st = statSync(path);
    return `${st.mtimeMs}:${st.size}`;
  } catch {
    return "absent";
  }
};

/** Читает jsonl; битая строка или запись — ошибка с именем файла, строкой и id. */
function readJsonlSync(path: string, optional: boolean): { n: number; row: Record<string, unknown> }[] {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    if (optional && (e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const name = path.split(sep).slice(-2).join("/");
  const out: { n: number; row: Record<string, unknown> }[] = [];
  text.split("\n").forEach((line, i) => {
    if (line.trim() === "") return;
    try {
      const row: unknown = JSON.parse(line);
      if (typeof row !== "object" || row === null || Array.isArray(row)) throw new Error("не объект");
      out.push({ n: i + 1, row: row as Record<string, unknown> });
    } catch (e) {
      throw new Error(`KB: ${name}:${i + 1}: невалидный JSON (${(e as Error).message})`, { cause: e });
    }
  });
  return out;
}

function validateRecord(r: Record<string, unknown>, where: string): RawRecord {
  const id = typeof r.id === "string" ? r.id : "?";
  const bad = (m: string): never => {
    throw new Error(`KB: ${where} (id ${id}): ${m}`);
  };
  for (const f of STRING_FIELDS) if (typeof r[f] !== "string") bad(`поле '${f}' должно быть строкой`);
  for (const f of LIST_FIELDS) {
    const v = r[f];
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) bad(`поле '${f}' должно быть списком строк`);
  }
  return r as unknown as RawRecord;
}

interface State {
  docs: IndexedDoc[];
  byId: Map<string, IndexedDoc>;
  index: SearchIndex;
  stamps: string[];
  /** Карточки, которые были на месте при сборке (пропажа при пересборке — KB недописана). */
  cards: Set<string>;
}

function buildState(kbRoot: string): State {
  const capsPath = join(kbRoot, "capabilities.jsonl");
  const reposPath = join(kbRoot, "repositories.json");
  const resPath = join(kbRoot, "compatibility", "results.jsonl");
  const stamps = [fileStamp(capsPath), fileStamp(reposPath), fileStamp(resPath)];

  let reposFile: { repositories?: RepoInfo[] };
  try {
    reposFile = JSON.parse(readFileSync(reposPath, "utf8")) as { repositories?: RepoInfo[] };
  } catch (e) {
    throw new Error(`KB: repositories.json: ${(e as Error).message}`, { cause: e });
  }
  const repos = new Map((reposFile.repositories ?? []).map((r) => [r.id, r]));

  // results.jsonl: одна строка на проверку, поздняя запись перекрывает раннюю.
  const results = new Map<string, string>();
  for (const { n, row } of readJsonlSync(resPath, true)) {
    const r = row as Partial<ResultRecord>;
    if (typeof r.id !== "string") throw new Error(`KB: compatibility/results.jsonl:${n}: нет поля id`);
    if (r.result !== "ok" && r.result !== "fail") {
      throw new Error(`KB: compatibility/results.jsonl:${n} (id ${r.id}): result должен быть "ok" или "fail"`);
    }
    results.set(r.id, r.result === "ok" ? "rendered-ok" : "rendered-fail");
  }

  const docs: IndexedDoc[] = [];
  const byId = new Map<string, IndexedDoc>();
  for (const { n, row } of readJsonlSync(capsPath, false)) {
    const r = validateRecord(row, `capabilities.jsonl:${n}`);
    if (byId.has(r.id)) throw new Error(`KB: capabilities.jsonl:${n}: дубликат id ${r.id}`);
    const repo = repos.get(r.repo);
    const base = {
      tested_status: results.get(r.id) ?? r.verification,
      compatibility_status: r.remotion_compat,
    };
    const view: CapabilityView = {
      id: r.id,
      name: r.name,
      kind: r.kind,
      category: r.category,
      visualizes: r.visualizes,
      use_when: r.use_when,
      inputs: r.inputs,
      adaptations: r.adaptations,
      patterns: r.patterns,
      compat_flags: r.compat_flags,
      repository: repo?.name ?? r.repo,
      repository_url: repo?.url ?? UNKNOWN,
      commit: repo?.commit ?? UNKNOWN,
      license: r.license,
      license_class: licenseClass(r.license),
      source_paths: r.source_files,
      documentation_paths: r.docs,
      ...base,
      confidence: confidenceOf(base),
      card_path: r.card,
    };
    const doc: IndexedDoc = {
      view,
      name: indexTokens(`${r.name} ${r.id}`),
      visualizes: indexTokens(r.visualizes),
      voiceover: indexTokens(r.voiceover_cues.join(" ")),
      useWhen: indexTokens(r.use_when),
      tags: indexTokens(`${r.category} ${r.patterns.join(" ")}`),
    };
    docs.push(doc);
    byId.set(r.id, doc);
  }
  const cards = new Set(docs.map((d) => d.view.card_path).filter((c) => existsSync(join(kbRoot, c))));
  return { docs, byId, index: buildIndex(docs), stamps, cards };
}

/** Относительный путь без `..`, пустых и абсолютных частей; иначе — ошибка. */
function safeSegments(rel: string, what: string): string[] {
  const segs = rel.split("/");
  if (isAbsolute(rel) || segs.some((s) => s === "" || s === "." || s === "..")) {
    throw new Error(`${what}: путь вне корня: ${rel}`);
  }
  return segs;
}

type Inspected =
  | { state: "ok"; abs: string; segs: string[] }
  | { state: "missing"; abs: string }
  | { state: "invalid"; reason: string };

/** Проверка пути источника: вне корня, симлинк, не файл -> invalid; нет файла -> missing. */
async function inspectSource(root: string, rel: string): Promise<Inspected> {
  let segs: string[];
  try {
    segs = safeSegments(rel, "источник");
  } catch {
    return { state: "invalid", reason: `путь вне корня исходников: ${rel}` };
  }
  const abs = resolve(root, rel);
  if (!abs.startsWith(root + sep)) return { state: "invalid", reason: `путь вне корня исходников: ${rel}` };
  let cur = root;
  for (const [i, s] of segs.entries()) {
    cur = join(cur, s);
    const st = await lstat(cur).catch((e: NodeJS.ErrnoException) => {
      if (e.code === "ENOENT" || e.code === "ENOTDIR") return undefined;
      throw e;
    });
    if (!st) return { state: "missing", abs };
    if (st.isSymbolicLink()) return { state: "invalid", reason: `симлинк в источнике: ${rel}` };
    if (i === segs.length - 1 && !st.isFile()) return { state: "invalid", reason: `источник не файл: ${rel}` };
  }
  return { state: "ok", abs, segs };
}

/** Каталог за каталогом, без recursive: наружу `base` не выйти. */
async function mkdirInside(base: string, segs: string[]): Promise<string> {
  let cur = base;
  for (const s of segs) {
    cur = join(cur, s);
    try {
      await mkdir(cur);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
    const st = await lstat(cur);
    if (st.isSymbolicLink() || !st.isDirectory()) throw new Error(`не каталог или симлинк: ${cur}`);
  }
  return cur;
}

export class KnowledgeAdapter {
  private state: State;
  /** Отпечатки файлов KB, которую не удалось собрать (чтобы не пересобирать её на каждом вызове). */
  private brokenStamps: string | undefined;

  private constructor(
    private readonly kbRoot: string,
    private readonly sourceRoot: string,
    private readonly warn: (message: string) => void,
  ) {
    this.state = buildState(kbRoot);
  }

  /** `onWarn` — предупреждения о недописанной KB (по умолчанию — stderr). */
  static async load(opts: { kbRoot: string; sourceRoot: string; onWarn?: (message: string) => void }): Promise<KnowledgeAdapter> {
    return new KnowledgeAdapter(opts.kbRoot, opts.sourceRoot, opts.onWarn ?? ((m) => console.warn(m)));
  }

  /**
   * Перечитывает файлы KB, если их mtime/размер изменились. Не собралась (битый JSON, нет
   * repositories.json), пуста при непустом прежнем индексе или пропали карточки, бывшие на
   * месте, — KB недописана: остаётся последний исправный индекс и одно предупреждение на
   * этот набор файлов.
   */
  private fresh(): State {
    const stamps = [
      fileStamp(join(this.kbRoot, "capabilities.jsonl")),
      fileStamp(join(this.kbRoot, "repositories.json")),
      fileStamp(join(this.kbRoot, "compatibility", "results.jsonl")),
    ];
    if (stamps.every((s, i) => s === this.state.stamps[i])) return this.state;
    const key = stamps.join("|");
    if (key === this.brokenStamps) return this.state;
    let problem: string | undefined;
    let next: State | undefined;
    try {
      next = buildState(this.kbRoot);
      if (next.docs.length === 0 && this.state.docs.length > 0) problem = "capabilities.jsonl пуст";
      else {
        const gone = [...this.state.cards].filter((c) => next!.docs.some((d) => d.view.card_path === c) && !next!.cards.has(c));
        if (gone.length > 0) problem = `пропали карточки: ${gone.slice(0, 5).join(", ")}${gone.length > 5 ? ` (+${gone.length - 5})` : ""}`;
      }
    } catch (e) {
      problem = (e as Error).message;
    }
    if (problem !== undefined || !next) {
      this.brokenStamps = key;
      this.warn(`KB: недописана или повреждена (${problem}) — оставлен прежний индекс (${this.state.docs.length} записей)`);
      return this.state;
    }
    this.brokenStamps = undefined;
    this.state = next;
    return this.state;
  }

  get size(): number {
    return this.fresh().docs.length;
  }

  search(query: string, filters?: SearchFilters, limit?: number): SearchHit[] {
    return searchDocs(this.fresh().index, query, filters, limit);
  }

  getCapability(id: string): CapabilityView | undefined {
    return this.fresh().byId.get(id)?.view;
  }

  private need(id: string): CapabilityView {
    const v = this.getCapability(id);
    if (!v) throw new Error(`KB: нет записи ${id}`);
    return v;
  }

  async getComponentCard(id: string): Promise<string> {
    const card = this.need(id).card_path;
    safeSegments(card, "карточка");
    return readFile(join(this.kbRoot, card), "utf8");
  }

  /** Недопустимый путь (вне корня, симлинк, не файл) -> exists:false, invalid:true и reason. */
  async getSourceReference(id: string): Promise<SourceReference[]> {
    const v = this.need(id);
    const root = resolve(this.sourceRoot);
    return Promise.all(
      v.source_paths.map(async (path): Promise<SourceReference> => {
        const r = await inspectSource(root, path);
        if (r.state === "invalid") return { path, absPath: "", exists: false, invalid: true, reason: r.reason };
        return { path, absPath: r.abs, exists: r.state === "ok" };
      }),
    );
  }

  /** Курируемая часть patterns/<slug>.md: без автотаблицы кандидатов (маркеры kb:begin/kb:end). */
  async getVisualPatterns(slug: string): Promise<string> {
    if (!SLUG_RE.test(slug)) throw new Error(`KB: неверный slug паттерна: ${slug}`);
    const text = await readFile(join(this.kbRoot, "patterns", `${slug}.md`), "utf8");
    return text
      .replace(/\n*## Кандидаты из каталога[^\n]*\n+<!-- kb:begin[^>]*-->[\s\S]*?<!-- kb:end[^>]*-->\n*/g, "\n\n")
      .replace(/<!-- kb:begin[^>]*-->[\s\S]*?<!-- kb:end[^>]*-->\n*/g, "")
      .trim();
  }

  getCompatibility(id: string): {
    compatibility_status: CompatibilityStatus;
    compat_flags: string[];
    adaptations: string;
    tested_status: string;
  } {
    const v = this.need(id);
    return {
      compatibility_status: v.compatibility_status,
      compat_flags: v.compat_flags,
      adaptations: v.adaptations,
      tested_status: v.tested_status,
    };
  }

  /**
   * Копирует source_paths в destDir/<id>/<путь> и карточку в CARD.md. destDir создаёт вызывающий.
   * Все проверки (лицензия, пути вне корня, симлинки) идут до первой записи: при отказе ничего не создаётся.
   */
  async copyRefs(ids: string[], destDir: string): Promise<CopyResult[]> {
    const views = ids.map((id) => this.need(id));
    const root = resolve(this.sourceRoot);
    const plan: { v: CapabilityView; items: { p: string; r: Inspected }[] }[] = [];
    for (const v of views) {
      if (v.license_class !== "permissive") {
        throw new Error(`KB: копирование ${v.id} запрещено: лицензия ${v.license_class} (${v.license})`);
      }
      if (!ID_RE.test(v.id)) throw new Error(`KB: неверный id ${v.id}`);
      safeSegments(v.card_path, v.id);
      const items: { p: string; r: Inspected }[] = [];
      for (const p of v.source_paths) {
        const r = await inspectSource(root, p);
        if (r.state === "invalid") throw new Error(`KB: ${v.id}: ${r.reason}`);
        items.push({ p, r });
      }
      plan.push({ v, items });
    }
    const out: CopyResult[] = [];
    for (const { v, items } of plan) {
      const idDir = await mkdirInside(destDir, v.id.split("/"));
      const copied: string[] = [];
      const missing: string[] = [];
      for (const { p, r } of items) {
        if (r.state !== "ok") {
          missing.push(p);
          continue;
        }
        const dir = await mkdirInside(idDir, r.segs.slice(0, -1));
        const target = join(dir, r.segs[r.segs.length - 1]!);
        const t = await lstat(target).catch(() => undefined);
        if (t?.isSymbolicLink()) throw new Error(`KB: симлинк в приёмнике: ${target}`);
        await copyFile(r.abs, target);
        copied.push(p);
      }
      const card = join(this.kbRoot, ...safeSegments(v.card_path, v.id));
      const cardStat = await lstat(card).catch(() => undefined);
      if (cardStat?.isFile()) {
        await copyFile(card, join(idDir, "CARD.md"));
        copied.push("CARD.md");
      } else {
        missing.push("CARD.md");
      }
      out.push({ id: v.id, copied, missing });
    }
    return out;
  }
}
