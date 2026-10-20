// KnowledgeAdapter: только чтение, всё в памяти. Источник — knowledge/capabilities.jsonl
// (+ repositories.json, compatibility/results.jsonl). Исходники (templates/, official_skills/) —
// в sourceRoot, оригиналы не изменяются; в draft копируются только permissive-источники.
import { copyFile, lstat, mkdir, readFile } from "node:fs/promises";
import { isAbsolute, join, resolve, sep } from "node:path";
import { confidenceOf, licenseClass } from "./license.js";
import { indexTokens, searchDocs, type IndexedDoc } from "./search.js";
import type {
  CapabilityView,
  CompatibilityStatus,
  CopyResult,
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

async function readJsonl(path: string, optional: boolean): Promise<Record<string, unknown>[]> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (e) {
    if (optional && (e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  return text
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

/** Относительный путь без `..`, пустых и абсолютных частей; иначе — ошибка. */
function safeSegments(rel: string, what: string): string[] {
  const segs = rel.split("/");
  if (isAbsolute(rel) || segs.some((s) => s === "" || s === "." || s === "..")) {
    throw new Error(`${what}: путь вне корня: ${rel}`);
  }
  return segs;
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
  private constructor(
    private readonly kbRoot: string,
    private readonly sourceRoot: string,
    private readonly docs: IndexedDoc[],
    private readonly byId: Map<string, IndexedDoc>,
  ) {}

  static async load(opts: { kbRoot: string; sourceRoot: string }): Promise<KnowledgeAdapter> {
    const { kbRoot, sourceRoot } = opts;
    const raw = (await readJsonl(join(kbRoot, "capabilities.jsonl"), false)) as unknown as RawRecord[];
    const reposFile = JSON.parse(await readFile(join(kbRoot, "repositories.json"), "utf8")) as {
      repositories?: RepoInfo[];
    };
    const repos = new Map((reposFile.repositories ?? []).map((r) => [r.id, r]));
    const results = new Map<string, string>();
    for (const r of await readJsonl(join(kbRoot, "compatibility", "results.jsonl"), true)) {
      const status = r.status ?? r.verification ?? r.result;
      if (typeof r.id === "string" && typeof status === "string") results.set(r.id, status);
    }

    const docs: IndexedDoc[] = [];
    const byId = new Map<string, IndexedDoc>();
    for (const r of raw) {
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
    return new KnowledgeAdapter(kbRoot, sourceRoot, docs, byId);
  }

  get size(): number {
    return this.docs.length;
  }

  search(query: string, filters?: SearchFilters, limit?: number): SearchHit[] {
    return searchDocs(this.docs, query, filters, limit);
  }

  getCapability(id: string): CapabilityView | undefined {
    return this.byId.get(id)?.view;
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

  async getSourceReference(id: string): Promise<SourceReference[]> {
    const v = this.need(id);
    return Promise.all(
      v.source_paths.map(async (path) => {
        const absPath = join(this.sourceRoot, path);
        const exists = await lstat(absPath).then(() => true, () => false);
        return { path, absPath, exists };
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
   * Отказ (исключение до любых записей) для restricted/unknown-лицензии, путей вне корня и симлинков.
   */
  async copyRefs(ids: string[], destDir: string): Promise<CopyResult[]> {
    const views = ids.map((id) => this.need(id));
    for (const v of views) {
      if (v.license_class !== "permissive") {
        throw new Error(`KB: копирование ${v.id} запрещено: лицензия ${v.license_class} (${v.license})`);
      }
      if (!ID_RE.test(v.id)) throw new Error(`KB: неверный id ${v.id}`);
      for (const p of v.source_paths) safeSegments(p, v.id);
    }
    const root = resolve(this.sourceRoot);
    const out: CopyResult[] = [];
    for (const v of views) {
      const idDir = await mkdirInside(destDir, v.id.split("/"));
      const copied: string[] = [];
      const missing: string[] = [];
      for (const p of v.source_paths) {
        const segs = safeSegments(p, v.id);
        const abs = resolve(root, p);
        if (!abs.startsWith(root + sep)) throw new Error(`KB: ${v.id}: путь вне корня исходников: ${p}`);
        if (await this.copyOne(root, segs, idDir)) copied.push(p);
        else missing.push(p);
      }
      const cardSegs = safeSegments(v.card_path, v.id);
      const card = join(this.kbRoot, ...cardSegs);
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

  /** true — скопировано, false — источника нет. Симлинк в пути источника — ошибка. */
  private async copyOne(root: string, segs: string[], idDir: string): Promise<boolean> {
    let cur = root;
    for (const [i, s] of segs.entries()) {
      cur = join(cur, s);
      const st = await lstat(cur).catch((e: NodeJS.ErrnoException) => {
        if (e.code === "ENOENT" || e.code === "ENOTDIR") return undefined;
        throw e;
      });
      if (!st) return false;
      if (st.isSymbolicLink()) throw new Error(`KB: симлинк в источнике: ${cur}`);
      if (i === segs.length - 1 && !st.isFile()) throw new Error(`KB: источник не файл: ${cur}`);
    }
    const dir = await mkdirInside(idDir, segs.slice(0, -1));
    const target = join(dir, segs[segs.length - 1]!);
    const t = await lstat(target).catch(() => undefined);
    if (t?.isSymbolicLink()) throw new Error(`KB: симлинк в приёмнике: ${target}`);
    await copyFile(cur, target);
    return true;
  }
}

