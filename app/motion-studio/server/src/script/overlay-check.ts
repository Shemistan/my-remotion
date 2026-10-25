// Проверка наложения сцены сценария (S6, Р5/Р16): сцена генерируется непрозрачной, а
// ProRes с альфой даёт перерендер с `props.style.transparent = true` — это работает, только
// если фон рисует `<Background>`. Хук `extraQa` fix-loop: статика (заливка корня на весь кадр)
// и кадр hold с transparent по альфе; blocking — исправление Engineer.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { MotionSpec, QAIssue, QAReport, Settings } from "@ms/contracts";
import { alphaCoverage, overlayFrames } from "@ms/render";
import ts from "typescript";
import type { ExtraQa } from "../pipeline/fix-loop.js";
import type { LayoutFrame } from "../qa/layout.js";
import { errText } from "../pipeline/steps.js";
import type { SceneFile } from "../scenes/static-check.js";

/** Доля непрозрачных пикселей (α ≥ 0,5), выше которой сцена рисует свой фон (Р17). */
export const OVERLAY_OPAQUE_MAX = 0.92;
/** Меньше — в альфа-версии пусто (экспорт). */
export const OVERLAY_EMPTY_MIN = 0.005;
/** Дымка 0 < α < 0,5 на большей доле кадра — предупреждение (экспорт). */
export const OVERLAY_HAZE_MAX = 0.5;

/**
 * Коды «сцена закрывает кадр» (I2): в fix-loop — blocking (раунд Engineer); не исправлены —
 * версия всё равно ready (MP4 полезен человеку), в её QA они warning.
 */
export const OVERLAY_BLOCKERS = ["overlay_opaque", "overlay_root_fill"] as const;
/** Причина `missing` альфы в пакете (S7) у версии с `overlayOk = false`. */
export const OVERLAY_IMPOSSIBLE = "альфа-версия невозможна: сцена закрывает кадр";

/**
 * Отметка версии для экспорта альфы (S7): в QA версии нет `overlay_opaque`/`overlay_root_fill`.
 * Нет отчёта — проверка не делалась (не сцена сценария): true, решает проверка экспорта.
 */
export function overlayOk(qa: Pick<QAReport, "issues"> | null | undefined): boolean {
  return overlayProblem(qa) === undefined;
}

/** Причина для `missing` пакета (S7): `OVERLAY_IMPOSSIBLE` с описанием замечания; всё в порядке — undefined. */
export function overlayProblem(qa: Pick<QAReport, "issues"> | null | undefined): string | undefined {
  const hit = qa?.issues.find((x) => (OVERLAY_BLOCKERS as readonly string[]).includes(x.code));
  return hit ? `${OVERLAY_IMPOSSIBLE} (${hit.code}: ${hit.description})` : undefined;
}

const FIX_HINT = "фон — только <Background>, убери заливку корня: AbsoluteFill/div на весь кадр без background; сцена обязана работать при transparent = true";

/** Кадр начала финального hold по spec (нет hold — последний кадр сцены). */
export function holdFrame(spec: Pick<MotionSpec, "phases" | "beats" | "duration_frames" | "fps">): number {
  const total = spec.duration_frames;
  return Math.max(...overlayFrames(spec, { lead: 0, speech: 1, tail: total - 1, total }));
}

const BG_KEYS = new Set(["background", "backgroundColor", "backgroundImage"]);
/** Обёртки, внутри которых элемент всё ещё «корень» композиции. */
const ROOT_WRAPPERS = new Set(["AbsoluteFill", "StyleProvider", "Sequence", "Series.Sequence", "Freeze", "Loop", "Camera"]);

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

