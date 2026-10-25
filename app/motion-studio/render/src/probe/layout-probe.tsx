// Проба раскладки на QA-кадрах (motion-kit 0.4.0). Код пайплайна, не сцены: entry бандла
// (node/entry.ts) оборачивает Scene этим компонентом, static check сцены сюда не относится.
// На кадрах-стоп (worker передаёт `__msLayoutProbe: true` во входных props) после загрузки
// шрифтов и установки размера композиции мерит видимый текст кадра и печатает одну строку
// `[motion-kit:layout] {frame, height, items, ghosts}` (summarizeLayout kit). В рендере
// превью флага нет — проба ничего не делает.
import type { ComponentType } from "react";
import { useLayoutEffect, useRef } from "react";
import { continueRender, delayRender, getInputProps, useCurrentFrame, useVideoConfig } from "remotion";
import { type Box, CLIP_VISIBLE_MIN, LAYOUT_TAG, type LineRect, type RawAccent, type RawBox, type RawText, VISIBLE_OPACITY, areaShares, beginHoldFrame, clipLine, holdMarks, insetClipRect, summarizeAccents, summarizeBoxes, summarizeLayout, textLineItems } from "../motion-kit/layout-probe.js";

/** Флаг пробы во входных props кадров-стоп. */
export const PROBE_PROP = "__msLayoutProbe";

const boxOf = (r: DOMRect): Box => ({ x: r.left, y: r.top, w: r.width, h: r.height });

/**
 * Клипы предков элемента до `root` (0.5.6), в координатах окна: overflow hidden/clip — рамка
 * предка, `clip-path: inset()` — её внутренний прямоугольник. Копия компонента под clipPath
 * (лента шагов в двух слоях) не видна за клипом — её текст не «призрак».
 */
function ancestorClips(el: Element, root: Element): Box[] {
  const out: Box[] = [];
  for (let p: Element | null = el; p && p !== root.parentElement; p = p.parentElement) {
    const cs = getComputedStyle(p);
    const over = [cs.overflowX, cs.overflowY].some((v) => v === "hidden" || v === "clip");
    const inset = cs.clipPath && cs.clipPath !== "none" ? cs.clipPath : "";
    if (!over && !inset.startsWith("inset(")) continue;
    const r = p.getBoundingClientRect();
    if (over) out.push(boxOf(r));
    if (inset.startsWith("inset(")) {
      const scale = p instanceof HTMLElement && p.offsetWidth > 0 ? r.width / p.offsetWidth : 1;
      const c = insetClipRect(inset, boxOf(r), scale);
      if (c) out.push(c);
    }
  }
  return out;
}

/** Строки текста под клипами: видимая часть, если её не меньше CLIP_VISIBLE_MIN. */
function visibleLines(rects: Iterable<DOMRect>, clips: readonly Box[]): LineRect[] {
  const out: LineRect[] = [];
  for (const r of rects) {
    if (clips.length === 0) {
      out.push(r);
      continue;
    }
    const c = clipLine(boxOf(r), clips);
    if (c.share >= CLIP_VISIBLE_MIN) out.push({ left: c.rect.x, top: c.rect.y, width: c.rect.w, height: c.rect.h });
  }
  return out;
}

