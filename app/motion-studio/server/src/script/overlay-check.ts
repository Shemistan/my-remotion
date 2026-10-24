// Проверка наложения сцены сценария (S6, Р5/Р16): сцена генерируется непрозрачной, а
// ProRes с альфой даёт перерендер с `props.style.transparent = true` — это работает, только
// если фон рисует `<Background>`. Хук `extraQa` fix-loop: статика (заливка корня на весь кадр)
// и кадр hold с transparent по альфе; blocking — исправление Engineer.
import { readFile, readdir } from "node:fs/promises";
import { join, posix } from "node:path";
import type { MotionSpec, QAIssue } from "@ms/contracts";
import { alphaCoverage, overlayFrames } from "@ms/render";
import ts from "typescript";
import type { ExtraQa } from "../pipeline/fix-loop.js";
import { errText } from "../pipeline/steps.js";
import type { SceneFile } from "../scenes/static-check.js";

/** Доля непрозрачных пикселей (α ≥ 0,5), выше которой сцена рисует свой фон (Р17). */
export const OVERLAY_OPAQUE_MAX = 0.92;
/** Меньше — в альфа-версии пусто (экспорт). */
export const OVERLAY_EMPTY_MIN = 0.005;
/** Дымка 0 < α < 0,5 на большей доле кадра — предупреждение (экспорт). */
export const OVERLAY_HAZE_MAX = 0.5;

const FIX_HINT = "фон — только <Background>, убери заливку корня: AbsoluteFill/div на весь кадр без background; сцена обязана работать при transparent = true";

/** Кадр начала финального hold по spec (нет hold — последний кадр сцены). */
export function holdFrame(spec: Pick<MotionSpec, "phases" | "beats" | "duration_frames" | "fps">): number {
  const total = spec.duration_frames;
  return Math.max(...overlayFrames(spec, { lead: 0, speech: 1, tail: total - 1, total }));
}

const BG_KEYS = new Set(["background", "backgroundColor", "backgroundImage"]);
/** Обёртки, внутри которых элемент всё ещё «корень» композиции. */
const ROOT_WRAPPERS = new Set(["AbsoluteFill", "StyleProvider", "Sequence", "Series.Sequence", "Freeze", "Loop", "Camera"]);
const CODE_EXT: Record<string, ts.ScriptKind> = { ".tsx": ts.ScriptKind.TSX, ".jsx": ts.ScriptKind.JSX, ".ts": ts.ScriptKind.TS, ".js": ts.ScriptKind.JS };

type JsxNode = ts.JsxElement | ts.JsxSelfClosingElement;
const openingOf = (n: JsxNode) => (ts.isJsxElement(n) ? n.openingElement : n);
const tagOf = (n: JsxNode, sf: ts.SourceFile) => openingOf(n).tagName.getText(sf);

/** Объект `style={{…}}` элемента. */
function styleObject(n: JsxNode): ts.ObjectLiteralExpression | undefined {
  for (const a of openingOf(n).attributes.properties) {
    if (!ts.isJsxAttribute(a) || !ts.isIdentifier(a.name) || a.name.text !== "style") continue;
    const e = a.initializer && ts.isJsxExpression(a.initializer) ? a.initializer.expression : undefined;
    return e && ts.isObjectLiteralExpression(e) ? e : undefined;
  }
  return undefined;
}

/** Значения ключей объекта стиля (только `ключ: значение`). */
function props(o: ts.ObjectLiteralExpression): Map<string, ts.Expression> {
  const out = new Map<string, ts.Expression>();
  for (const p of o.properties) {
    if (!ts.isPropertyAssignment(p)) continue;
    const k = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : undefined;
    if (k) out.set(k, p.initializer);
  }
  return out;
}

const literal = (e: ts.Expression | undefined) =>
  e === undefined ? undefined : ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) ? e.text : ts.isNumericLiteral(e) ? e.text : undefined;
const zero = (e: ts.Expression | undefined) => ["0", "0px", "0%"].includes(literal(e) ?? "x");

/** Заливка: background* со значением не «прозрачно» и не зависящим от `transparent`. */
function fills(style: Map<string, ts.Expression>, sf: ts.SourceFile): boolean {
  for (const [k, v] of style) {
    if (!BG_KEYS.has(k)) continue;
    const lit = literal(v);
    if (lit !== undefined && ["", "transparent", "none"].includes(lit.trim())) continue;
    if (/\btransparent\b/.test(v.getText(sf)) && lit === undefined) continue; // учитывает режим transparent
    return true;
  }
  return false;
}

/** `div` на весь кадр: absolute + inset 0 (или все стороны 0), либо 100 % × 100 %. */
function fullSize(style: Map<string, ts.Expression>): boolean {
  const abs = literal(style.get("position")) === "absolute";
  const inset = zero(style.get("inset")) || ["top", "left", "right", "bottom"].every((k) => zero(style.get(k)));
  return (abs && inset) || (literal(style.get("width")) === "100%" && literal(style.get("height")) === "100%");
}

