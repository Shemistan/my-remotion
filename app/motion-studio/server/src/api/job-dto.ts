// Задачи наружу (ревью Task 29): без абсолютных путей пользователя и хранилища. Вход
// `media.import` по пути — только имя файла; в сообщениях ошибок, командах и событиях путь
// хранилища (`MS_DATA_DIR`) заменяется на «хранилище», домашний каталог — на «~». В БД задача
// не меняется (идемпотентность сравнивает исходный вход).
import { homedir } from "node:os";
import { basename } from "node:path";
import type { Job, JobEventDto } from "@ms/contracts";

/** Маскирует абсолютные пути: хранилище → «хранилище», домашний каталог → «~». */
export function maskPaths(text: string, root: string, home: string = homedir()): string {
  let out = text;
  for (const [from, to] of [[root.replace(/\/+$/, ""), "хранилище"], [home.replace(/\/+$/, ""), "~"]] as const) {
    if (from.length > 1) out = out.split(from).join(to);
  }
  return out;
}

/** Задача для ответа API. */
export function publicJob(job: Job, root: string): Job {
  const mask = (s: string) => maskPaths(s, root);
  let input = job.input;
  if (job.type === "media.import" && input && typeof input === "object") {
    const i = input as Record<string, unknown>;
    if (typeof i.path === "string") input = { ...i, path: basename(i.path) };
  }
  const error = job.error
    ? { ...job.error, message: mask(job.error.message), ...(job.error.cmds ? { cmds: job.error.cmds.map(mask) } : {}) }
    : job.error;
  return { ...job, input, error };
}

/** Событие задачи для ответа API и SSE: сообщение без абсолютных путей. */
export function publicEvent(ev: JobEventDto, root: string): JobEventDto {
  return { ...ev, message: maskPaths(ev.message, root) };
}
