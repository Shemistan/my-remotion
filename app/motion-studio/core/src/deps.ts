// Зависимости проекта в `<repo>/.deps/` (S19, ADR 0008): Node, ffmpeg/ffprobe, Python-окружение
// ASR — их ставит `./setup` в корне репозитория. Резолверы: сначала `.deps`, потом PATH (запасной
// путь до `./setup`, doctor предупреждает). Только node:* и стираемый синтаксис TS.
import { accessSync, constants, statSync } from "node:fs";
import { delimiter, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEPS_DIRNAME = ".deps";
/** Корень репозитория: core/src → ../../../.. */
export const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url)).replace(/\/$/, "");

type Env = Record<string, string | undefined>;

/**
 * Каталоги зависимостей по порядку: `MS_DEPS_DIR` (абсолютный) — единственный; иначе
 * `<repo>/.deps`, а в worktree агента (`…/.claude/worktrees/<имя>`) ещё и `.deps` main checkout.
 */
export function depsRoots(env: Env = process.env, repoRoot = REPO_ROOT): string[] {
  const o = env.MS_DEPS_DIR?.trim();
  if (o) {
    if (!isAbsolute(o)) throw new Error(`MS_DEPS_DIR должен быть абсолютным путём, а не ${JSON.stringify(o)}`);
    return [resolve(o)];
  }
  const own = join(repoRoot, DEPS_DIRNAME);
  // корень worktree — ровно `<main>/.claude/worktrees/<имя>` (клон в tmp/ worktree — не worktree)
  const m = /^(.+)\/\.claude\/worktrees\/[^/]+$/.exec(repoRoot);
  return m ? [own, join(m[1]!, DEPS_DIRNAME)] : [own];
}

const isFile = (p: string) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};
const isExec = (p: string) => {
  if (!isFile(p)) return false;
  try {
    accessSync(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

/** Первый существующий `<корень .deps>/<rel>`; нет — undefined. */
export function depsFile(rel: string, env: Env = process.env, repoRoot = REPO_ROOT): string | undefined {
  return depsRoots(env, repoRoot).map((r) => join(r, rel)).find(isFile);
}

/** Исполняемый файл в абсолютных каталогах PATH; нет — undefined. */
export function findOnPathSync(name: string, path = process.env.PATH ?? ""): string | undefined {
  return path.split(delimiter).filter((d) => isAbsolute(d)).map((d) => join(d, name)).find(isExec);
}

export type ToolName = "ffmpeg" | "ffprobe";
/** `deps` — закреплённая сборка `.deps/ffmpeg`, `path` — системная из PATH (запасной путь). */
export interface ResolvedTool {
  path: string;
  source: "deps" | "path";
}

/** ffmpeg/ffprobe: `<корень .deps>/ffmpeg/<имя>`, затем PATH из `env`. */
export function resolveTool(name: ToolName, env: Env = process.env, repoRoot = REPO_ROOT): ResolvedTool | undefined {
  const dep = depsRoots(env, repoRoot).map((r) => join(r, "ffmpeg", name)).find(isExec);
  if (dep) return { path: dep, source: "deps" };
  const sys = findOnPathSync(name, env.PATH ?? "");
  return sys ? { path: sys, source: "path" } : undefined;
}

/** Процесс запущен Node из `<корень .deps>/node` (а не nvm/системным). */
export function isDepsNode(execPath = process.execPath, env: Env = process.env, repoRoot = REPO_ROOT): boolean {
  return depsRoots(env, repoRoot).some((r) => {
    const rel = relative(join(r, "node"), resolve(execPath));
    return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
  });
}