/** Цвет без непрозрачности: `transparent`, `none`, `rgba(…, 0)`, `hsla(…, 0)`, `#rgb0`, `#rrggbb00`. */
function clearColor(v: string): boolean {
  const t = v.trim().toLowerCase();
  if (["", "transparent", "none"].includes(t)) return true;
  if (/^#[0-9a-f]{3}0$/.test(t) || /^#[0-9a-f]{6}00$/.test(t)) return true;
  const fn = /^(?:rgba?|hsla?)\((.*)\)$/.exec(t);
  if (!fn) return false;
  const parts = fn[1]!.split(/[\s,/]+/).filter(Boolean);
  if (parts.length !== 4) return false;
  const a = parts[3]!;
  return a.endsWith("%") ? Number(a.slice(0, -1)) === 0 : Number(a) === 0;
}

/** Заливка: background* со значением не «прозрачно» и не зависящим от `transparent`. */
function fills(style: Map<string, ts.Expression>, sf: ts.SourceFile): boolean {
  for (const [k, v] of style) {
    if (!BG_KEYS.has(k)) continue;
    const lit = literal(v);
    if (lit !== undefined && clearColor(lit)) continue;
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

type Fn = ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration;
const isFn = (n: ts.Node): n is Fn => ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n);
const unwrap = (e: ts.Expression): ts.Expression => (ts.isParenthesizedExpression(e) ? unwrap(e.expression) : e);
const exported = (n: ts.Node, kind: ts.SyntaxKind) => ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === kind);

/**
 * Компонент сцены в `src/Scene.tsx` (как его берёт рендер: `Scene`, иначе default-экспорт):
 * функция или стрелка; `export default Имя` — по объявлению в файле.
 */
function sceneComponent(sf: ts.SourceFile): Fn | undefined {
  const decls = new Map<string, Fn>();
  let named: Fn | undefined;
  let byDefault: Fn | undefined;
  let defaultName: string | undefined;
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.body) {
      if (st.name) decls.set(st.name.text, st);
      if (exported(st, ts.SyntaxKind.DefaultKeyword)) byDefault = st;
      else if (st.name?.text === "Scene" && exported(st, ts.SyntaxKind.ExportKeyword)) named = st;
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        const init = d.initializer && unwrap(d.initializer);
        if (!ts.isIdentifier(d.name) || !init || !isFn(init)) continue;
        decls.set(d.name.text, init);
        if (d.name.text === "Scene" && exported(st, ts.SyntaxKind.ExportKeyword)) named = init;
      }
    } else if (ts.isExportAssignment(st) && !st.isExportEquals) {
      const e = unwrap(st.expression);
      if (isFn(e)) byDefault = e;
      else if (ts.isIdentifier(e)) defaultName = e.text;
    }
  }
  return named ?? byDefault ?? (defaultName ? decls.get(defaultName) : undefined);
}

/** Возвращаемые компонентом JSX (return самой функции, не вложенных). */
function returnedJsx(fn: Fn): ts.Expression[] {
  if (fn.body && !ts.isBlock(fn.body)) return [unwrap(fn.body)];
  const out: ts.Expression[] = [];
  const visit = (n: ts.Node) => {
    if (isFn(n) || ts.isClassLike(n)) return;
    if (ts.isReturnStatement(n) && n.expression) out.push(unwrap(n.expression));
    ts.forEachChild(n, visit);
  };
  if (fn.body) ts.forEachChild(fn.body, visit);
  return out;
}

/**
 * Статика (Р16, M5): корень компонента сцены (`Scene`/default из `src/Scene.tsx`) — элемент
 * на весь кадр (`AbsoluteFill` или `div` на весь кадр, сверху вниз через обёртки корня) с
 * непрозрачной заливкой `background*` → blocking `overlay_root_fill`. Свои компоненты и
 * вложенные функции не проверяются: их заливку поймает рендер кадра (`overlay_opaque`).
 */
