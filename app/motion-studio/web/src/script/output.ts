// Вкладки «Сцены» и «Экспорт» (S9): сцены плана в порядке текста с их сценами Playground нужного
// формата, ключи идемпотентности повторных действий, причины «не вошли», разбор шпаргалки .md.
import type { Aspect, ScriptBatchDto, ScriptSceneDto, ScriptSceneItem, ScriptStateDto } from "@ms/contracts";

export const ASPECTS: readonly Aspect[] = ["16:9", "9:16"];

export interface SceneRow {
  item: ScriptSceneItem;
  /** Номер среди принятых сцен плана (как во вкладке «План»). */
  n: number;
  /** Сцена Playground этого формата; генерации не было — нет. */
  scene: ScriptSceneDto | undefined;
}

/** Принятые сцены текущего плана по порядку текста и их сцены формата `aspect`. */
export function sceneRows(state: ScriptStateDto, aspect: Aspect): SceneRow[] {
  const items = state.plan?.doc.items.filter((x) => x.status === "accepted") ?? [];
  return items.map((item, i) => ({ item, n: i + 1, scene: state.scenes.find((s) => s.item_id === item.id && s.aspect === aspect) }));
}

/** Номера принятых сцен плана: id → номер. */
export function itemNumbers(state: ScriptStateDto): Map<string, number> {
  const m = new Map<string, number>();
  state.plan?.doc.items.filter((x) => x.status === "accepted").forEach((x, i) => m.set(x.id, i + 1));
  return m;
}

/**
 * Сцена войдёт в папку (C4): есть текущая версия и она по текущему плану — независимо от
 * статуса последней задачи генерации.
 */
export const packable = (s: ScriptSceneDto | undefined): boolean => s !== undefined && s.version_id !== null && !s.stale;

/** Пакеты генерации формата: идущие (есть pending/running) или, если таких нет, последний. */
export function visibleBatches(batches: readonly ScriptBatchDto[], aspect: Aspect): ScriptBatchDto[] {
  const own = batches.filter((b) => b.aspect === aspect);
  const active = own.filter(batchActive);
  return active.length > 0 ? active : own.slice(0, 1);
}

export const batchActive = (b: ScriptBatchDto): boolean => b.counts.pending + b.counts.running > 0;

/**
 * Ключ «Повторить» / «Перегенерировать»: тот же для повторного нажатия по той же неудаче (сервер
 * вернёт тот же пакет), новый — после новой задачи или версии сцены. Только ASCII-id.
 */
export function retryKey(kind: "retry" | "regen", row: SceneRow, aspect: Aspect): string {
  const s = row.scene;
  return `script-${kind}:${aspect === "16:9" ? "h" : "v"}:${row.item.id}:${s?.job?.id ?? "nojob"}:${s?.version_id ?? "nover"}`;
}

/**
 * Короткий отпечаток строки (FNV-1a, два прохода → 16 hex): ключ идемпотентности не длиннее
 * 200 символов при любом числе сцен.
 */
export function shortHash(s: string): string {
  const pass = (seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
    return h.toString(16).padStart(8, "0");
  };
  return pass(0x811c9dc5) + pass(0x01234567);
}

/**
 * Ключ сборки папки: формат, ревизия плана, версии, которые войдут, и последняя неудачная задача
 * сборки — новые версии или повтор после сбоя дают новую задачу.
 */
export function packageKey(state: ScriptStateDto, aspect: Aspect, failedJobId?: string): string {
  const versions = sceneRows(state, aspect).filter((r) => packable(r.scene)).map((r) => r.scene!.version_id).join(",");
  const base = `${state.plan?.plan_id ?? "noplan"}@r${state.plan?.doc.revision ?? 0}:${versions}:${failedJobId ?? ""}`;
  return `script-package:${aspect === "16:9" ? "h" : "v"}:${shortHash(base)}`;
}

/**
 * Ключ «Переделать под 9:16»: выбранные сцены (или все), их готовые 16:9-версии и последние
 * задачи двойников 9:16 — после упавшего или нового двойника повтор ставит новую задачу (S10 fix M5).
 */
export function reframeKey(state: ScriptStateDto, itemIds: readonly string[]): string {
  const versions = sceneRows(state, "16:9").filter((r) => packable(r.scene)).map((r) => r.scene!.version_id).join(",");
  const twins = sceneRows(state, "9:16").map((r) => r.scene?.job?.id ?? "-").join(",");
  return `script-reframe:${shortHash(`${itemIds.join(",") || "all"}:${versions}:${twins}`)}`;
}

export type CheatsheetPart =
  | { kind: "heading"; level: number; text: string }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "text"; text: string };

/** Ячейки строки таблицы markdown: `| a | b \| c |` → ["a", "b | c"]. */
function cells(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (ch === "\\" && inner[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (ch === "|") {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const isRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isSeparator = (l: string) => /^[\s|:-]+$/.test(l) && l.includes("---");

/** Шпаргалка .md (S7) → заголовки, таблицы и абзацы; разметка внутри ячеек — простой текст. */
export function parseCheatsheet(md: string): CheatsheetPart[] {
  const out: CheatsheetPart[] = [];
  const lines = (md.charCodeAt(0) === 0xfeff ? md.slice(1) : md).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    const h = /^(#{1,6})\s+(.*)$/.exec(line.trim());
    if (h) {
      out.push({ kind: "heading", level: h[1]!.length, text: h[2]!.trim() });
      continue;
    }
    if (isRow(line)) {
      const block: string[] = [];
      while (i < lines.length && isRow(lines[i]!)) block.push(lines[i++]!);
      i--;
      const body = block.filter((l, k) => !(k === 1 && isSeparator(l)));
      const [head, ...rows] = body.map(cells);
      out.push({ kind: "table", head: head ?? [], rows });
      continue;
    }
    out.push({ kind: "text", text: line.trim() });
  }
  return out;
}
