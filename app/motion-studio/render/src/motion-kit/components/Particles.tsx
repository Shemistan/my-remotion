// Частицы: поле светящихся пылинок одного слоя глубины. Всё — от кадра и random(seed):
// позиция, размер, цвет, фаза покачивания и мерцания. Слой задаёт глубину: 0 — дальние
// (мелкие, тусклые, медленные), 2 — ближние (крупные размытые «боке», быстрые). Частицы
// проявляются вразброс в начале бита, поднимаются с покачиванием и мерцают; уходят за
// верхний край и возвращаются снизу. Для параллакса камеры оберни в <Parallax layer>.
import type { Beat } from "@ms/contracts";
import { random, useCurrentFrame, useVideoConfig } from "remotion";
import type { Rect } from "../choreo/safe-area.js";
import { EASE } from "../easing.js";
import { ramp } from "../internal.js";
import { useStyle } from "../style.js";
import { accent, alpha, isDark, mix } from "../tokens.js";

export interface ParticlesProps {
  count: number;
  seed: string;
  beat: Pick<Beat, "start_frame" | "end_frame">;
  layer: 0 | 1 | 2;
  /** Область, px родителя (по умолчанию весь кадр). */
  area?: Rect;
  /** Доля частиц цвета акцента (остальные — светлые); по умолчанию 0.35. */
  accentShare?: number;
}

/** Характер слоя: размер px, скорость подъёма px/с, размах покачивания px, размытие, яркость. */
const LAYER = [
  { size: [3, 6], speed: 10, sway: 6, blur: 0, alpha: [0.3, 0.7] },
  { size: [5, 10], speed: 22, sway: 12, blur: 0.6, alpha: [0.4, 0.85] },
  { size: [22, 48], speed: 44, sway: 22, blur: 6, alpha: [0.16, 0.36] },
] as const;

export function Particles({ count, seed, beat, layer, area, accentShare = 0.35 }: ParticlesProps) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const dark = isDark(s);
  const box = area ?? { x: 0, y: 0, w: width, h: height };
  const cfg = LAYER[layer];
  const L = Math.max(1, beat.end_frame - beat.start_frame);
  const t = frame / fps;
  const n = Math.max(0, Math.min(400, Math.floor(count)));
  const light = dark ? mix(s.palette.text, "#ffffff", 0.3) : mix(s.palette.muted, s.palette.text, 0.3);

  return (
    <div style={{ position: "absolute", left: box.x, top: box.y, width: box.w, height: box.h, overflow: "hidden", pointerEvents: "none" }}>
      {Array.from({ length: n }, (_, i) => {
        const r = (k: string) => random(`${seed}-${layer}-${i}-${k}`);
        const size = cfg.size[0] + (cfg.size[1] - cfg.size[0]) * r("s");
        // вход вразброс в первые 45 % бита
        const t0 = beat.start_frame + r("d") * L * 0.45;
        const appear = ramp(frame, t0, t0 + fps * 0.8, EASE.outQuart);
        if (appear <= 0) return null;
        const speed = cfg.speed * s.amplitude * (0.6 + 0.8 * r("v"));
        const span = box.h + size * 4;
        const y = (((r("y") * span - (t * speed)) % span) + span) % span - size * 2;
        const x = r("x") * box.w + Math.sin(t * (0.5 + r("w")) * 2 + r("p") * 6.283) * cfg.sway * s.amplitude;
        const twinkle = 0.65 + 0.35 * Math.sin(t * (1.5 + r("tw") * 2.5) * 2 + r("tp") * 6.283);
        const a = (cfg.alpha[0] + (cfg.alpha[1] - cfg.alpha[0]) * r("a")) * twinkle * appear * (dark ? 1 : 0.7);
        const c = r("c") < accentShare ? accent(s, r("ci") < 0.6 ? 0 : 1) : light;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x - size / 2,
              top: y - size / 2,
              width: size,
              height: size,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${alpha(c, 1)} 0%, ${alpha(c, 0.55)} 35%, ${alpha(c, 0)} 70%)`,
              opacity: Number(a.toFixed(4)),
              transform: `scale(${(0.4 + 0.6 * appear).toFixed(4)})`,
              filter: cfg.blur > 0 ? `blur(${cfg.blur}px)` : undefined,
            }}
          />
        );
      })}
    </div>
  );
}
