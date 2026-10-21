// Дефект «одинаковые входы»: все четыре карточки входят одним fade (ТЗ §8.2).
import { presets } from "@ms/motion-kit";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

const P = presets["dark-premium"].palette;
const S = presets["dark-premium"].surfaces;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const CARDS = [
  { label: "Поиск", x: 80, y: 90, start: 0 },
  { label: "База знаний", x: 500, y: 90, start: 10 },
  { label: "Код", x: 80, y: 290, start: 20 },
  { label: "Ответ", x: 500, y: 290, start: 30 },
];

export const Scene = () => {
  const f = useCurrentFrame();
  const pulse = interpolate(f, [50, 60, 75], [1, 1.06, 1], clamp);
  return (
    <AbsoluteFill style={{ background: P.bg }}>
      {CARDS.map((c, i) => (
        <div
          key={c.label}
          style={{
            position: "absolute", left: c.x, top: c.y, width: 380, height: 160, borderRadius: S.radius[2],
            background: P.surface, boxShadow: S.elevation[2], display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "Inter", fontWeight: 600, fontSize: 40, color: P.text,
            opacity: interpolate(f, [c.start, c.start + 15], [0, 1], clamp),
            transform: `scale(${i === 0 ? pulse : 1})`,
          }}
        >
          {c.label}
        </div>
      ))}
    </AbsoluteFill>
  );
};
