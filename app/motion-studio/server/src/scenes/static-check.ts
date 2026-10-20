// Статическая проверка кода сцены до бандла: безопасность (сеть, выполнение строк,
// модули вне allowlist, выход за src/) и детерминизм (таймеры, случайность, время,
// CSS-анимации). Код не выполняется: только парсер и checker TypeScript без lib, чтобы
// отличать глобалы от локальных имён. Это фильтр ошибок агента, а не песочница:
// злонамеренный код с вычисляемыми ключами (`o[k]`) статикой не ловится — сеть
// дополнительно закрыта в Chrome рендера (Task 4).
import { lstat, readFile, readdir } from "node:fs/promises";
import { join, posix } from "node:path";
import ts from "typescript";

export type RuleId =
  | "import-not-allowed"
  | "dynamic-import"
  | "forbidden-global"
  | "forbidden-css-animation"
  | "outside-src"
  | "external-url"
  | "forbidden-dom"
  | "forbidden-file"
  | "syntax-error";

export interface Violation {
  rule: RuleId;
  /** Путь относительно каталога версии (`src/Scene.tsx`). */
  file: string;
  /** 1-based. */
  line: number;
  /** По-русски: что нарушено и чем заменить. */
  message: string;
}

export interface SceneFile {
  /** Путь относительно каталога версии, posix (`src/parts/Title.tsx`). */
  path: string;
  text: string;
}

export const ALLOWED_MODULES: ReadonlySet<string> = new Set([
  "react",
  "react/jsx-runtime",
  "remotion",
  "@remotion/fonts",
  "@ms/motion-kit",
]);
const ALLOWED_LIST = [...ALLOWED_MODULES].join(", ");

// --- Сообщения ---

const MSG_NET = (n: string) =>
  `\`${n}\` запрещён: сети при рендере нет, а внешние загрузки ломают детерминизм. ` +
  "Данные передавай через props, картинки, видео и шрифты клади в src/ (import) или в public/ и бери через staticFile().";
const MSG_EXEC = (n: string) =>
  `\`${n}\` запрещён: выполнение строки как кода и загрузка модулей в обход статического import. ` +
  `Используй статический import из allowlist (${ALLOWED_LIST}) или локального файла из src/.`;
const MSG_TIMER = (n: string) =>
  `\`${n}\` запрещён: время сцены — только номер кадра. Вычисляй состояние из useCurrentFrame() ` +
  "через interpolate/spring из remotion, без таймеров и колбэков.";
const MSG_TIME = (n: string) =>
  `\`${n}\` запрещён: текущее время делает рендер недетерминированным. Время анимации бери из useCurrentFrame(), ` +
  "а календарную дату задавай фиксированно: new Date(2024, 0, 1) или Date.UTC(...).";
const MSG_RANDOM = (n: string) =>
  `\`${n}\` запрещён: случайность должна быть детерминированной. Используй random('seed') из remotion ` +
  "(seed — строка, разная для разных элементов).";
const MSG_ENV = (n: string) =>
  `\`${n}\` запрещён: сцена не обращается к окружению браузера или Node. Рисуй через JSX и компоненты remotion; ` +
  "размеры и fps — useVideoConfig(), данные — props.";

/** Глобалы, обращение к которым запрещено целиком (в любой форме: вызов, алиас, typeof). */
const FORBIDDEN_GLOBALS = new Map<string, string>();
const add = (names: string[], msg: (n: string) => string) => names.forEach((n) => FORBIDDEN_GLOBALS.set(n, msg(n)));
add(
  [
    "fetch",
    "XMLHttpRequest",
    "WebSocket",
    "EventSource",
    "WebTransport",
    "RTCPeerConnection",
    "webkitRTCPeerConnection",
    "navigator",
    "Worker",
    "SharedWorker",
  ],
  MSG_NET,
);
FORBIDDEN_GLOBALS.set("Image", "`Image` запрещён: загрузка картинок в обход бандла. Используй <Img src={staticFile('a.png')} /> из remotion или import картинки из src/.");
FORBIDDEN_GLOBALS.set("Audio", "`Audio` запрещён: используй <Audio src={staticFile('a.mp3')} /> из remotion.");
FORBIDDEN_GLOBALS.set("FontFace", "`FontFace` запрещён: шрифты — loadFont из @remotion/fonts с url: staticFile('font.woff2') (или ensureFonts() из @ms/motion-kit).");
add(
  [
    "eval",
    "Function",
    "require",
    "module",
    "exports",
    "importScripts",
    "WebAssembly",
    "__webpack_require__",
    "__non_webpack_require__",
    "__webpack_modules__",
    "__webpack_public_path__",
    "__dirname",
    "__filename",
  ],
  MSG_EXEC,
);
add(["setTimeout", "setInterval", "setImmediate", "requestAnimationFrame", "requestIdleCallback", "queueMicrotask"], MSG_TIMER);
add(["performance"], MSG_TIME);
add(["crypto"], MSG_RANDOM);
add(
  [
    "window",
    "self",
    "globalThis",
    "global",
    "document",
    "top",
    "parent",
    "frames",
    "opener",
    "location",
    "history",
    "localStorage",
    "sessionStorage",
    "indexedDB",
    "caches",
    "cookieStore",
    "customElements",
    "open",
    "alert",
    "confirm",
    "prompt",
    "postMessage",
    "BroadcastChannel",
    "MessageChannel",
    "Notification",
  ],
  MSG_ENV,
);
FORBIDDEN_GLOBALS.set("process", "`process` запрещён: в браузере рендера его нет, а окружение сцене недоступно. Данные передавай через props.");

