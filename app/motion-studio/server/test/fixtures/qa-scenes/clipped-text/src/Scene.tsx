// Дефект «текст за краем кадра»: заголовок шире кадра уходит за правый край.
// Остальное — нормальная анимация (полоса растёт, подпись проявляется, акцент-пульс).
import { presets } from "@ms/motion-kit";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

const P = presets["dark-premium"].palette;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const Scene = () => {
  const f = useCurrentFrame();
  const enter = interpolate(f, [0, 15], [0, 1], clamp);
  const bar = interpolate(f, [20, 60], [0, 1], clamp);
  const pulse = interpolate(f, [60, 67, 75], [1, 1.12, 1], clamp);
  return (
    <AbsoluteFill style={{ background: P.bg }}>
      <div
        style={{
          position: "absolute", left: 420, top: 80, whiteSpace: "nowrap",
          fontFamily: "Manrope", fontWeight: 800, fontSize: 96, color: P.text,
          opacity: enter, transform: `translateY(${(1 - enter) * 40}px)`,
        }}
      >
        Рост пользователей
      </div>
      <div
        style={{
          position: "absolute", left: 60, top: 330, width: 600 * bar, height: 64, borderRadius: 12,
          background: P.accent[0], transform: `scale(${pulse})`, transformOrigin: "left center",
        }}
      />
      <div style={{ position: "absolute", left: 60, top: 420, fontFamily: "Inter", fontSize: 30, color: P.muted, opacity: bar }}>
        10 000 → 1 000 000
      </div>
    </AbsoluteFill>
  );
};