/** Видимый текст под `root` в координатах кадра (от `origin` — левого верхнего угла композиции). */
export function collectText(root: Element, origin: { x: number; y: number }): RawText[] {
  const byEl = new Map<Element, Text[]>();
  const walk = (el: Element) => {
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === Node.TEXT_NODE) {
        if (!(n as Text).data.trim()) continue;
        const list = byEl.get(el) ?? [];
        list.push(n as Text);
        byEl.set(el, list);
      } else if (n.nodeType === Node.ELEMENT_NODE) walk(n as Element);
    }
  };
  walk(root);
  const owners = new Map<Element, number>();
  const keys = new Map<Element, string>();
  const out: RawText[] = [];
  for (const [el, texts] of byEl) {
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    // декоративные копии текста kit (блик Highlight, слой-постер Enter) помечены aria-hidden;
    // прозрачный цвет — текст-маска фона, не читаемый текст
    if (el.closest('[aria-hidden="true"]') || cs.color === "rgba(0, 0, 0, 0)" || cs.color === "transparent") continue;
    let opacity = 1;
    for (let p: Element | null = el; p && opacity > 0; p = p.parentElement) opacity *= Number(getComputedStyle(p).opacity || 1);
    if (opacity < 0.01) continue;
    // масштаб камеры / viewBox: экранный размер к собственному
    let scale = 1;
    if (el instanceof SVGGraphicsElement) scale = Math.abs(el.getScreenCTM()?.a ?? 1);
    else if (el instanceof HTMLElement && el.offsetWidth > 0) scale = el.getBoundingClientRect().width / el.offsetWidth;
    const owner = el.closest("[data-ms-layout]");
    if (owner && !owners.has(owner)) owners.set(owner, owners.size);
    // каждый текстовый узел — свои прямоугольники по строкам: объединение узлов элемента
    // накрыло бы вложенный в строку элемент (Highlight посреди фразы), а общий прямоугольник
    // перенесённого узла — соседа по строке (S2-fix2 N3); строки элемента — один ключ `el`
    if (!keys.has(el)) keys.set(el, `e${keys.size}`);
    const base = {
      owner: owner ? `${owner.getAttribute("data-ms-layout")}:${owner.getAttribute("data-ms-id") ?? ""}:${owners.get(owner)}` : null,
      role: owner?.getAttribute("data-ms-layout") ?? "scene",
      el: keys.get(el)!,
      fontPx: parseFloat(cs.fontSize) * scale,
      opacity,
    };
    const clips = ancestorClips(el, root);
    for (const t of texts) {
      const range = document.createRange();
      range.selectNodeContents(t);
      out.push(...textLineItems(base, t.data, visibleLines(Array.from(range.getClientRects()), clips), origin));
    }
  }
  return out;
}

/** Итоговая прозрачность элемента: произведение opacity по предкам. */
function opacityOf(el: Element): number {
  let o = 1;
  for (let p: Element | null = el; p && o > 0; p = p.parentElement) o *= Number(getComputedStyle(p).opacity || 1);
  return o;
}

const shift = (r: DOMRect, origin: { x: number; y: number }): Box => ({ x: r.left - origin.x, y: r.top - origin.y, w: r.width, h: r.height });

/** Прямоугольник содержимого svg (объединение фигур, без невидимых) — не его холст. */
function svgContentRect(svg: SVGSVGElement): DOMRect | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const sh of Array.from(svg.querySelectorAll("path, line, rect, circle, ellipse, polyline, polygon"))) {
    const r = sh.getBoundingClientRect();
    if (r.width <= 0 && r.height <= 0) continue;
    const cs = getComputedStyle(sh);
    if (cs.visibility === "hidden" || cs.display === "none" || opacityOf(sh) < 0.05) continue;
    x0 = Math.min(x0, r.left);
    y0 = Math.min(y0, r.top);
    x1 = Math.max(x1, r.right);
    y1 = Math.max(y1, r.bottom);
  }
  return Number.isFinite(x0) ? new DOMRect(x0, y0, x1 - x0, y1 - y0) : null;
}

/** Графика сцены (0.5.5): верхние svg (по содержимому), img и canvas — без фона `<Background>` и декора aria-hidden. */
export function collectGraphics(root: Element, origin: { x: number; y: number }): Box[] {
  const out: Box[] = [];
  for (const el of Array.from(root.querySelectorAll("svg, img, canvas"))) {
    if (el.closest("[data-ms-bg]") || el.closest('[aria-hidden="true"]') || (el.parentElement?.closest("svg") ?? null) !== null) continue;
    if (opacityOf(el) < VISIBLE_OPACITY) continue;
    const r = el instanceof SVGSVGElement ? svgContentRect(el) : el.getBoundingClientRect();
    if (r && r.width > 0 && r.height > 0) out.push(shift(r, origin));
  }
  return out;
}