/** Свойства, ведущие из элемента к document/window или к сырому HTML. */
const FORBIDDEN_DOM_PROPS = new Set([
  "ownerDocument",
  "defaultView",
  "contentWindow",
  "contentDocument",
  "getRootNode",
  "innerHTML",
  "outerHTML",
  "insertAdjacentHTML",
  "srcdoc",
]);
const MSG_DOM_PROP = (n: string) =>
  `\`.${n}\` запрещён: через DOM-элемент сцена получает document/window или вставляет сырой HTML. ` +
  "Описывай разметку в JSX; ref используй только для чтения размеров.";
/** Пути к конструктору Function в обход имени `Function`. */
const FORBIDDEN_PROTO_PROPS = new Set(["constructor", "__proto__"]);
const MSG_PROTO = (n: string) =>
  `\`.${n}\` запрещён: это путь к конструктору Function (выполнение строки как кода). Обходись без доступа к конструкторам и прототипам.`;

/** Встроенные элементы, которые выполняют код, встраивают документ или стили. */
const FORBIDDEN_ELEMENTS = new Set(["script", "iframe", "object", "embed", "frame", "frameset", "portal", "base", "meta", "style"]);
const MSG_ELEMENT = (n: string) =>
  n === "style"
    ? "<style> запрещён: стили с @keyframes/transition и @import обходят проверку. Задавай стили объектом style={{...}} и анимируй от useCurrentFrame()."
    : `<${n}> запрещён: элемент выполняет код или встраивает чужой документ. Сцена — только JSX-разметка и компоненты remotion.`;
const ELEMENT_FACTORIES = new Set(["createElement", "jsx", "jsxs", "jsxDEV", "cloneElement"]);
const FORBIDDEN_ATTRS = new Map([
  ["dangerouslySetInnerHTML", "dangerouslySetInnerHTML запрещён: сырой HTML выполняет обработчики (onerror) и грузит внешние ресурсы. Описывай разметку в JSX."],
  ["srcDoc", "srcDoc запрещён: встраивает HTML-документ. Описывай разметку в JSX."],
]);

const MSG_CSS_KEY = (n: string) =>
  `CSS \`${n}\` запрещён: браузерная анимация идёт по реальному времени, а не по кадрам, и рендер расходится с превью. ` +
  "Вычисляй значение из useCurrentFrame() через interpolate(frame, [...], [...], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }).";
const MSG_CSS_CLASS = (t: string) =>
  `класс \`${t}\` запрещён: CSS-анимация/transition идёт по реальному времени. ` +
  "Анимируй style-значения от useCurrentFrame() через interpolate или spring из remotion.";
const MSG_CSS_TEXT =
  "CSS-анимация в строке (@keyframes, transition:, animation:) запрещена: она идёт по реальному времени. " +
  "Анимируй style-значения от useCurrentFrame() через interpolate или spring из remotion.";
const MSG_WAAPI = (n: string) =>
  `\`.${n}()\` (Web Animations API) запрещён: анимация идёт по реальному времени. Используй interpolate/spring от useCurrentFrame().`;

const MSG_URL =
  "внешний адрес запрещён: при рендере сети нет, ассет не загрузится. Положи файл в src/ и импортируй его, " +
  "или в public/ и бери через staticFile('имя'). Если это просто текст в кадре — убери схему (https://).";
