// Контекст стиля: <StyleProvider style="tech-neon"> над сценой, useStyle() в компонентах.
import type { StyleBible } from "@ms/contracts";
import { type ReactNode, createContext, useContext } from "react";
import { type PresetId, presets } from "./presets.js";

const StyleContext = createContext<StyleBible>(presets["dark-premium"]);

export function StyleProvider({ style, children }: { style: StyleBible | PresetId; children?: ReactNode }) {
  const value = typeof style === "string" ? presets[style] : style;
  return <StyleContext.Provider value={value}>{children}</StyleContext.Provider>;
}

/** StyleBible ближайшего StyleProvider (по умолчанию dark-premium). */
export function useStyle(): StyleBible {
  return useContext(StyleContext);
}
