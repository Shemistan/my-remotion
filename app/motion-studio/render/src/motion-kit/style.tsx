// Контекст стиля: <StyleProvider style=…> над сценой, useStyle() в компонентах.
// Провайдер всегда отдаёт разрешённый стиль (resolveStyle) под fps композиции.
import type { StyleBible } from "@ms/contracts";
import { type ReactNode, createContext, useContext, useMemo } from "react";
import { useVideoConfig } from "remotion";
import { type PresetId, presets } from "./presets.js";
import { haloLayerStyle } from "./style/halo.js";
import { type ResolveStyleInput, type ResolvedStyle, isResolved, resolveStyle } from "./style/resolve.js";

/** Что принимает StyleProvider: id пресета, StyleBible, `props.style` сцены или готовый стиль. */
export type StyleSource = PresetId | StyleBible | ResolvedStyle | Omit<ResolveStyleInput, "fps">;

const StyleContext = createContext<ResolvedStyle>(resolveStyle({ preset: "dark-premium", intensity: "balanced" }));

/** Разрешение источника стиля под fps (resolved — как есть). */
export function toResolved(style: StyleSource, fps: number): ResolvedStyle {
  const f = { num: fps, den: 1 };
  if (typeof style === "string") {
    const bible = Object.prototype.hasOwnProperty.call(presets, style) ? presets[style] : undefined;
    if (!bible) throw new RangeError(`неизвестный пресет стиля: ${style} (есть: ${Object.keys(presets).join(", ")})`);
    return resolveStyle({ preset: bible, intensity: bible.motion.intensity, fps: f });
  }
  if ("preset" in style) return resolveStyle({ ...style, fps: f });
  if (isResolved(style)) return style;
  return resolveStyle({ preset: style, intensity: style.motion.intensity, fps: f });
}

export function StyleProvider({ style, children }: { style: StyleSource; children?: ReactNode }) {
  const { fps } = useVideoConfig();
  const value = useMemo(() => toResolved(style, fps), [style, fps]);
  // transparent (S6, Р18): ореол текста цвета palette.bg наследуется всем текстом сцены
  const halo = haloLayerStyle(value);
  return <StyleContext.Provider value={value}>{halo ? <div data-ms-halo="" style={halo}>{children}</div> : children}</StyleContext.Provider>;
}

/** Разрешённый стиль ближайшего StyleProvider (по умолчанию dark-premium, balanced, 30 fps). */
export function useStyle(): ResolvedStyle {
  return useContext(StyleContext);
}
