// Шпаргалка пакета «сцена ↔ фраза» (спека §9 п.4, контракт C8): одна таблица в трёх форматах.
// md — по блокам: «## <блок>» и одна GFM-таблица; csv — UTF-8 с BOM, «;» (Excel на macOS с
// русской локалью, Р9); txt — строка на сцену.
import { TECHNIQUES, type Technique } from "@ms/contracts";

export interface CheatRow {
  /** Номер сцены среди принятых сцен плана и он же в виде `NN`. */
  n: number;
  nn: string;
  /** Имена файлов в папке; сцены нет — null (альфы нет — null). */
  mp4: string | null;
  alpha: string | null;
  /** Название блока текста. */
  block: string;
  /** ≈ время фрагмента от начала блока, с. */
  at_s: number;
  quote: string;
  technique: Technique;
  /** Длительность сцены и запас в начале/конце, с. */
  total_s: number;
  lead_s: number;
  tail_s: number;
  /** Замечания (`cheatNotes`): короткие фразы по кодам QA, «нет сцены: …», «альфа-версия невозможна: …». */
  notes: string[];
}

export type CheatFormat = "md" | "csv" | "txt";

export const CHEAT_COLUMNS = [
  "№", "файл (фон)", "файл (альфа)", "блок", "≈ время в блоке", "фраза", "приём", "длительность, с", "запас в начале, с", "запас в конце, с", "замечания",
] as const;

/** Имена файлов шпаргалки в папке пакета. */
export const CHEAT_FILES: Record<CheatFormat, string> = { md: "шпаргалка.md", csv: "шпаргалка.csv", txt: "шпаргалка.txt" };

const TECH_RU = new Map<string, string>(TECHNIQUES.map((t) => [t.slug, t.ru]));

/** F8: замечаний в строке шпаргалки — не больше трёх, каждое — короткая фраза. */
export const CHEAT_NOTES_MAX = 3;
export const CHEAT_NOTE_CHARS = 60;

/**
 * Короткая фраза по коду замечания QA или экспорта (F8): полный текст — в Playground и манифесте,
 * в шпаргалке — одна фраза на код, без id элементов и номеров кадров.
 */
const NOTE_BY_CODE: Record<string, string> = {
  accent_conflict: "несколько акцентов спорят",
  accent_static: "акцент не живёт в финале",
  artifact: "артефакты в кадре",
  beat_reference: "бит не по плану",
  blank: "пустые кадры",
  bound_counter_timing: "счётчик не в такт",
  clipping: "обрезка элементов",
  composition: "композиция неровная",
  contrast: "слабый контраст",
  dead_air: "пауза без движения",
  empty_container: "пустые рамки",
  empty_half: "половина кадра пуста",
  empty_open: "пустое начало",
  empty_region: "пустая область кадра",
  exposed_edge: "виден край элемента",
  final_contradiction: "финал спорит с фразой",
  foreign_label: "подпись не из фразы",
  fragment_mismatch: "кадр не про эту фразу",
  fragment_unsupported: "утверждение не из фразы",
  frame0_coverage: "первый кадр почти пуст",
  frozen: "кадр застыл",
  ghost_text: "двоящийся текст",
  hero_split: "герой распадается",
  hierarchy: "нет ясной иерархии",
  key_term_early: "термин раньше слова",
  kit_misuse: "компонент kit не по назначению",
  late_hero: "герой появляется поздно",
  min_font: "мелкий текст",
  missing_element: "не хватает элемента",
  no_emphasis: "нет акцента",
  no_hero: "нет главного героя",
  outside_safe_area: "выход за безопасную зону",
  overlap: "элементы наложились",
  overlay_check_failed: "проверка альфы не прошла",
  overlay_haze: "дымка в альфа-версии",
  placeholder_label: "подписи-заглушки",
  purpose_claim: "смысл не показан",
  relation_not_shown: "связь не показана",
  rhythm: "рваный ритм",
  safe_area: "выход за безопасную зону",
  scene_signature_repeat: "похожа на соседнюю сцену",
  semantic: "смысл передан слабо",
  speech_window: "не в такт речи",
  structure_mismatch: "форма не по плану",
  style: "стиль выбивается",
  technique_not_realized: "приём не виден",
  text_dominant: "много текста",
  text_overlap: "текст наложился",
  text_size: "мелкий текст",
  timeline_single_event: "на оси одно событие",
  token_on_label: "токен на подписи",
  uniform_entrance: "однообразные входы",
  video_plan_changed: "план сцены изменился",
  word_gap: "слова слиплись",
};