const MSG_LINK = "<link> запрещён: подгружает внешние стили и шрифты. Шрифты — loadFont из @remotion/fonts с staticFile(), стили — объектом style.";
const MSG_CSS_IMPORT = "@import в CSS запрещён: тянет ресурсы в обход проверки. Импортируй нужный CSS-файл из .tsx через import './a.css'.";

// --- Классификация файлов ---

const CODE_KIND: Record<string, ts.ScriptKind> = {
  ".tsx": ts.ScriptKind.TSX,
  ".ts": ts.ScriptKind.TS,
  ".mts": ts.ScriptKind.TS,
  ".cts": ts.ScriptKind.TS,
  ".jsx": ts.ScriptKind.JSX,
  ".js": ts.ScriptKind.JS,
  ".mjs": ts.ScriptKind.JS,
  ".cjs": ts.ScriptKind.JS,
};
/**
 * Ассеты — ровно те расширения, для которых у бандлера Remotion 4.0.537 есть правило
 * asset (shared-bundler-config.js), плюс JSON (парсер webpack). Файл с любым другим
 * расширением webpack разобрал бы как JavaScript — поэтому он `forbidden-file`.
 */
export const ASSET_EXT: ReadonlySet<string> = new Set(
  ["png", "svg", "jpg", "jpeg", "jxl", "webp", "gif", "bmp", "webm", "mp4", "mov", "mp3", "m4a", "wav", "aac", "woff", "woff2", "otf", "ttf", "eot", "json"].map(
    (e) => `.${e}`,
  ),
);

type FileKind = "code" | "css" | "asset" | "unknown";
function fileKind(path: string): FileKind {
  const ext = posix.extname(path).toLowerCase();
  if (ext in CODE_KIND) return "code";
  if (ext === ".css") return "css";
  if (ASSET_EXT.has(ext)) return "asset";
  return "unknown";
}
const MSG_UNKNOWN_FILE = (p: string) =>
  `файл ${p} неизвестного типа: бандлер может выполнить его как код в обход проверки. ` +
  `В src/ допустимы .tsx/.ts/.jsx/.js, .css и ассеты: ${[...ASSET_EXT].join(" ")}.`;

/** Нормализованный путь внутри `src/` или `null`, если файл вне его. */
function insideSrc(path: string): string | null {
  if (path.includes("\\") || path.startsWith("/") || /^[a-zA-Z]:/.test(path)) return null;
  const n = posix.normalize(path);
  return n.startsWith("src/") ? n : null;
}
const MSG_OUTSIDE_FILE = (p: string) => `файл ${p} лежит вне src/: код сцены — только в src/ версии.`;

// --- Проверка ---

class Collector {
  readonly items: { v: Violation; order: number; pos: number }[] = [];
  report(order: number, file: string, line: number, pos: number, rule: RuleId, message: string): void {
    this.items.push({ v: { rule, file, line, message }, order, pos });
  }
  sorted(): Violation[] {
    return this.items
      .map((x, i) => ({ ...x, i }))
      .sort((a, b) => a.order - b.order || a.pos - b.pos || a.i - b.i)
      .map((x) => x.v);
  }
}

const REMOTE_START = /^\s*(?:(?:https?|wss?|ftp):|javascript:|\/\/)/i;
const REMOTE_CSS_URL = /url\(\s*['"]?\s*(?:(?:https?|wss?|ftp):|javascript:|\/\/)/i;
const CSS_ANIM_DECL = /(?:^|[;{\s])(?:-(?:webkit|moz|ms|o)-)?(?:transition|animation)(?:-[a-z-]+)?\s*:/i;
const KEYFRAMES = /@(?:-(?:webkit|moz|ms|o)-)?keyframes\b/i;
const CLASS_TOKEN = /^(?:[^\s:]+:)*!?(?:animate-|transition(?:-|$))/;

/** `transition`, `transitionDuration`, `WebkitAnimation`, `'animation-name'`, … */
function isCssAnimKey(name: string): boolean {
  const rest = name.replace(/^-?(?:webkit|moz|ms|o)(?=-|[A-Z])-?/i, "");
  return /^[tT]ransition(?:$|-|[A-Z])/.test(rest) || /^[aA]nimation(?:$|-|[A-Z])/.test(rest);
}

function propName(name: ts.PropertyName | ts.BindingName | undefined): string | undefined {
  if (!name) return undefined;
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name) && ts.isStringLiteralLike(name.expression)) return name.expression.text;
  return undefined;
}

/** Имя члена в `a.b` или `a['b']`; для вычисляемого ключа — undefined. */
function memberName(node: ts.Node): string | undefined {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node)) {
    const a = node.argumentExpression;
    if (ts.isStringLiteralLike(a) || ts.isNumericLiteral(a)) return a.text;
  }
  return undefined;
}