/**
 * Статика (Р16): элемент на весь кадр в корне композиции (`AbsoluteFill` или `div` на весь
 * кадр, над ним только обёртки корня) с заливкой `background*` → blocking `overlay_root_fill`.
 */
export function rootFillIssues(files: SceneFile[]): QAIssue[] {
  const out: QAIssue[] = [];
  for (const f of files) {
    const kind = CODE_EXT[posix.extname(f.path).toLowerCase()];
    if (kind === undefined) continue;
    const sf = ts.createSourceFile(f.path, f.text, ts.ScriptTarget.Latest, true, kind);
    const isFull = (n: JsxNode): boolean => {
      const tag = tagOf(n, sf);
      if (tag === "AbsoluteFill") return true;
      const st = styleObject(n);
      return tag === "div" && st !== undefined && fullSize(props(st));
    };
    const atRoot = (n: ts.Node): boolean => {
      for (let p = n.parent; p; p = p.parent) {
        if (!ts.isJsxElement(p)) continue;
        if (!ROOT_WRAPPERS.has(tagOf(p, sf)) && !isFull(p)) return false;
      }
      return true;
    };
    const visit = (n: ts.Node) => {
      if ((ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) && isFull(n) && atRoot(n)) {
        const st = styleObject(n);
        if (st && fills(props(st), sf)) {
          const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
          out.push({
            source: "programmatic", code: "overlay_root_fill", severity: "blocking", area: `${f.path}:${line}`,
            description: `<${tagOf(n, sf)}> на весь кадр с заливкой фона (${f.path}:${line}): при transparent = true альфа-версия для наложения будет непрозрачной`,
            fix_hint: FIX_HINT,
          });
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
}

async function sceneFiles(versionDir: string): Promise<SceneFile[]> {
  const files: SceneFile[] = [];
  const walk = async (rel: string): Promise<void> => {
    const entries = await readdir(join(versionDir, rel), { withFileTypes: true }).catch(() => []);
    for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory() && !e.isSymbolicLink() && e.name !== "node_modules") await walk(r);
      else if (e.isFile() && posix.extname(r).toLowerCase() in CODE_EXT) files.push({ path: r, text: await readFile(join(versionDir, r), "utf8") });
    }
  };
  await walk("src");
  return files;
}

export interface OverlayCheckDeps {
  /** Подмена покрытия альфой (тесты). */
  coverage?: typeof alphaCoverage;
}

const failed = (why: string): QAIssue => ({
  source: "programmatic", code: "overlay_check_failed", severity: "warning",
  description: `проверка наложения не выполнена: ${why}`,
  fix_hint: "проверка повторится на следующей попытке и при экспорте ProRes с альфой",
});

/**
 * Проверка наложения попытки (хук `extraQa`): (1) `rootFillIssues` по `src/`; (2) кадр hold
 * с `props.style.transparent = true` (`renderStills` хука, props попытки) и `alphaCoverage`:
 * доля непрозрачного > 0,92 → blocking `overlay_opaque`. Сбой рендера или ffmpeg —
 * предупреждение `overlay_check_failed`.
 */
export async function overlayChecks(i: Parameters<ExtraQa>[0], deps: OverlayCheckDeps = {}): Promise<QAIssue[]> {
  const out = rootFillIssues(await sceneFiles(i.versionDir));
  let props: Record<string, unknown>;
  try {
    props = JSON.parse(await readFile(join(i.versionDir, "props.json"), "utf8")) as Record<string, unknown>;
    if (typeof props.style !== "object" || props.style === null) throw new Error("нет props.style");
  } catch (e) {
    // props вне договора ловит props_contract; без props кадр с transparent не снять
    return [...out, failed(`props.json: ${errText(e)}`)];
  }
  const frame = holdFrame(i.spec);
  const rr = await i.renderStills([frame], { ...props, style: { ...(props.style as object), transparent: true } });
  const png = rr.stills[0];
  if (!rr.ok || !png) return [...out, failed(`рендер кадра ${frame}: ${rr.error ? `${rr.error.stage}: ${rr.error.message}` : "кадра нет"}`)];
  try {
    const c = await (deps.coverage ?? alphaCoverage)(png, [0], { run: i.run, signal: i.signal });
    if (c.opaque > OVERLAY_OPAQUE_MAX) {
      out.push({
        source: "programmatic", code: "overlay_opaque", severity: "blocking", frame,
        description: `кадр ${frame} с transparent = true непрозрачен на ${Math.round(c.opaque * 100)} % (> ${OVERLAY_OPAQUE_MAX * 100} %): сцена рисует свой фон — альфа-версия для наложения бесполезна`,
        fix_hint: FIX_HINT,
      });
    }
  } catch (e) {
    out.push(failed(`альфа кадра ${frame}: ${errText(e)}`));
  }
  return out;
}
