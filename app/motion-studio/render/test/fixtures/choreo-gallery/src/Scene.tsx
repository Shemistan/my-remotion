// Галерея хореографии motion-kit 0.2: шесть элементов с разными входами (type, mask,
// blur, pop, draw, rise каскадом), медленный наезд камеры, параллакс двух слоёв и четыре
// карточки с глубиной стиля 0 → 3. Тайминги и стиль — из props (контракт props сцены).
import {
  Background,
  Camera,
  Card,
  Enter,
  KineticText,
  LineChart,
  Parallax,
  StyleProvider,
  accent,
  alpha,
  fontFamily,
  gridColumns,
  typeSize,
  useStyle,
  type Depth,
  type ResolveStyleInput,
} from "@ms/motion-kit";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { CAMERA, REGIONS, SAFE } from "./layout.js";

type Window = { start_frame: number; end_frame: number };

interface Props {
  timing: { duration_frames: number; beats: ({ id: string } & Window)[] };
  style: Omit<ResolveStyleInput, "fps" | "safe_area">;
  content: Record<string, unknown>;
}

const POINTS = [
  { label: "янв", value: 12_000 },
  { label: "мар", value: 18_500 },
  { label: "май", value: 24_000 },
  { label: "июл", value: 31_000 },
  { label: "сен", value: 45_500 },
  { label: "ноя", value: 62_000 },
];

const abs = (r: { x: number; y: number; w: number; h: number }) =>
  ({ position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h }) as const;

function Gallery({ beats }: { beats: Record<string, Window> }) {
  const s = useStyle();
  const { height } = useVideoConfig();
  const cols = gridColumns(s, REGIONS.cards, 4);
  const h1 = typeSize(s, "h1", height);
  const body = typeSize(s, "body", height);
  const h2 = typeSize(s, "h2", height);

  return (
    <AbsoluteFill>
      <Camera keys={CAMERA}>
        {/* дальний план: фон как камера */}
        <Parallax layer={0}>
          <Background beat={{ start_frame: 0, end_frame: 40 }} seed="choreo" />
        </Parallax>

        {/* средний план: текст и график */}
        <Parallax layer={1}>
          <div style={abs(REGIONS.kicker)}>
            <KineticText text="Хореография · kit 0.2" beat={beats.kicker!} mode="letters" enter="type" size="caption" font="mono" caps color={s.palette.muted} />
          </div>

          <Enter kind="mask" beat={beats.headline!} style={abs(REGIONS.headline)}>
            <div style={{ fontFamily: fontFamily(s.typography.display), fontWeight: s.typography.display.weight, fontSize: h1, lineHeight: 1.04, letterSpacing: "-0.035em", color: s.palette.text }}>
              Движение
              <br />
              <span style={{ color: accent(s, 0) }}>с характером</span>
            </div>
          </Enter>

          <Enter kind="blur" beat={beats.subtitle!} style={abs(REGIONS.subtitle)}>
            <div style={{ fontFamily: fontFamily(s.typography.body), fontWeight: 500, fontSize: body, lineHeight: 1.3, color: s.palette.muted }}>
              Шесть разных входов, камера и глубина из одного StyleBible
            </div>
          </Enter>

          <Enter kind="pop" beat={beats.badge!} style={{ ...abs(REGIONS.badge), display: "flex", alignItems: "center", gap: 24, transformOrigin: "15% 50%" }}>
            <div
              style={{
                padding: "10px 30px",
                borderRadius: 999,
                background: alpha(accent(s, 1), 0.16),
                boxShadow: `inset 0 0 0 2px ${alpha(accent(s, 1), 0.6)}, 0 0 40px -8px ${alpha(accent(s, 1), 0.6)}`,
                fontFamily: fontFamily(s.typography.display),
                fontWeight: 800,
                fontSize: h2,
                color: accent(s, 1),
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
              }}
            >
              +38 %
            </div>
            <div style={{ fontFamily: fontFamily(s.typography.body), fontSize: typeSize(s, "caption", height), color: s.palette.text }}>за полгода</div>
          </Enter>

          <div style={abs(REGIONS.chart)}>
            <LineChart points={POINTS} beat={beats.chart!} width={REGIONS.chart.w} height={REGIONS.chart.h} locale="ru" accentIndex={0} />
          </div>
        </Parallax>

        {/* ближний план: карточки, глубина стиля растёт слева направо */}
        <Parallax layer={2}>
          {cols.map((c, i) => (
            <StyleProvider key={i} style={{ ...s, depth: i as Depth }}>
              <Enter
                kind="rise"
                beat={beats.cards!}
                index={i}
                total={cols.length}
                style={{ position: "absolute", left: c.x, top: REGIONS.cards.y, width: c.w, height: REGIONS.cards.h }}
              >
                <Card elevation={1} width="100%" height="100%" accentIndex={i === 3 ? 0 : undefined}>
                  <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%" }}>
                    <div style={{ fontFamily: fontFamily(s.typography.mono), fontSize: 22, color: s.palette.muted }}>depth {i}</div>
                    <div style={{ fontFamily: fontFamily(s.typography.body), fontWeight: 600, fontSize: 34, color: s.palette.text }}>Глубина {i}</div>
                  </div>
                </Card>
              </Enter>
            </StyleProvider>
          ))}
        </Parallax>
      </Camera>
    </AbsoluteFill>
  );
}

export const Scene = ({ timing, style }: Props) => {
  const beats = Object.fromEntries(timing.beats.map((b) => [b.id, b]));
  return (
    <StyleProvider style={{ ...style, safe_area: SAFE }}>
      <Gallery beats={beats} />
    </StyleProvider>
  );
};