/** Символ без объявлений или только с ambient-объявлениями (`declare`, .d.ts) — это глобал. */
function isGlobalSymbol(sym: ts.Symbol | undefined): boolean {
  const decls = sym?.declarations;
  if (!decls || decls.length === 0) return true;
  return decls.every(isAmbient);
}

/** Объявление в ambient-контексте: под `declare` (в т.ч. `declare global`) или в .d.ts. */
function isAmbient(decl: ts.Node): boolean {
  if (decl.getSourceFile().isDeclarationFile) return true;
  for (let n: ts.Node | undefined = decl; n; n = n.parent) {
    if (ts.canHaveModifiers(n) && ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword)) return true;
  }
  return false;
}

function checkCss(c: Collector, order: number, file: string, text: string): void {
  const lines = text.split("\n");
  lines.forEach((l, i) => {
    if (KEYFRAMES.test(l) || CSS_ANIM_DECL.test(l)) c.report(order, file, i + 1, i, "forbidden-css-animation", MSG_CSS_TEXT);
    if (/@import\b/i.test(l)) c.report(order, file, i + 1, i, "external-url", MSG_CSS_IMPORT);
    else if (REMOTE_CSS_URL.test(l)) c.report(order, file, i + 1, i, "external-url", MSG_URL);
  });
}

function virtualName(i: number, path: string): string {
  return `/__scene__/${i}${posix.extname(path).toLowerCase()}`;
}

/**
 * Проверяет исходники версии. `path` — относительно каталога версии; код читается только
 * парсером TypeScript и не выполняется. Ассеты (.png, .json, …) пропускаются,
 * неизвестные типы — `forbidden-file`.
 */
export function checkSceneSource(files: SceneFile[]): Violation[] {
  const c = new Collector();
  const code = new Map<string, { order: number; path: string; text: string; kind: ts.ScriptKind }>();

  files.forEach((f, order) => {
    const inSrc = insideSrc(f.path);
    if (!inSrc) c.report(order, f.path, 1, -1, "outside-src", MSG_OUTSIDE_FILE(f.path));
    const kind = fileKind(f.path);
    if (kind === "unknown") c.report(order, f.path, 1, -1, "forbidden-file", MSG_UNKNOWN_FILE(f.path));
    else if (kind === "css") checkCss(c, order, f.path, f.text);
    else if (kind === "code") {
      const ext = posix.extname(f.path).toLowerCase();
      code.set(virtualName(order, f.path), { order, path: f.path, text: f.text, kind: CODE_KIND[ext]! });
    }
  });
  if (code.size === 0) return c.sorted();

  // Программа без lib и без разрешения модулей: имя без локального объявления не
  // разрешается — значит, это глобал. Каждый файл — модуль, как в webpack.
  const options: ts.CompilerOptions = {
    noLib: true,
    noResolve: true,
    types: [],
    allowJs: true,
    jsx: ts.JsxEmit.Preserve,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleDetection: ts.ModuleDetectionKind.Force,
  };
  const host: ts.CompilerHost = {
    getSourceFile: (name, lang) => {
      const f = code.get(name);
      return f && ts.createSourceFile(name, f.text, lang, true, f.kind);
    },
    getDefaultLibFileName: () => "/__scene__/lib.d.ts",
    writeFile: () => {},
    getCurrentDirectory: () => "/__scene__",
    getCanonicalFileName: (n) => n,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    fileExists: (n) => code.has(n),
    readFile: (n) => code.get(n)?.text,
  };
  const program = ts.createProgram([...code.keys()], options, host);
  const checker = program.getTypeChecker();

  for (const [name, f] of code) {
    const sf = program.getSourceFile(name)!;
    new FileChecker(c, checker, sf, f.order, f.path, insideSrc(f.path)).run(program);
  }
  return c.sorted();
}

class FileChecker {
  /** Вызовы, уже отклонённые как forbidden-global: внешние URL в их аргументах не дублируем. */
  private readonly suppressed = new Set<ts.Node>();
  private suppressDepth = 0;

