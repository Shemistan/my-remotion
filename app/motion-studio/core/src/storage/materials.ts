// Папка материалов на внешнем SSD (S18, решение человека 2026-10-25): всё, что приложение,
// его скрипты, тесты и агенты пишут на SSD, лежит в одной папке
// `/Volumes/External SSD/moution-studio-materials/` — store (рабочее хранилище), acceptance
// (хранилище и копии-отрезки приёмок), e2e (хранилища e2e по имени), examples (примеры для
// человека), models (веса моделей ASR, S19: их ставит `./setup`). Исходные видео из других папок SSD только читаются.
// Модуль — единственный источник истины для этих путей. Только node:* и стираемый синтаксис TS:
// его импортируют и чистые .mjs-скрипты (Node 22 убирает типы сам).
import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export const SSD_ROOT = "/Volumes/External SSD";
export const MATERIALS_DIR = "moution-studio-materials";
export const MATERIALS_ROOT = `${SSD_ROOT}/${MATERIALS_DIR}`;
export const MATERIALS_AREAS = ["store", "acceptance", "e2e", "examples", "models"] as const;
export type MaterialsArea = (typeof MATERIALS_AREAS)[number];

type Env = Record<string, string | undefined>;

/** Путь вне папки материалов или выход за область — ошибка программиста/настройки. */
export class MaterialsPathError extends Error {
  readonly code = "outside_materials";
  constructor(message: string) {
    super(message);
    this.name = "MaterialsPathError";
  }
}

/** Корень материалов: `MS_MATERIALS_ROOT` (тесты) или `/Volumes/External SSD/moution-studio-materials`. */
export function materialsRoot(env: Env = process.env): string {
  const o = env.MS_MATERIALS_ROOT?.trim();
  if (!o) return MATERIALS_ROOT;
  if (!isAbsolute(o)) throw new MaterialsPathError(`MS_MATERIALS_ROOT должен быть абсолютным путём, а не ${JSON.stringify(o)}`);
  return resolve(o);
}

/** Корень SSD, на котором лежат материалы (родитель корня материалов). */
export function materialsSsdRoot(env: Env = process.env): string {
  return dirname(materialsRoot(env));
}

/** Путь в области материалов: `materialsPath("e2e", "s7")` → `<корень>/e2e/s7`. */
export function materialsPath(area: MaterialsArea, ...rest: string[]): string {
  if (!(MATERIALS_AREAS as readonly string[]).includes(area)) {
    throw new MaterialsPathError(`неизвестная область материалов ${JSON.stringify(area)} (есть: ${MATERIALS_AREAS.join(", ")})`);
  }
  const base = join(materialsRoot(), area);
  for (const seg of rest) {
    if (seg === "" || isAbsolute(seg)) throw new MaterialsPathError(`недопустимая часть пути материалов ${JSON.stringify(seg)}`);
  }
  const p = join(base, ...rest);
  if (p !== base && !within(p, base)) throw new MaterialsPathError(`путь выходит за область ${area}: ${JSON.stringify(rest.join("/"))}`);
  return p;
}

const within = (p: string, root: string) => {
  const r = relative(root, p);
  return r !== "" && r !== ".." && !r.startsWith(`..${sep}`) && !isAbsolute(r);
};
const insideOrEqual = (p: string, root: string) => p === root || within(p, root);

/** realpath ближайшего существующего предка + несуществующий хвост (путь может быть ещё не создан). */
function realish(p: string): string {
  const abs = resolve(p);
  const tail: string[] = [];
  let cur = abs;
  while (!existsSync(cur)) {
    const up = dirname(cur);
    if (up === cur) return abs;
    tail.unshift(basename(cur));
    cur = up;
  }
  try {
    // .native — канонический регистр (APFS без учёта регистра: `/volumes/external ssd/…` — тот же путь)
    return join(realpathSync.native(cur), ...tail);
  } catch {
    return abs;
  }
}

/** Путь (с учётом симлинков) лежит в корне материалов или равен ему. */
export function isInMaterials(path: string, env: Env = process.env): boolean {
  return insideOrEqual(realish(path), realish(materialsRoot(env)));
}

/** Путь на SSD материалов (в т. ч. в чужих папках корня SSD). */
export function isOnMaterialsSsd(path: string, env: Env = process.env): boolean {
  return insideOrEqual(realish(path), realish(materialsSsdRoot(env)));
}

/** Запись разрешена только внутри папки материалов: иначе ошибка. Возвращает абсолютный путь. */
export function assertInMaterials(path: string, env: Env = process.env): string {
  const root = materialsRoot(env);
  if (!isInMaterials(path, env)) {
    throw new MaterialsPathError(`на SSD писать только внутри ${root}; путь ${resolve(path)} вне папки материалов`);
  }
  return resolve(path);
}

/**
 * Каталог, куда будет запись: на SSD материалов — только внутри папки материалов (иначе ошибка),
 * вне этого SSD (tmp/, другой том) — без ограничений. Возвращает абсолютный путь.
 */
export function assertSsdWriteAllowed(path: string, env: Env = process.env): string {
  return isOnMaterialsSsd(path, env) ? assertInMaterials(path, env) : resolve(path);
}

/** Хранилище на SSD материалов, но вне папки материалов → подсказка нового места; иначе undefined. */
export function materialsAdvice(dataDir: string, env: Env = process.env): string | undefined {
  if (!isOnMaterialsSsd(dataDir, env) || isInMaterials(dataDir, env)) return undefined;
  const store = join(materialsRoot(env), "store");
  return `MS_DATA_DIR ${resolve(dataDir)} на SSD вне папки материалов; материалы и хранилище — только в ${materialsRoot(env)}: перенесите хранилище (mv на том же томе) и задайте MS_DATA_DIR="${store}"`;
}
