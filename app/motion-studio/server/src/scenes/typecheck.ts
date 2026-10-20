// Проверка типов версии сцены: `ts.createProgram` по `src/` версии. Версия лежит в
// MS_DATA_DIR, вне дерева приложения, поэтому модули ищутся через `paths`: алиас
// `@ms/motion-kit` → render/src/motion-kit (как в webpack), остальное — в node_modules
// приложения. Типы Node не подключаются: в браузере рендера их нет.
import { lstat, readdir } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { APP_NODE_MODULES, MOTION_KIT_DIR } from "@ms/render";
import ts from "typescript";

export interface TypeErrorEntry {
  /** Путь относительно каталога версии, posix; "" — ошибка без файла (опции). */
  file: string;
  /** 1-based; 0 — без позиции. */
  line: number;
  message: string;
}

const ROOT_EXT = new Set([".ts", ".tsx", ".mts", ".cts"]);

/**
 * Ассеты, которые бандлер Remotion отдаёт как URL, но которых нет в `remotion/asset-types`
 * (png, jpg, svg, woff2, mp4, … там уже объявлены).
 */
const ASSET_DECLS = ["webp", "mov", "m4a", "otf", "ttf", "eot"]
  .map((e) => `declare module "*.${e}" {\n  const src: string;\n  export default src;\n}\n`)
  .join("");
const ASSET_DECLS_FILE = resolve(APP_NODE_MODULES, "..", "__ms_scene_assets__.d.ts");

async function listRoots(dir: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(join(dir, rel), { withFileTypes: true });
  for (const e of entries) {
    const r = rel ? join(rel, e.name) : e.name;
    // Симлинки не читаем: их отклоняет static check (outside-src).
    if (e.isDirectory()) out.push(...(await listRoots(dir, r)));
    else if (e.isFile() && ROOT_EXT.has(e.name.slice(e.name.lastIndexOf(".")))) out.push(join(dir, r));
  }
  return out;
}

export function sceneCompilerOptions(): ts.CompilerOptions {
  return {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    moduleDetection: ts.ModuleDetectionKind.Force,
    jsx: ts.JsxEmit.ReactJSX,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
    types: [],
    typeRoots: [],
    allowJs: true,
    resolveJsonModule: true,
    isolatedModules: true,
    paths: {
      "@ms/motion-kit": [MOTION_KIT_DIR],
      // @types — первым: с allowJs иначе выиграл бы react/index.js без типов.
      "*": [join(APP_NODE_MODULES, "@types", "*"), join(APP_NODE_MODULES, "*")],
    },
  };
}

/**
 * Ошибки типов в `src/` версии (ошибки в motion-kit и библиотеках не включаются).
 *
 * Предусловие: вызывать только после `checkSceneDir(versionDir)`, вернувшего `[]`.
 * Компилятор следует по `import` и `/// <reference>` и читает файлы, на которые они
 * указывают, в том числе вне версии; симлинки внутри `src/` он тоже разыменует. Код при
 * этом не выполняется, но без static check typecheck — чтение произвольных путей.
 */
export async function typecheckVersion(versionDir: string): Promise<TypeErrorEntry[]> {
  const root = resolve(versionDir);
  const src = join(root, "src");
  const st = await lstat(src).catch(() => undefined);
  if (!st?.isDirectory()) throw new Error(`typecheck: нет каталога src/ версии (${src})`);
  const roots = (await listRoots(src)).sort();

  const options = sceneCompilerOptions();
  const host = ts.createCompilerHost(options, true);
  const { getSourceFile, fileExists, readFile } = host;
  host.getSourceFile = (name, lang, ...rest) =>
    resolve(name) === ASSET_DECLS_FILE ? ts.createSourceFile(name, ASSET_DECLS, lang, true) : getSourceFile.call(host, name, lang, ...rest);
  host.fileExists = (name) => resolve(name) === ASSET_DECLS_FILE || fileExists.call(host, name);
  host.readFile = (name) => (resolve(name) === ASSET_DECLS_FILE ? ASSET_DECLS : readFile.call(host, name));

  const program = ts.createProgram([...roots, ASSET_DECLS_FILE], options, host);
  const out: TypeErrorEntry[] = [];
  for (const d of ts.getPreEmitDiagnostics(program)) {
    const message = ts.flattenDiagnosticMessageText(d.messageText, "\n");
    if (!d.file) {
      out.push({ file: "", line: 0, message });
      continue;
    }
    const abs = resolve(d.file.fileName);
    if (!abs.startsWith(root + sep)) continue;
    const line = d.start === undefined ? 0 : d.file.getLineAndCharacterOfPosition(d.start).line + 1;
    out.push({ file: relative(root, abs).split(sep).join("/"), line, message });
  }
  return out.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
}