  constructor(
    private readonly c: Collector,
    private readonly checker: ts.TypeChecker,
    private readonly sf: ts.SourceFile,
    private readonly order: number,
    private readonly file: string,
    private readonly srcPath: string | null,
  ) {}

  private report(node: ts.Node | number, rule: RuleId, message: string): void {
    const pos = typeof node === "number" ? node : node.getStart(this.sf);
    const line = this.sf.getLineAndCharacterOfPosition(pos).line + 1;
    this.c.report(this.order, this.file, line, pos, rule, message);
  }

  run(program: ts.Program): void {
    // Синтаксическая ошибка: AST восстановлен парсером и ненадёжен — сначала её чинить.
    const syn = program.getSyntacticDiagnostics(this.sf);
    if (syn.length > 0) {
      const seen = new Set<string>();
      for (const d of syn) {
        const msg = ts.flattenDiagnosticMessageText(d.messageText, "\n");
        const key = `${d.start}:${msg}`;
        if (seen.has(key)) continue;
        seen.add(key);
        this.report(d.start ?? 0, "syntax-error", `синтаксическая ошибка: ${msg}. Исправь синтаксис — остальные проверки файла выполнятся после.`);
      }
      return;
    }
    for (const r of [...this.sf.referencedFiles, ...this.sf.typeReferenceDirectives, ...this.sf.libReferenceDirectives]) {
      this.report(r.pos, "import-not-allowed", `директива /// <reference> (${r.fileName}) запрещена: модули и типы — только через import из allowlist (${ALLOWED_LIST}).`);
    }
    this.visit(this.sf);
  }

  // --- импорт ---

  private checkSpecifier(spec: ts.Expression | undefined, at: ts.Node): void {
    if (!spec) return;
    if (!ts.isStringLiteral(spec)) {
      this.report(at, "syntax-error", "спецификатор импорта должен быть строковым литералом в кавычках, без шаблона и выражений.");
      return;
    }
    const s = spec.text;
    if (s === "." || s === ".." || s.startsWith("./") || s.startsWith("../")) {
      if (!this.srcPath) return; // файл уже отклонён как outside-src
      const target = posix.normalize(posix.join(posix.dirname(this.srcPath), s));
      if (target !== "src" && !target.startsWith("src/")) {
        this.report(spec, "outside-src", `импорт '${s}' выходит за пределы src/ версии. Импортируй только файлы внутри src/ или модули из allowlist (${ALLOWED_LIST}).`);
      }
      return;
    }
    if (s.startsWith("/")) {
      this.report(spec, "outside-src", `абсолютный путь '${s}' запрещён: импортируй файлы из src/ относительным путём ('./…').`);
      return;
    }
    if (!ALLOWED_MODULES.has(s)) {
      this.report(
        spec,
        "import-not-allowed",
        `модуль '${s}' не входит в allowlist (${ALLOWED_LIST}). Анимацию делай через useCurrentFrame() + interpolate/spring из remotion ` +
          "или компоненты @ms/motion-kit; свой код — локальным файлом в src/.",
      );
    }
  }

  // --- глобалы ---

  private symbolOf(id: ts.Identifier): ts.Symbol | undefined {
    const p = id.parent;
    if (ts.isShorthandPropertyAssignment(p) && p.name === id) return this.checker.getShorthandAssignmentValueSymbol(p);
    if (ts.isExportSpecifier(p)) return this.checker.getExportSpecifierLocalTargetSymbol(p);
    return this.checker.getSymbolAtLocation(id);
  }

