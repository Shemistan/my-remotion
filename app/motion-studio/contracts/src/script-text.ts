// Чистые функции текста сценария (спека §5.1–§5.2), одни для сервера и UI: слова, время чтения,
// цитаты. Время — только целочисленной арифметикой кадров: сервер и браузер считают одинаково.
import type { ReadingSettings, SceneFrames, ScriptBlock, ScriptRevisionDoc, ScriptWord } from "./script.js";
import type { Fps } from "./time.js";

/** Слово: буквы/цифры с внутренними `.`, `,`, `-`, `'` между ними («1.24», «кто-то», «6,5»). */
const WORD_RE = /[\p{L}\p{N}]+(?:[.,\-'’][\p{L}\p{N}]+)*/gu;
/** Граница предложения перед словом: `.!?…`, затем пробел, слово — с заглавной или цифры. */
const SENTENCE_END_RE = /[.!?…][\s"»”')\]]*\s/u;
const STARTS_SENTENCE_RE = /^[\p{Lu}\p{N}]/u;

const wordId = (n: number): string => `w_${String(n).padStart(6, "0")}`;

/**
 * Блоки как вставил человек → блоки с id `b1…` и слова со сквозными id `w_000001…`;
 * `start`/`end` — смещения символов в тексте блока, `sentence` — номер предложения в блоке.
 * Пустые блоки не отклоняет (это делает сохранение текста, код `empty_block`).
 */
export function tokenizeScript(blocks: { title: string; text: string }[]): { blocks: ScriptBlock[]; words: ScriptWord[] } {
  const outBlocks: ScriptBlock[] = [];
  const words: ScriptWord[] = [];
  blocks.forEach((b, bi) => {
    const id = `b${bi + 1}`;
    outBlocks.push({ id, title: b.title, text: b.text });
    let sentence = 0;
    let prevEnd = -1;
    for (const m of b.text.matchAll(WORD_RE)) {
      const start = m.index;
      if (prevEnd >= 0 && SENTENCE_END_RE.test(b.text.slice(prevEnd, start)) && STARTS_SENTENCE_RE.test(m[0])) sentence++;
      words.push({ id: wordId(words.length + 1), text: m[0], block_id: id, start, end: start + m[0].length, sentence });
      prevEnd = start + m[0].length;
    }
  });
  return { blocks: outBlocks, words };
}

/** Кадры при fps num/den: round(s · num / den). */
const secondsToFrames = (s: number, fps: Fps): number => Math.round((s * fps.num) / fps.den);

/**
 * Длительность сцены из `n` слов (§5.2) в целых числах: речь — ceil(n·num·100 / (round(wps·100)·den)),
 * запас — round(s·F), всего — не короче 3 с; хвост = total − lead − speech (добор до 3 с — в хвост).
 */
export function readingFrames(n: number, reading: ReadingSettings, fps: Fps): SceneFrames {
  const wps100 = Math.round(reading.wps * 100);
  const num = n * fps.num * 100;
  const den = wps100 * fps.den;
  const speech = Math.max(1, Math.floor((num + den - 1) / den));
  const lead = secondsToFrames(reading.lead_s, fps);
  const tail = secondsToFrames(reading.tail_s, fps);
  const total = Math.max(lead + speech + tail, secondsToFrames(3, fps));
  return { lead, speech, tail: total - lead - speech, total };
}

/** Позиция фрагмента в блоке для шпаргалки: слов блока до фрагмента / wps, до 0,1 с. */
export function atSeconds(wordsBefore: number, reading: ReadingSettings): number {
  return Math.round((wordsBefore / reading.wps) * 10) / 10;
}

/** Слова от `startId` до `endId` включительно; нет id или обратный порядок — пусто. */
export function wordsBetween(doc: Pick<ScriptRevisionDoc, "words">, startId: string, endId: string): ScriptWord[] {
  const si = doc.words.findIndex((w) => w.id === startId);
  const ei = doc.words.findIndex((w) => w.id === endId);
  if (si < 0 || ei < si) return [];
  return doc.words.slice(si, ei + 1);
}

/** Цитата фрагмента: слова через пробел (`verifyQuote` пунктуацию и пробелы не сравнивает). */
export function quoteOf(doc: Pick<ScriptRevisionDoc, "words">, startId: string, endId: string): string {
  return wordsBetween(doc, startId, endId).map((w) => w.text).join(" ");
}
