// Разрешение модулей бандла сцены без поиска вверх от draft. Обычный `modules:
// ["node_modules"]` webpack ищет `node_modules` во всех предках импортирующего файла:
// `<draft>/node_modules/@remotion/fonts` или `<draft>/src/node_modules/x/package.json`
// с `"main": "../../../evil.js"` подменили бы настоящие пакеты в обход static check.
// Здесь корень модулей один — `node_modules` workspaces (абсолютный путь, без иерархии),
// а вложенные `node_modules` пакетов (например, zod 4 у @remotion/studio) ищутся только
// для файлов, которые сами лежат внутри этого корня.
//
// Модуль импортирует worker.ts (стирание типов Node), поэтому здесь только node:* и
// `import type`.
import { realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";

/** Минимум enhanced-resolve, на который опирается плагин (типы пакета не тянем в worker). */
interface ResolveRequest {
  path?: string | false;
  request?: string;
  module?: boolean;
  [k: string]: unknown;
}
type Callback = (err?: Error | null, result?: ResolveRequest | null) => void;
interface ResolverLike {
  fileSystem: { stat(p: string, cb: (err: unknown, st?: { isDirectory(): boolean }) => void): void };
  getHook(name: string): { tapAsync(opts: { name: string; stage?: number }, fn: (req: ResolveRequest, ctx: unknown, cb: Callback) => void): void };
  ensureHook(name: string): unknown;
  doResolve(hook: unknown, req: ResolveRequest, message: string, ctx: unknown, cb: Callback): void;
}

/** `p` строго внутри `root`. */
export function isInside(root: string, p: string): boolean {
  const r = relative(root, p);
  return r !== "" && !isAbsolute(r) && r.split(sep)[0] !== "..";
}

/**
 * Вложенные `node_modules` пакетов внутри корня: для файла `<root>/a/b/dist/x.js` —
 * `<root>/a/b/dist/node_modules`, `<root>/a/b/node_modules`, `<root>/a/node_modules`.
 * Идёт раньше поиска в самом корне (stage < 0), как обычный иерархический поиск.
 * Для файлов вне корня (draft, кэш entry, motion-kit) ничего не делает.
 */
export class NestedNodeModulesPlugin {
  private readonly roots: string[];

  constructor(nodeModules: string) {
    let real = nodeModules;
    try {
      real = realpathSync(nodeModules);
    } catch {
      // каталога нет — сравниваем как есть
    }
    this.roots = [...new Set([nodeModules, real])];
  }

  /** Каталоги `node_modules` между `from` и корнем (без самого корня), ближние первыми. */
  nestedDirs(from: string): string[] {
    const root = this.roots.find((r) => isInside(r, from));
    if (!root) return [];
    const out: string[] = [];
    for (let d = from; isInside(root, d); d = dirname(d)) {
      if (basename(d) !== "node_modules") out.push(join(d, "node_modules"));
    }
    return out;
  }

  apply(resolver: ResolverLike): void {
    const target = resolver.ensureHook("module");
    resolver.getHook("raw-module").tapAsync({ name: "MsNestedNodeModules", stage: -10 }, (request, ctx, callback) => {
      const from = request.path;
      const dirs = typeof from === "string" ? this.nestedDirs(from) : [];
      const next = (i: number): void => {
        if (i >= dirs.length) return callback();
        const dir = dirs[i]!;
        resolver.fileSystem.stat(dir, (err, st) => {
          if (err || !st?.isDirectory()) return next(i + 1);
          const obj: ResolveRequest = { ...request, path: dir, request: `./${request.request}`, module: false };
          resolver.doResolve(target, obj, `looking for modules in ${dir}`, ctx, (e, result) => {
            if (e) return callback(e);
            if (result !== undefined && result !== null) return callback(null, result);
            next(i + 1);
          });
        });
      };
      next(0);
    });
  }
}

/** Поля `resolve` конфига webpack, которые меняет `jailResolve`. */
interface ResolveFields {
  alias?: unknown;
  extensionAlias?: Record<string, string | string[]>;
  plugins?: unknown[];
}

/**
 * `resolve` бандла сцены: модули только из `nodeModules` (абсолютный корень) плюс
 * вложенные `node_modules` пакетов внутри него; алиас `@ms/motion-kit`.
 */
export function jailResolve<T extends object>(base: T | undefined, o: { nodeModules: string; motionKitDir: string }): T {
  const b = (base ?? {}) as ResolveFields;
  return {
    ...b,
    alias: { ...(b.alias as Record<string, string> | undefined), "@ms/motion-kit": o.motionKitDir },
    modules: [o.nodeModules],
    plugins: [...(b.plugins ?? []), new NestedNodeModulesPlugin(o.nodeModules)],
    // motion-kit пишет импорты с `.js` (NodeNext, как остальной пакет render):
    // webpack сначала ищет одноимённый .ts/.tsx. Правило глобальное — действует на
    // все импорты бандла (код сцены, node_modules), не только на kit. Это безопасно:
    // для `x.js` без соседнего `x.ts`/`x.tsx` разрешение то же, что без алиаса.
    extensionAlias: { ...b.extensionAlias, ".js": [".ts", ".tsx", ".js"] },
  } as unknown as T;
}