  /** Идентификатор — ссылка на значение (а не имя свойства, метка, тег и т.п.). */
  private isValueReference(id: ts.Identifier): boolean {
    const p = id.parent;
    if (ts.isPropertyAccessExpression(p) && p.name === id) return false;
    if (ts.isQualifiedName(p) && p.right === id) return false;
    if (
      (ts.isPropertyAssignment(p) ||
        ts.isPropertyDeclaration(p) ||
        ts.isMethodDeclaration(p) ||
        ts.isGetAccessorDeclaration(p) ||
        ts.isSetAccessorDeclaration(p) ||
        ts.isPropertySignature(p) ||
        ts.isMethodSignature(p) ||
        ts.isEnumMember(p)) &&
      p.name === id
    )
      return false;
    if (ts.isBindingElement(p) && p.propertyName === id) return false;
    if (ts.isJsxAttribute(p) || ts.isJsxNamespacedName(p)) return false;
    if (ts.isLabeledStatement(p) || ts.isBreakOrContinueStatement(p)) return false;
    if (ts.isMetaProperty(p)) return false;
    if ((ts.isJsxOpeningElement(p) || ts.isJsxSelfClosingElement(p) || ts.isJsxClosingElement(p)) && p.tagName === id && /^[a-z]/.test(id.text))
      return false;
    if (ts.isImportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p) || ts.isNamespaceExport(p)) return false;
    if (ts.isExportSpecifier(p)) return (p.propertyName ?? p.name) === id && !p.parent.parent.moduleSpecifier;
    return true;
  }

  /** Отмечает вызов, в callee которого стоит запрещённый глобал. */
  private suppressCallOf(node: ts.Node): void {
    let cur = node;
    for (;;) {
      const p = cur.parent;
      if (!p) return;
      if (
        ((ts.isPropertyAccessExpression(p) || ts.isElementAccessExpression(p)) && p.expression === cur) ||
        ts.isParenthesizedExpression(p) ||
        ts.isNonNullExpression(p) ||
        ts.isAsExpression(p) ||
        (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.CommaToken && p.right === cur)
      ) {
        cur = p;
        continue;
      }
      if ((ts.isCallExpression(p) || ts.isNewExpression(p)) && p.expression === cur) {
        this.suppressed.add(p);
        cur = p;
        continue;
      }
      return;
    }
  }

  private checkIdentifier(id: ts.Identifier): void {
    if (!this.isValueReference(id)) return;
    const name = id.text;
    const special = name === "Math" || name === "Date";
    if (!special && !FORBIDDEN_GLOBALS.has(name)) return;
    if (!isGlobalSymbol(this.symbolOf(id))) return;

    if (name === "Math") {
      const m = memberName(id.parent);
      if (m !== undefined && m !== "random" && (id.parent as ts.PropertyAccessExpression).expression === id) return;
      this.report(id, "forbidden-global", m === "random" ? MSG_RANDOM("Math.random") : MSG_RANDOM("Math") + " Вызывай методы Math напрямую (Math.floor(...)), без алиаса.");
      return;
    }
    if (name === "Date") {
      const p = id.parent;
      if (ts.isNewExpression(p) && p.expression === id && p.arguments && p.arguments.length > 0 && !p.arguments.some(ts.isSpreadElement)) return;
      const m = memberName(p);
      if ((m === "UTC" || m === "parse") && (p as ts.PropertyAccessExpression).expression === id) return;
      const what = m === "now" ? "Date.now" : ts.isNewExpression(p) ? "new Date()" : ts.isCallExpression(p) ? "Date()" : "Date";
      this.report(id, "forbidden-global", MSG_TIME(what));
      return;
    }
    this.report(id, "forbidden-global", FORBIDDEN_GLOBALS.get(name)!);
    this.suppressCallOf(id);
  }

  private checkThis(node: ts.Node): void {
    let cur: ts.Node = node.parent;
    while (cur) {
      if (ts.isArrowFunction(cur)) {
        cur = cur.parent;
        continue;
      }
      if (ts.isFunctionDeclaration(cur) || ts.isFunctionExpression(cur) || ts.isSourceFile(cur)) {
        this.report(node, "forbidden-global", "`this` вне класса запрещён: в нестрогом коде это window. Используй явные переменные и параметры.");
        return;
      }
      if (ts.isClassLike(cur) || ts.isMethodDeclaration(cur) || ts.isConstructorDeclaration(cur) || ts.isAccessor(cur) || ts.isClassStaticBlockDeclaration(cur)) return;
      cur = cur.parent;
    }
  }

  // --- члены, элементы, строки ---

  private checkMember(node: ts.PropertyAccessExpression | ts.ElementAccessExpression): void {
    const m = memberName(node);
    if (m === undefined) return;
    const at = ts.isPropertyAccessExpression(node) ? node.name : node.argumentExpression;
    if (FORBIDDEN_PROTO_PROPS.has(m)) this.report(at, "forbidden-global", MSG_PROTO(m));
    else if (FORBIDDEN_DOM_PROPS.has(m)) this.report(at, "forbidden-dom", MSG_DOM_PROP(m));
    else if (isCssAnimKey(m) && memberName(node.expression) === "style") this.report(at, "forbidden-css-animation", MSG_CSS_KEY(m));
  }

  private checkCall(node: ts.CallExpression): void {
    if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      this.report(
        node,
        "dynamic-import",
        "динамический import() запрещён, даже для разрешённых модулей: бандл должен быть статическим. Используй статический import вверху файла.",
      );
      this.suppressed.add(node);
      return;
    }
    const callee = node.expression;
    const fn = ts.isIdentifier(callee) ? callee.text : memberName(callee);
    const arg0 = node.arguments[0];
    if (fn && ELEMENT_FACTORIES.has(fn) && arg0 && ts.isStringLiteralLike(arg0)) {
      const tag = arg0.text.toLowerCase();
      if (FORBIDDEN_ELEMENTS.has(tag)) this.report(arg0, "forbidden-dom", MSG_ELEMENT(tag));
      else if (tag === "link") this.report(arg0, "external-url", MSG_LINK);
    }
    if (!ts.isIdentifier(callee) && (fn === "animate" || fn === "getAnimations")) this.report(callee, "forbidden-css-animation", MSG_WAAPI(fn));
    if (fn === "setProperty" && arg0 && ts.isStringLiteralLike(arg0) && isCssAnimKey(arg0.text)) this.report(arg0, "forbidden-css-animation", MSG_CSS_KEY(arg0.text));
  }

  private checkJsxTag(tag: ts.JsxTagNameExpression): void {
    if (!ts.isIdentifier(tag) || !/^[a-z]/.test(tag.text)) return;
    if (FORBIDDEN_ELEMENTS.has(tag.text)) this.report(tag, "forbidden-dom", MSG_ELEMENT(tag.text));
    else if (tag.text === "link") this.report(tag, "external-url", MSG_LINK);
  }

  private checkKey(name: string | undefined, at: ts.Node): void {
    if (name === undefined) return;
    const attr = FORBIDDEN_ATTRS.get(name);
    if (attr) this.report(at, "forbidden-dom", attr);
    else if (isCssAnimKey(name)) this.report(at, "forbidden-css-animation", MSG_CSS_KEY(name));
  }

  /** Строковые части внутри значения className: токены animate-* и transition*. */
  private checkClassName(init: ts.Node): void {
    const walk = (n: ts.Node): boolean => {
      let text: string | undefined;
      if (ts.isStringLiteralLike(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) text = n.text;
      if (text !== undefined) {
        const bad = text.split(/\s+/).find((t) => CLASS_TOKEN.test(t));
        if (bad) {
          this.report(n, "forbidden-css-animation", MSG_CSS_CLASS(bad));
          return true;
        }
      }
      return ts.forEachChild(n, (ch) => (walk(ch) ? true : undefined)) ?? false;
    };
    walk(init);
  }

  private checkString(node: ts.StringLiteralLike | ts.TemplateLiteralLikeNode, isStart: boolean): void {
    const text = node.text;
    if (this.suppressDepth === 0 && ((isStart && REMOTE_START.test(text)) || REMOTE_CSS_URL.test(text))) this.report(node, "external-url", MSG_URL);
    if (KEYFRAMES.test(text) || CSS_ANIM_DECL.test(text)) this.report(node, "forbidden-css-animation", MSG_CSS_TEXT);
  }

  // --- обход ---

  private visit(node: ts.Node): void {
    // Позиции типов на рантайм не влияют (стираются): import('x') в типе, typeof window в типе.
    if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
    if (ts.isHeritageClause(node) && node.token === ts.SyntaxKind.ImplementsKeyword) return;
    if (ts.isTypeNode(node) && !ts.isExpressionWithTypeArguments(node)) return;

    if (ts.isImportDeclaration(node)) {
      if (!node.importClause?.isTypeOnly) this.checkSpecifier(node.moduleSpecifier, node);
      return;
    }
    if (ts.isExportDeclaration(node)) {
      if (node.isTypeOnly) return;
      if (node.moduleSpecifier) {
        this.checkSpecifier(node.moduleSpecifier, node);
        return;
      }
    }
    if (ts.isImportEqualsDeclaration(node)) {
      if (node.isTypeOnly) return;
      if (ts.isExternalModuleReference(node.moduleReference)) {
        this.report(node, "forbidden-global", MSG_EXEC("require"));
        return;
      }
      let root: ts.EntityName = node.moduleReference;
      while (ts.isQualifiedName(root)) root = root.left;
      this.checkIdentifier(root);
      return;
    }

    if (ts.isIdentifier(node)) this.checkIdentifier(node);
    else if (node.kind === ts.SyntaxKind.ThisKeyword) this.checkThis(node);
    else if (ts.isWithStatement(node)) this.report(node, "forbidden-global", "with запрещён: подменяет область видимости и скрывает обращения к глобалам.");
    else if (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword)
      this.report(node, "forbidden-global", "import.meta запрещён: даёт адреса модулей и загрузку в обход import. Ассеты импортируй из src/ или бери через staticFile().");
    else if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) this.checkMember(node);
    else if (ts.isCallExpression(node)) this.checkCall(node);
    else if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) this.checkJsxTag(node.tagName);
    else if (ts.isJsxAttribute(node)) {
      const n = propName(ts.isIdentifier(node.name) ? node.name : undefined);
      const attr = n && FORBIDDEN_ATTRS.get(n);
      if (attr) this.report(node.name, "forbidden-dom", attr);
      if ((n === "className" || n === "class") && node.initializer) this.checkClassName(node.initializer);
    } else if (ts.isPropertyAssignment(node)) {
      this.checkKey(propName(node.name), node.name);
      if (propName(node.name) === "className") this.checkClassName(node.initializer);
    } else if (ts.isShorthandPropertyAssignment(node)) this.checkKey(node.name.text, node.name);
    else if (ts.isBindingElement(node)) {
      const key = propName(node.propertyName ?? (ts.isIdentifier(node.name) ? node.name : undefined));
      const at = node.propertyName ?? node.name;
      if (key && FORBIDDEN_PROTO_PROPS.has(key)) this.report(at, "forbidden-global", MSG_PROTO(key));
      else if (key && FORBIDDEN_DOM_PROPS.has(key)) this.report(at, "forbidden-dom", MSG_DOM_PROP(key));
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node)) this.checkString(node, true);
    else if (ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) this.checkString(node, false);

    if ((ts.isCallExpression(node) || ts.isNewExpression(node)) && node.arguments) {
      // callee — первым: он помечает вызов, аргументы которого уже не проверяем на URL.
      this.visit(node.expression);
      node.typeArguments?.forEach((t) => this.visit(t));
      const suppress = this.suppressed.has(node);
      if (suppress) this.suppressDepth++;
      node.arguments.forEach((a) => this.visit(a));
      if (suppress) this.suppressDepth--;
      return;
    }
    ts.forEachChild(node, (ch) => this.visit(ch));
  }
}

