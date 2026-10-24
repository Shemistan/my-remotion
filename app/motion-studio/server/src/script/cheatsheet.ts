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
  /** Замечания: предупреждения QA, «нет сцены: …», «альфа-версия невозможна: …». */
  notes: string[];
}

export type CheatFormat = "md" | "csv" | "txt";

export const CHEAT_COLUMNS = [
  "№", "файл (фон)", "файл (альфа)", "блок", "≈ время в блоке", "фраза", "приём", "длительность, с", "запас в начале, с", "запас в конце, с", "замечания",
] as const;

/** Имена файлов шпаргалки в папке пакета. */
export const CHEAT_FILES: Record<CheatFormat, string> = { md: "шпаргалка.md", csv: "шпаргалка.csv", txt: "шпаргалка.txt" };

const TECH_RU = new Map<string, string>(TECHNIQUES.map((t) => [t.slug, t.ru]));

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

const oneLine = (s: string): string => s.replace(/\s*[\r\n]+\s*/g, " ");

function csvField(s: string): string {
  return /[;"\r\n]/.test(s) ? `"${s.replaceAll("\"", "\"\"")}"` : s;
}

function mdCell(s: string): string {
  return oneLine(s).replaceAll("|", "\\|").trim() || " ";
}

const mdRow = (xs: readonly string[]): string => `| ${xs.map(mdCell).join(" | ")} |`;

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
