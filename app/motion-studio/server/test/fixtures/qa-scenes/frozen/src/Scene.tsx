// Дефект «застывшая анимация»: кадр не зависит от времени — все QA-кадры одинаковы.
import { presets } from "@ms/motion-kit";
import { AbsoluteFill } from "remotion";

const P = presets["dark-premium"].palette;

export const Scene = () => (
  <AbsoluteFill style={{ background: P.bg }}>
    <div style={{ position: "absolute", left: 80, top: 80, fontFamily: "Manrope", fontWeight: 800, fontSize: 64, color: P.text }}>Конверсия</div>
    <div style={{ position: "absolute", left: 80, top: 200, width: 520, height: 56, borderRadius: 12, background: P.accent[1] }} />
    <div style={{ position: "absolute", left: 80, top: 290, fontFamily: "Inter", fontSize: 30, color: P.muted }}>12 % → 18 %</div>
  </AbsoluteFill>
);