/** Фраза по коду; неизвестный код — общая фраза (код латиницей человеку не показываем). */
export const shortNote = (code: string): string => NOTE_BY_CODE[code] ?? "есть замечание проверки";

/** Фраза не длиннее `CHEAT_NOTE_CHARS`: обрезка по слову с «…». */
function clipNote(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= CHEAT_NOTE_CHARS) return t;
  const cut = t.slice(0, CHEAT_NOTE_CHARS - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > CHEAT_NOTE_CHARS / 2 ? cut.slice(0, sp) : cut).replace(/[\s,;:.—-]+$/u, "")}…`;
}

/**
 * Замечания строки шпаргалки (F8): сначала важные для монтажа (`first`: нет альфы, длительность не
 * по плану), затем по фразе на код QA/экспорта; повторы убраны, не больше `CHEAT_NOTES_MAX`.
 */
export function cheatNotes(first: readonly string[], codes: readonly string[]): string[] {
  const out: string[] = [];
  for (const n of [...first.map(clipNote), ...codes.map(shortNote)]) {
    if (n !== "" && !out.includes(n)) out.push(n);
  }
  return out.slice(0, CHEAT_NOTES_MAX);
}

/** Секунды → `м:сс` (до целой секунды). */
export function mss(s: number): string {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/** Секунды с одним знаком после запятой: `7,9`. */
const sec = (s: number): string => s.toFixed(1).replace(".", ",");

function cells(r: CheatRow): string[] {
  return [
    r.nn, r.mp4 ?? "—", r.alpha ?? "—", r.block, mss(r.at_s), r.quote, TECH_RU.get(r.technique) ?? r.technique,
    sec(r.total_s), sec(r.lead_s), sec(r.tail_s), r.notes.join("; "),
  ];
}

export const oneLine = (s: string): string => s.replace(/\s*[\r\n]+\s*/g, " ");

/**
 * Поле CSV: ячейка, начинающаяся с `= + - @`, получает префикс `'` — Excel/Numbers не примут
 * фразу сценария за формулу (CSV injection); затем кавычки при `;`, `"` и переводе строки.
 */
export function csvField(s: string): string {
  const v = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[;"\r\n]/.test(v) ? `"${v.replaceAll("\"", "\"\"")}"` : v;
}

function mdCell(s: string): string {
  return oneLine(s).replaceAll("|", "\\|").trim() || " ";
}

export const mdRow = (xs: readonly string[]): string => `| ${xs.map(mdCell).join(" | ")} |`;

export function cheatsheet(rows: readonly CheatRow[], format: CheatFormat): string {
  if (format === "csv") {
    const lines = [CHEAT_COLUMNS.join(";"), ...rows.map((r) => cells(r).map((c) => csvField(c)).join(";"))];
    return `\uFEFF${lines.join("\r\n")}\r\n`;
  }
  if (format === "txt") {
    return rows.map((r) => {
      const head = `${r.nn} · ${mss(r.at_s)} · «${oneLine(r.quote)}» · `;
      if (r.mp4 === null) return `${head}${r.notes.map(oneLine).join("; ")}\n`;
      return `${head}${sec(r.total_s)} с (запас ${sec(r.lead_s)} / ${sec(r.tail_s)})\n`;
    }).join("");
  }
  const blocks: { title: string; rows: CheatRow[] }[] = [];
  for (const r of rows) {
    const last = blocks.at(-1);
    if (last && last.title === r.block) last.rows.push(r);
    else blocks.push({ title: r.block, rows: [r] });
  }
  const out: string[] = ["# Шпаргалка: сцена ↔ фраза", ""];
  for (const b of blocks) {
    out.push(`## ${oneLine(b.title)}`, "", mdRow(CHEAT_COLUMNS), `|${CHEAT_COLUMNS.map(() => "---").join("|")}|`, ...b.rows.map((r) => mdRow(cells(r))), "");
  }
  return out.join("\n");
}