export function rootFillIssues(files: SceneFile[]): QAIssue[] {
  const f = files.find((x) => x.path === "src/Scene.tsx");
  if (!f) return [];
  const sf = ts.createSourceFile(f.path, f.text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = sceneComponent(sf);
  if (!fn) return [];
  const out: QAIssue[] = [];
  const isFull = (n: JsxNode): boolean => {
    const tag = tagOf(n, sf);
    if (tag === "AbsoluteFill") return true;
    const st = styleObject(n);
    return tag === "div" && st !== undefined && fullSize(props(st));
  };
  const children = (n: ts.JsxElement | ts.JsxFragment): ts.Expression[] =>
    n.children.flatMap((c) => (ts.isJsxExpression(c) ? (c.expression ? [unwrap(c.expression)] : []) : ts.isJsxText(c) ? [] : [c]));
  const visit = (e: ts.Expression) => {
    if (ts.isConditionalExpression(e)) return [e.whenTrue, e.whenFalse].forEach((x) => visit(unwrap(x)));
    if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return visit(unwrap(e.right));
    if (ts.isJsxFragment(e)) return children(e).forEach(visit);
    if (!ts.isJsxElement(e) && !ts.isJsxSelfClosingElement(e)) return;
    const full = isFull(e);
    const st = styleObject(e);
    if (full && st && fills(props(st), sf)) {
      const line = sf.getLineAndCharacterOfPosition(e.getStart(sf)).line + 1;
      out.push({
        source: "programmatic", code: "overlay_root_fill", severity: "blocking", area: `${f.path}:${line}`,
        description: `<${tagOf(e, sf)}> на весь кадр с заливкой фона (${f.path}:${line}): при transparent = true альфа-версия для наложения будет непрозрачной`,
        fix_hint: FIX_HINT,
      });
      return;
    }
    if (ts.isJsxElement(e) && (full || ROOT_WRAPPERS.has(tagOf(e, sf)))) children(e).forEach(visit);
  };
  returnedJsx(fn).forEach(visit);
  return out;
}

/** Исходник компонента сцены версии (`src/Scene.tsx`); нет файла — пусто (его ловит технический gate). */
async function sceneFiles(versionDir: string): Promise<SceneFile[]> {
  const text = await readFile(join(versionDir, "src/Scene.tsx"), "utf8").catch(() => undefined);
  return text === undefined ? [] : [{ path: "src/Scene.tsx", text }];
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
export async function overlayChecks(i: Omit<Parameters<ExtraQa>[0], "layout">, deps: OverlayCheckDeps = {}): Promise<QAIssue[]> {
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

/** Интерфейс Shorts (S10 fix I1): низ текста не ниже этой доли высоты кадра 9:16. */
export const SHORTS_BOTTOM = 0.8;
/** Правая колонка кнопок Shorts: правее этой доли ширины… */
export const SHORTS_RIGHT_X = 0.87;
/** …и по высоте в этой полосе (доли высоты кадра). */
export const SHORTS_RIGHT_BAND = [0.52, 0.8] as const;
/** Текст прозрачнее — не виден (уход, появление). */
const VISIBLE_OPACITY = 0.05;

type Rect = { x: number; y: number; w: number; h: number };
const pct = (x: number) => `${Math.round(x * 100)} %`;

/**
 * Интерфейс Shorts в кадре 9:16 по реестру раскладки kit (`[motion-kit:layout]` QA-кадров):
 * текст или число ниже 80 % высоты — blocking `shorts_ui_bottom` (исправляет Engineer; не
 * исправлено — warning версии); текст или контейнер kit правее 0,87·W, задевающий полосу
 * 0,52–0,80·H (колонка кнопок), — warning `shorts_ui_right`. Координаты пробы — px кадра её
 * высоты (`frame.height`), ширина — по пропорции настроек. Не 9:16 — пусто.
 */
export function shortsUiIssues(frames: readonly LayoutFrame[], settings: Pick<Settings, "aspect_ratio" | "width" | "height">): QAIssue[] {
  if (settings.aspect_ratio !== "9:16") return [];
  const bottom = new Map<string, { text: string; frame: number; low: number }>();
  const right = new Map<string, number>();
  for (const f of frames) {
    const H = f.height > 0 ? f.height : settings.height;
    const W = (settings.width * H) / settings.height;
    const inColumn = (r: Rect) => r.x + r.w > SHORTS_RIGHT_X * W && r.y < SHORTS_RIGHT_BAND[1] * H && r.y + r.h > SHORTS_RIGHT_BAND[0] * H;
    for (const it of f.items) {
      if (it.opacity <= VISIBLE_OPACITY || it.rect.w <= 0 || it.rect.h <= 0) continue;
      const low = (it.rect.y + it.rect.h) / H;
      const prev = bottom.get(it.id);
      if (low > SHORTS_BOTTOM && (!prev || low > prev.low)) bottom.set(it.id, { text: it.text, frame: prev?.frame ?? f.frame, low });
      if (inColumn(it.rect) && !right.has(it.id)) right.set(it.id, f.frame);
    }
    for (const b of f.boxes ?? []) if (inColumn(b.rect) && !right.has(b.id)) right.set(b.id, f.frame);
  }
  const out: QAIssue[] = [];
  if (bottom.size > 0) {
    const hits = [...bottom];
    out.push({
      source: "programmatic", code: "shorts_ui_bottom", severity: "blocking", frame: Math.min(...hits.map(([, x]) => x.frame)), area: hits.map(([id]) => id).join(", "),
      description: `под интерфейсом Shorts (нижние 20 % кадра 9:16): ${hits.map(([, x]) => `«${x.text.slice(0, 40)}» до ${pct(x.low)} высоты`).join(", ")}`,
      fix_hint: `нижние 20 % кадра 9:16 закрывает интерфейс Shorts: подними текст и числа — низ контента не ниже ${pct(SHORTS_BOTTOM)} высоты кадра (layout y + h, отступы стопки); ниже — только фон`,
    });
  }
  if (right.size > 0) {
    const band = `${pct(SHORTS_RIGHT_BAND[0])}–${pct(SHORTS_RIGHT_BAND[1])}`;
    out.push({
      source: "programmatic", code: "shorts_ui_right", severity: "warning", frame: Math.min(...right.values()), area: [...right.keys()].join(", "),
      description: `правый край кадра на ${band} высоты закрывает колонка кнопок Shorts, там: ${[...right.keys()].join(", ")}`,
      fix_hint: `в полосе ${band} высоты держи текст и карточки левее ${pct(SHORTS_RIGHT_X)} ширины (по центру или левее); правее — только фон`,
    });
  }
  return out;
}