/** Контейнеры kit (`data-ms-box`, 0.5.5): прямоугольник, прозрачность, есть ли внутри графика. */
export function collectBoxes(root: Element, origin: { x: number; y: number }): RawBox[] {
  return Array.from(root.querySelectorAll("[data-ms-box]")).map((el, i) => {
    const r = el.getBoundingClientRect();
    const a = Math.max(1, r.width * r.height);
    // панель с графикой kit (метр ComparisonSplit, 0.5.6) помечена data-ms-graphic
    const graphic = el.hasAttribute("data-ms-graphic") || Array.from(el.querySelectorAll("svg, img, canvas")).some((g) => {
      const gr = g instanceof SVGSVGElement ? svgContentRect(g) : g.getBoundingClientRect();
      return gr !== null && gr.width * gr.height >= 0.06 * a && opacityOf(g) >= VISIBLE_OPACITY;
    });
    return { id: `${el.getAttribute("data-ms-box")}:${el.getAttribute("data-ms-id") ?? ""}:${i}`, kind: el.getAttribute("data-ms-box") ?? "box", rect: shift(r, origin), opacity: opacityOf(el), graphic };
  });
}

/** Акценты kit (`data-ms-accent`, 0.5.6): сила, вложенность в другой акцент, прозрачность. */
export function collectAccents(root: Element): RawAccent[] {
  return Array.from(root.querySelectorAll("[data-ms-accent]")).map((el, i) => ({
    id: `${el.tagName.toLowerCase()}:${el.getAttribute("data-ms-id") ?? ""}:${i}`,
    level: Number(el.getAttribute("data-ms-accent")) || 0,
    nested: (el.parentElement?.closest("[data-ms-accent]") ?? null) !== null,
    opacity: opacityOf(el),
  }));
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/**
 * Корень сцены, когда он на месте: Remotion монтирует сцену в портал вне экрана (0 × 0,
 * top −999999) и переносит его в контейнер композиции эффектом после первого коммита —
 * до переноса раскладка не итоговая. null — ещё не перенесён.
 */
function placedRoot(el: Element, w: number, h: number): DOMRect | null {
  const root = el.parentElement;
  if (!root) return null;
  const r = root.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.top > -h && Math.abs(r.width / r.height - w / h) < 0.02 ? r : null;
}

function Probe() {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || (getInputProps() as Record<string, unknown>)[PROBE_PROP] !== true) return;
    const handle = delayRender("layout probe");
    void (async () => {
      try {
        await document.fonts.ready;
        // ждём, пока портал сцены перенесён в контейнер композиции (эффект Remotion)
        let box = placedRoot(el, width, height);
        for (let i = 0; i < 120 && !box; i++) {
          await nextFrame();
          box = placedRoot(el, width, height);
        }
        const root = el.parentElement ?? document.body;
        const origin = box ? { x: box.left, y: box.top } : { x: 0, y: 0 };
        const raw = box ? collectText(root, origin) : [];
        const sum = summarizeLayout(frame, height, raw);
        // контейнеры и доли площади (0.5.5, S14): пустые карточки и «текст вместо графики» — по данным
        const size = box ? { w: box.width, h: box.height } : { w: width, h: height };
        const boxes = box ? summarizeBoxes(collectBoxes(root, origin), sum.items, size) : [];
        const areas = areaShares(sum.items, boxes, box ? collectGraphics(root, origin) : [], size);
        const accents = box ? summarizeAccents(collectAccents(root)) : [];
        console.log(`${LAYOUT_TAG} ${JSON.stringify({ ...sum, holds: holdMarks(frame), boxes, areas, accents, ...(box ? {} : { unmeasured: true }) })}`);
      } finally {
        continueRender(handle);
      }
    })();
  }, [frame, width, height]);
  return <span ref={ref} style={{ display: "none" }} />;
}

/** Сцена с пробой раскладки рядом (тот же корень — композиция). */
export function withLayoutProbe<P extends object>(Scene: ComponentType<P>): ComponentType<P> {
  const Wrapped = (props: P) => {
    // метки hold engine — по кадру рендера: объявлен до сцены, проба читает метки своего
    // кадра (S3-fix2: memo-поддерево без перерисовки не стирает метки кадра)
    beginHoldFrame(useCurrentFrame());
    return (
      <>
        <Scene {...props} />
        <Probe />
      </>
    );
  };
  return Wrapped;
}
