// Несохранённое состояние вкладок сценария (S8, ревью I4): черновик текста и скорость чтения
// до плана живут в sessionStorage по id проекта — переживают смену вкладки и перечитывание
// состояния. Хранилище недоступно (приватный режим, квота) — работа без него.
import { type ReadingSettings, ReadingSettingsSchema } from "@ms/contracts";

export interface DraftBlock {
  title: string;
  text: string;
}

/** Черновик текста: правки поверх ревизии `base` (null — текста на сервере ещё не было). */
export interface TextDraft {
  base: number | null;
  blocks: DraftBlock[];
}

const draftKey = (projectId: string) => `ms.script.${projectId}.draft`;
const readingKey = (projectId: string) => `ms.script.${projectId}.reading`;

function read(key: string): unknown {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // хранилище недоступно — черновик живёт только в памяти вкладки
  }
}

const isBlocks = (x: unknown): x is DraftBlock[] =>
  Array.isArray(x) && x.length > 0 && x.every((b) => typeof b === "object" && b !== null && typeof (b as DraftBlock).title === "string" && typeof (b as DraftBlock).text === "string");

export function loadTextDraft(projectId: string): TextDraft | null {
  const x = read(draftKey(projectId)) as Partial<TextDraft> | null;
  if (!x || !isBlocks(x.blocks) || !(x.base === null || typeof x.base === "number")) return null;
  return { base: x.base, blocks: x.blocks };
}

export const saveTextDraft = (projectId: string, d: TextDraft | null) => write(draftKey(projectId), d);

export function loadReading(projectId: string): ReadingSettings | null {
  const r = ReadingSettingsSchema.safeParse(read(readingKey(projectId)));
  return r.success ? r.data : null;
}

export const saveReading = (projectId: string, r: ReadingSettings) => write(readingKey(projectId), r);