// --- Каталог версии на диске ---

/**
 * Проверяет `src/` версии на диске: симлинки и не-файлы — `outside-src`, неизвестные
 * типы — `forbidden-file`, код и CSS — `checkSceneSource`. Вне `src/` каталог не
 * обходится: бандл берёт только `src/Scene.tsx` и его импорты, а выход импорта за
 * `src/` ловит `outside-src`.
 */
export async function checkSceneDir(versionDir: string): Promise<Violation[]> {
  const pre: Violation[] = [];
  const files: SceneFile[] = [];
  const src = join(versionDir, "src");
  const st = await lstat(src).catch(() => undefined);
  if (!st || st.isSymbolicLink() || !st.isDirectory()) {
    const what = !st ? "нет каталога src/" : "src/ — не обычный каталог (симлинк или файл)";
    return [{ rule: "outside-src", file: "src", line: 1, message: `${what}: код сцены должен лежать в каталоге src/ версии.` }];
  }
  const walk = async (rel: string): Promise<void> => {
    const entries = await readdir(join(versionDir, rel), { withFileTypes: true });
    for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const r = `${rel}/${e.name}`;
      if (e.isSymbolicLink()) {
        pre.push({ rule: "outside-src", file: r, line: 1, message: `симлинк ${r} запрещён: он может вести за пределы src/. Положи сам файл в src/.` });
      } else if (e.isDirectory()) await walk(r);
      else if (!e.isFile()) {
        pre.push({ rule: "outside-src", file: r, line: 1, message: `${r} — не обычный файл и не каталог; в src/ допустимы только файлы.` });
      } else if (fileKind(r) === "unknown") {
        pre.push({ rule: "forbidden-file", file: r, line: 1, message: MSG_UNKNOWN_FILE(r) });
      } else if (fileKind(r) !== "asset") {
        files.push({ path: r, text: await readFile(join(versionDir, r), "utf8") });
      }
    }
  };
  await walk("src");
  const checked = checkSceneSource(files);
  return [...pre, ...checked].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
}
