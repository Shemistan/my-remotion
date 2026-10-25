// Зоны поверх плеера (Task 33): рамки лица и рук и свободные зоны с процентом (вкладка «Анализ»)
// либо зона сцены плана (вкладка «План»). Прямоугольники — в долях кадра; рисуются внутри видимой
// области видео (`object-fit: contain`: полосы учитываются), размер контейнера — ResizeObserver.
// Для шота берётся окно занятости под курсором (руки и свободные зоны окна), иначе худший случай шота.
import type { FootageAnalysis, FootageShot, NormRect, Zone } from "@ms/contracts";
import { useEffect, useRef, useState } from "react";
import { t } from "../../i18n/index.js";
import { type Box, containBox, rectToCss } from "../../video/zone-geometry.js";

export interface SafeZoneOverlayProps {
  /** Соотношение сторон кадра (ширина / высота). */
  aspect: number;
  shot?: FootageShot | undefined;
  mode?: FootageAnalysis["mode"] | undefined;
  /** Время плеера (source, µs): окно занятости шота. */
  atUs?: number;
  /** Зона сцены плана: свободные зоны тогда не рисуются. */
  plan?: { rect: NormRect; label: string; bad: boolean } | undefined;
  /** Размер контейнера (тесты); иначе — измеряется. */
  size?: { width: number; height: number };
}

/**
 * Угол подписи свободной зоны: левая и нижняя трети пересекаются в левом нижнем углу, правая и нижняя —
 * в правом нижнем, полоса сверху — с третями сверху; углы выбраны так, чтобы подписи не наезжали.
 */
export const ZONE_LABEL_CORNER: Partial<Record<Zone, "tl" | "tr" | "bl" | "br">> = {
  left_third: "tl", right_third: "tr", top_band: "bl", lower_third: "br",
};

const style = (b: Box) => ({ left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });

export function SafeZoneOverlay({ aspect, shot, mode, atUs, plan, size }: SafeZoneOverlayProps) {
  const root = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  useEffect(() => {
    const el = root.current;
    if (size || !el) return;
    const read = () => setMeasured({ width: el.clientWidth, height: el.clientHeight });
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size]);
  const box = containBox(size ?? measured, aspect);
  const win = shot && atUs !== undefined ? shot.windows.find((w) => w.start_us <= atUs && atUs < w.end_us) : undefined;
  const hands = win ? win.hands : shot?.hands.union;
  const free = plan ? [] : (win ? win.free_zones : shot?.free_zones ?? []);
  const face = shot?.face.union;
  return (
    <div className="zone-overlay" ref={root} aria-label={t("analysis.overlay")}>
      {box.width > 0 ? (
        <>
          {free.map((z) => (
            <div key={z.zone} className={`zone-rect free ${z.free_ratio >= 0.85 ? "ok" : "busy"}`} data-testid={`zone-free-${z.zone}`} style={style(rectToCss(z.rect, box))}>
              <span className={`zone-label at-${ZONE_LABEL_CORNER[z.zone] ?? "bl"}`}>{t("analysis.zone.free", { zone: t(`zone.${z.zone}`), pct: Math.round(z.free_ratio * 100) })}</span>
            </div>
          ))}
          {face ? (
            <div className="zone-rect face" data-testid="zone-face" style={style(rectToCss(face, box))}>
              <span className="zone-label">{t("analysis.zone.face")}</span>
            </div>
          ) : null}
          {hands ? (
            <div className="zone-rect hands" data-testid="zone-hands" style={style(rectToCss(hands, box))}>
              <span className="zone-label">{t("analysis.zone.hands")}</span>
            </div>
          ) : null}
          {plan ? (
            <div className={`zone-rect plan ${plan.bad ? "bad" : ""}`} data-testid="zone-plan" style={style(rectToCss(plan.rect, box))}>
              <span className="zone-label">{plan.label}</span>
            </div>
          ) : null}
        </>
      ) : null}
      {mode === "llm_only" ? <p className="zone-warning">{t("analysis.llmOnly")}</p> : null}
    </div>
  );
}
