// Системные промпты ролей (`prompts/<role>.md`, M8): общие части — `prompts/partials/<имя>.md`,
// вставляются как `{{> имя}}` (рубрика качества, контракт сцены). Подстановка — до модели:
// сырая вставка в `--append-system-prompt` не уходит, неизвестный partial — ошибка.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Role } from "./runtime.js";

/** Каталог `prompts/` приложения. */
export const PROMPTS_DIR = fileURLToPath(new URL("../../../prompts/", import.meta.url));

const PARTIAL = /\{\{>\s*([a-z0-9][a-z0-9-]*)\s*\}\}/g;
const NAME = /^[a-z0-9][a-z0-9-]*$/;

/** Файл роли: `motion_director` → `motion-director.md`. */
export const promptFile = (role: Role): string => `${role.replace(/_/g, "-")}.md`;

/** Подставляет partials (и вложенные); `stack` — цепочка имён для поиска цикла. */
function expand(text: string, dir: string, stack: string[]): string {
  return text.replace(PARTIAL, (_m, name: string) => {
    if (!NAME.test(name)) throw new Error(`prompts: недопустимое имя partial: ${name}`);
    if (stack.includes(name)) throw new Error(`prompts: цикл вставок partial: ${[...stack, name].join(" → ")}`);
    let body: string;
    try {
      body = readFileSync(join(dir, "partials", `${name}.md`), "utf8");
    } catch (e) {
      throw new Error(`prompts: неизвестный partial «${name}»: ${(e as Error).message}`, { cause: e });
    }
    // перевод строки в конце файла partial не рвёт строку, в которую он вставлен
    return expand(body.replace(/\n+$/, ""), dir, [...stack, name]);
  });
}

/** Системный промпт роли с подставленными partials. */
export function loadPrompt(role: Role, dir: string = PROMPTS_DIR): string {
  let text: string;
  try {
    text = readFileSync(join(dir, promptFile(role)), "utf8");
  } catch (e) {
    throw new Error(`prompts: промпт роли ${role} не прочитан: ${(e as Error).message}`, { cause: e });
  }
  return expand(text, dir, []);
}
