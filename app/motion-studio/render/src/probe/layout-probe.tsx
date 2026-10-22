// Проба раскладки на QA-кадрах (motion-kit 0.4.0). Код пайплайна, не сцены: entry бандла
// (node/entry.ts) оборачивает Scene этим компонентом, static check сцены сюда не относится.
// На кадрах-стоп (worker передаёт `__msLayoutProbe: true` во входных props) после загрузки
// шрифтов и установки размера композиции мерит видимый текст кадра и печатает одну строку
// `[motion-kit:layout] {frame, height, items, ghosts}` (summarizeLayout kit). В рендере
// превью флага нет — проба ничего не делает.
import type { ComponentType } from "react";
import { useLayoutEffect, useRef } from "react";
import { continueRender, delayRender, getInputProps, useCurrentFrame, useVideoConfig } from "remotion";
import { LAYOUT_TAG, type RawText, beginHoldFrame, holdMarks, summarizeLayout, textLineItems } from "../motion-kit/layout-probe.js";

/** Флаг пробы во входных props кадров-стоп. */
export const PROBE_PROP = "__msLayoutProbe";

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
    for (const t of texts) {
      const range = document.createRange();
      range.selectNodeContents(t);
      out.push(...textLineItems(base, t.data, Array.from(range.getClientRects()), origin));
    }
  }
  return out;
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
        const raw = box ? collectText(root, { x: box.left, y: box.top }) : [];
        console.log(`${LAYOUT_TAG} ${JSON.stringify({ ...summarizeLayout(frame, height, raw), holds: holdMarks(frame), ...(box ? {} : { unmeasured: true }) })}`);
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
