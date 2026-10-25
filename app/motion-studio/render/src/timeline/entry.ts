// Точка входа бандла таймлайна (Task 36): статические импорты `src/Scene.tsx` версий сцен в
// реестр по ключу и одна `<Composition id="ProjectTimeline">`. До записи — static check каждой
// версии: сцена в составе таймлайна не обходит проверку, которую прошла бы одна (сеть, eval, модули
// вне allowlist). Сам checker живёт на сервере (`checkSceneDir`), поэтому передаётся вызывающим.
import { createHash, randomBytes } from "node:crypto";
import { lstat, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { contentKey, mkdirOne } from "../node/entry.js";

/** Нарушение static check (`Violation` сервера). */
export interface SceneViolation {
  rule: string;
  file: string;
  line: number;
  message: string;
}

/** Static check каталога версии (сервер: `checkSceneDir`); пусто — проверка пройдена. */
export type SceneCheck = (versionDir: string) => Promise<SceneViolation[]>;

export interface TimelineEntryInput {
  /** Версии сцен таймлайна: ключ модуля в реестре (`[A-Za-z0-9_-]{1,64}`, уникальный) и каталог версии. */
  scenes: { key: string; versionDir: string }[];
  cacheDir: string;
  check: SceneCheck;
  /** Вызывается с ключом до записи в кэш (отметка использования, Task 49a). */
  onKey?: (key: string) => Promise<void>;
}

export const TIMELINE_COMPOSITION = "ProjectTimeline";
const PROJECT_TIMELINE = fileURLToPath(new URL("./ProjectTimeline.tsx", import.meta.url));
/** Исходники, от которых зависит бандл таймлайна помимо версий (их правка меняет ключ). */
const TIMELINE_SOURCES = [
  fileURLToPath(import.meta.url),
  PROJECT_TIMELINE,
  fileURLToPath(new URL("./types.ts", import.meta.url)),
  fileURLToPath(new URL("./worker-timeline.ts", import.meta.url)),
];
const KEY = /^[A-Za-z0-9_-]{1,64}$/;

/** Ключ бандла таймлайна: sha256 исходников композиции и пар (ключ, contentKey версии) по ключу. */
export async function timelineKey(scenes: { key: string; versionDir: string }[]): Promise<string> {
  const h = createHash("sha256");
  h.update("ms-render timeline v1\0");
  for (const f of TIMELINE_SOURCES) h.update(await readFile(f)).update("\0");
  for (const s of [...scenes].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))) {
    h.update(`${s.key}\0${await contentKey(s.versionDir)}\0`);
  }
  return h.digest("hex");
}

/**
 * Пишет `<cacheDir>/entries/tl-<sha256>/index.tsx` и возвращает путь. Бросает до записи: ключ не
 * годится или повторён, у версии нет `src/Scene.tsx`, static check нашёл нарушения (текст — с
 * правилом, например `forbidden-global`). Одинаковый состав (в любом порядке) — тот же путь.
 */
export async function writeTimelineEntry(i: TimelineEntryInput): Promise<string> {
  const seen = new Set<string>();
  for (const s of i.scenes) {
    if (!KEY.test(s.key)) throw new Error(`render: ключ сцены таймлайна не годится: ${JSON.stringify(s.key)}`);
    if (seen.has(s.key)) throw new Error(`render: ключ сцены таймлайна повторён: ${s.key}`);
    seen.add(s.key);
  }
  const sorted = [...i.scenes].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  for (const s of sorted) {
    const st = await lstat(join(s.versionDir, "src", "Scene.tsx")).catch(() => undefined);
    if (!st?.isFile()) throw new Error(`render: сцена ${s.key}: нет src/Scene.tsx в ${s.versionDir}`);
    const v = await i.check(s.versionDir);
    if (v.length > 0) {
      throw new Error(`render: сцена ${s.key} не прошла static check: ${v.map((x) => `${x.rule} ${x.file}:${x.line} ${x.message}`).join("; ")}`);
    }
  }
  const key = `tl-${await timelineKey(sorted)}`;
  // Task 49a: отметка использования ключа — до первой записи в кэш (уборка не тронет его)
  await i.onKey?.(key);
  const imports = sorted.map((s, n) => `import * as M${n} from ${JSON.stringify(join(s.versionDir, "src", "Scene.tsx"))};`);
  const entries = sorted.map((s, n) => `  ${JSON.stringify(s.key)}: pick(M${n} as Record<string, unknown>, ${JSON.stringify(s.key)}),`);
  const text = `// Сгенерировано @ms/render (writeTimelineEntry). Не править руками.
import type { ComponentType } from "react";
import { Composition, registerRoot } from "remotion";
import { ProjectTimeline } from ${JSON.stringify(PROJECT_TIMELINE)};
${imports.join("\n")}

type SceneComponent = ComponentType<Record<string, unknown>>;
const pick = (m: Record<string, unknown>, key: string): SceneComponent => {
  const c = (m.Scene ?? m.default) as SceneComponent | undefined;
  if (!c) throw new Error("сцена " + key + ": src/Scene.tsx должен экспортировать компонент Scene");
  return c;
};
const registry = {
${entries.join("\n")}
};

const Timeline = (props: Record<string, unknown>) => <ProjectTimeline {...(props as never)} registry={registry} />;

// размеры, fps и длительность worker подставляет поверх: бандл от них не зависит
const Root = () => <Composition id="${TIMELINE_COMPOSITION}" component={Timeline} width={1920} height={1080} fps={30} durationInFrames={1} />;

registerRoot(Root);
`;
  const dir = await mkdirOne(join(await mkdirOne(join(i.cacheDir, "entries")), key));
  const file = join(dir, "index.tsx");
  const tmp = join(dir, `.index.tsx.${process.pid}-${randomBytes(4).toString("hex")}.tmp`);
  await writeFile(tmp, text);
  await rename(tmp, file);
  return file;
}
