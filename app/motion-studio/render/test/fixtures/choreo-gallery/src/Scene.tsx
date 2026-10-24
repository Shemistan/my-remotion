// Галерея хореографии motion-kit 0.2: шесть элементов с разными входами (type, mask,
// blur, pop, draw, rise каскадом), медленный наезд камеры, параллакс двух слоёв и четыре
// карточки с глубиной стиля 0 → 3. Тайминги и стиль — из props (контракт props сцены).
// Для e2e-анализа: `content.camera = false` — без камеры, зерна и дрейфа фона;
// `content.uniform = "fade"` — негативный контроль: все элементы входят одним fade.
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
import { CAMERA, REGIONS } from "./layout.js";

type Window = { start_frame: number; end_frame: number };

interface Props {
  timing: { duration_frames: number; beats: ({ id: string } & Window)[] };
  style: Omit<ResolveStyleInput, "fps">;
  content: { camera?: boolean; uniform?: "fade" | null };
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

function Gallery({ beats, camera, uniform }: { beats: Record<string, Window>; camera: boolean; uniform: boolean }) {
  const s = useStyle();
  const { height } = useVideoConfig();
  const cols = gridColumns(s, REGIONS.cards, 4);
  const h1 = typeSize(s, "h1", height);
  const body = typeSize(s, "body", height);
  const h2 = typeSize(s, "h2", height);

  // в негативном контроле каждый элемент входит одним fade, свои входы компонентов выключены
  const kind = <K extends string>(k: K) => (uniform ? "fade" : k);
  const title = (
    <div style={{ fontFamily: fontFamily(s.typography.display), fontWeight: s.typography.display.weight, fontSize: h1, lineHeight: 1.04, letterSpacing: "-0.035em", color: s.palette.text }}>
      Движение
      <br />
      <span style={{ color: accent(s, 0) }}>с характером</span>
    </div>
  );

  return (
    <AbsoluteFill>
      <Camera keys={camera ? CAMERA : []}>
        {/* дальний план: фон как камера; в анализе — неподвижный (без пятен и зерна) */}
        <Parallax layer={0}>
          {camera ? <Background beat={{ start_frame: 0, end_frame: 40 }} seed="choreo" /> : <Background variant="solid" grain={false} />}
        </Parallax>

        {/* средний план: текст и график */}
        <Parallax layer={1}>
          <Enter kind={kind("none")} beat={beats.kicker!} style={abs(REGIONS.kicker)}>
            {uniform ? (
              <div style={{ fontFamily: fontFamily(s.typography.mono), fontSize: typeSize(s, "caption", height), letterSpacing: "0.14em", textTransform: "uppercase", color: s.palette.muted }}>
                Хореография · kit 0.2
              </div>
            ) : (
              <KineticText text="Хореография · kit 0.2" beat={beats.kicker!} mode="letters" enter="type" size="caption" font="mono" caps color={s.palette.muted} />
            )}
          </Enter>

          <Enter kind={kind("mask")} pre="silhouette" beat={beats.headline!} style={abs(REGIONS.headline)}>
            {title}
          </Enter>

          <Enter kind={kind("blur")} beat={beats.subtitle!} style={abs(REGIONS.subtitle)}>
            <div style={{ fontFamily: fontFamily(s.typography.body), fontWeight: 500, fontSize: body, lineHeight: 1.3, color: s.palette.muted }}>
              Шесть входов, камера и глубина из одного StyleBible
            </div>
          </Enter>

          <Enter kind={kind("pop")} pre="silhouette" beat={beats.badge!} style={{ ...abs(REGIONS.badge), display: "flex", alignItems: "center", gap: 24, transformOrigin: "15% 50%" }}>
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

          <Enter kind={kind("none")} beat={beats.chart!} style={abs(REGIONS.chart)}>
            <LineChart
              points={POINTS}
              beat={uniform ? { start_frame: 0, end_frame: 0 } : beats.chart!}
              highlightLast={!uniform}
              width={REGIONS.chart.w}
              height={REGIONS.chart.h}
              locale="ru"
              accentIndex={0}
            />
          </Enter>
        </Parallax>

        {/* ближний план: карточки, глубина стиля растёт слева направо */}
        <Parallax layer={2}>
          {cols.map((c, i) => (
            <StyleProvider key={i} style={{ ...s, depth: i as Depth }}>
              <Enter
                kind={kind("rise")}
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

export const Scene = ({ timing, style, content }: Props) => {
  const beats = Object.fromEntries(timing.beats.map((b) => [b.id, b]));
  return (
    <StyleProvider style={style}>
      <Gallery beats={beats} camera={content.camera !== false} uniform={content.uniform === "fade"} />
    </StyleProvider>
  );
};
