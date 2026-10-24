// Имена в пакете экспорта сценария (спека §9 п.3): `NN_<slug>.mp4` / `NN_<slug>_alpha.mov`,
// slug — транслит начала фразы; имя папки для человека; id пакета от id задачи.
import type { Aspect } from "@ms/contracts";

/** ГОСТ 7.79-2000 Б, упрощённо (без диакритики и апострофов). */
const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
  р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};
const SLUG_MAX = 40;

/** Транслит первых слов фразы: `[a-z0-9-]`, не длиннее 40 символов, без `-` по краям; пусто — `scene`. */
export function fileSlug(quote: string): string {
  const latin = [...quote.toLowerCase()].map((c) => TRANSLIT[c] ?? c).join("");
  const words = latin.split(/[^a-z0-9]+/).filter(Boolean);
  let out = "";
  for (const w of words) {
    const next = out ? `${out}-${w}` : w;
    if (next.length > SLUG_MAX) {
      if (!out) out = w.slice(0, SLUG_MAX);
      break;
    }
    out = next;
  }
  return out || "scene";
}

/** Номер сцены `NN` (3 знака при числе сцен больше 99). */
export function sceneNumber(n: number, total: number): string {
  return String(n).padStart(Math.max(2, String(total).length), "0");
}

/** Имена файлов сцены в папке пакета. */
export function fileNames(n: number, total: number, slug: string): { mp4: string; alpha: string } {
  const nn = sceneNumber(n, total);
  return { mp4: `${nn}_${slug}.mp4`, alpha: `${nn}_${slug}_alpha.mov` };
}

/**
 * Имя папки для человека: `<проект>_<16x9|9x16>_<YYYY-MM-DD>` (каталог на диске — id пакета).
 * Дата — по местному времени машины (вечерняя сборка не уезжает на завтрашнее число UTC).
 */
export function displayName(projectTitle: string, aspect: Aspect, createdAt: Date | string): string {
  // eslint-disable-next-line no-control-regex
  const title = projectTitle.replace(/[/\\:*?"<>|\u0000-\u001f]+/g, "-").replace(/\s+/g, " ").trim() || "проект";
  const d = new Date(createdAt);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `${title}_${aspect.replace(":", "x")}_${date}`;
}

/**
 * Id пакета задачи: `pkg_<ULID задачи>`. Все попытки задачи публикуют в один каталог: повтор
 * после сбоя находит уже опубликованный пакет, а сироту прерванной публикации — на своём месте.
 */
export function packageIdFor(jobId: string): string {
  return `pkg_${jobId.replace(/^job_/, "")}`;
}
