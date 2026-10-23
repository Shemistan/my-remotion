// Бэклог ночного цикла качества — `docs/quality-backlog.md`. Пункт:
//
//   ## Q01 — Заголовок
//   статус: открыт
//
//   Текст задачи (уходит в бриф агента).
//
//   история:
//   - 2026-10-24: не дало роста (ночь 2026-10-24): explainer +0.05
//
// Ночь берёт только пункты со статусом `открыт`; вернуть пункт в работу — поставить `открыт`.
// Строка `приёмка: без регрессии` в тексте — технический пункт: роста оценки не требуется
// (`acceptNight(..., { requireGain: false })`).

export const OPEN = "открыт";
export type Acceptance = "рост" | "без регрессии";

export interface BacklogItem {
  id: string;
  title: string;
  status: string;
  body: string;
  history: string[];
  acceptance: Acceptance;
}
export interface Backlog {
  preamble: string;
  items: BacklogItem[];
}

const HEAD = /^## (Q\d+) — (.+)$/;
const STATUS = /^статус: (.+)$/;

export function parseBacklog(md: string): Backlog {
  const lines = md.split("\n");
  const first = lines.findIndex((l) => HEAD.test(l));
  const preamble = (first < 0 ? lines : lines.slice(0, first)).join("\n").trim();
  const items: BacklogItem[] = [];
  if (first < 0) return { preamble, items };
  let cur: string[] = [];
  const flush = () => {
    if (cur.length === 0) return;
    const [, id, title] = HEAD.exec(cur[0]!)!;
    const si = cur.findIndex((l) => STATUS.test(l));
    if (si < 0) throw new Error(`бэклог: у пункта ${id} нет строки «статус: …»`);
    if (items.some((i) => i.id === id)) throw new Error(`бэклог: пункт ${id} — повтор id`);
    const rest = cur.slice(si + 1);
    const hi = rest.findIndex((l) => l.trim() === "история:");
    const body = (hi < 0 ? rest : rest.slice(0, hi)).join("\n").trim();
    const history = hi < 0 ? [] : rest.slice(hi + 1).filter((l) => l.startsWith("- ")).map((l) => l.slice(2).trim());
    const acceptance: Acceptance = /^приёмка: без регрессии\s*$/m.test(body) ? "без регрессии" : "рост";
    items.push({ id: id!, title: title!.trim(), status: STATUS.exec(cur[si]!)![1]!.trim(), body, history, acceptance });
    cur = [];
  };
  for (const l of lines.slice(first)) {
    if (HEAD.test(l)) flush();
    cur.push(l);
  }
  flush();
  return { preamble, items };
}

export function renderBacklog(b: Backlog): string {
  const parts = [b.preamble];
  for (const i of b.items) {
    parts.push([`## ${i.id} — ${i.title}`, `статус: ${i.status}`, ...(i.body ? ["", i.body] : []), ...(i.history.length ? ["", "история:", ...i.history.map((h) => `- ${h}`)] : [])].join("\n"));
  }
  return parts.filter((p) => p !== "").join("\n\n") + "\n";
}

/** Верхний открытый пункт; `id` — именно этот (должен быть открыт). */
export function nextItem(b: Backlog, id?: string): BacklogItem | undefined {
  if (id === undefined) return b.items.find((i) => i.status === OPEN);
  const it = b.items.find((i) => i.id === id);
  if (!it) throw new Error(`бэклог: пункта ${id} нет`);
  if (it.status !== OPEN) throw new Error(`бэклог: пункт ${id} не открыт (${it.status})`);
  return it;
}

/**
 * Новый статус пункта со строкой истории; `toEnd` — пункт уходит вниз списка, `history` — текст
 * строки истории вместо статуса (сбой инфраструктуры: статус прежний, только запись).
 */
export function markItem(md: string, id: string, status: string, opts: { date: string; toEnd?: boolean; history?: string }): string {
  const b = parseBacklog(md);
  const i = b.items.findIndex((x) => x.id === id);
  if (i < 0) throw new Error(`бэклог: пункта ${id} нет`);
  const it: BacklogItem = { ...b.items[i]!, status, history: [...b.items[i]!.history, `${opts.date}: ${opts.history ?? status}`] };
  const items = b.items.filter((_, k) => k !== i);
  if (opts.toEnd) items.push(it);
  else items.splice(i, 0, it);
  return renderBacklog({ preamble: b.preamble, items });
}
