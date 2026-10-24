// Галерея паттернов: код набирается по токенам слева, ключевые строки подсвечиваются,
// выноска выводит главную мысль крупно в правую колонку кадра.
// Варианты (props.content): `sample` — ts (8 строк, по умолчанию) | py-doc (docstring) |
// ts-jsdoc (JSDoc) — многострочные токены; `callout` — box (рамка на строку) | ring.
import {
  Enter, Background, Callout, CodeBlock, KineticText, SafeArea, StyleProvider, codeLineRect, typeSize, useSafeArea, useStyle, type ResolveStyleInput } from "@ms/motion-kit";
import { useVideoConfig } from "remotion";
import { CODE_POS, CODE_W, FONT } from "./layout.js";

type Window = { start_frame: number; end_frame: number };
type SampleId = "ts" | "py-doc" | "ts-jsdoc";
interface Props {
  timing: { duration_frames: number; beats: ({ id: string } & Window)[] };
  style: Omit<ResolveStyleInput, "fps">;
  content?: { sample?: SampleId; callout?: "box" | "ring" };
}

interface Sample {
  code: string;
  lang: "ts" | "py";
  title: string;
  highlight: number[];
  /** Цель выноски: строка, знаки [from, to) для кольца; выход линии. */
  target: { line: number; cols: [number, number]; exit: "diagonal" | "horizontal" };
}

const SAMPLES: Record<SampleId, Sample> = {
  ts: {
    code: `export async function render(scene: Scene) {
  const spec = await plan(scene.prompt);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await renderVersion(spec, attempt);
    if (result.ok) return result; // готово
  }
  throw new Error("render failed");
}`,
    lang: "ts",
    title: "pipeline.ts",
    highlight: [3, 4],
    target: { line: 3, cols: [35, 36], exit: "diagonal" },
  },
  "py-doc": {
    code: `def render(scene, attempts=3):
    """Рендер сцены с повтором.

    До трёх попыток, затем ошибка.
    """
    for attempt in range(1, attempts + 1):
        result = render_version(scene, attempt)
        if result.ok:
            return result
    raise RenderError("render failed")`,
    lang: "py",
    title: "pipeline.py",
    highlight: [6, 7],
    // «3» в конце короткой строки: справа пусто — линия выходит прямо вбок
    target: { line: 1, cols: [27, 28], exit: "horizontal" },
  },
  "ts-jsdoc": {
    code: `/**
 * Рендер сцены с повтором:
 * до трёх попыток, затем ошибка.
 */
export async function render(scene: Scene) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await renderVersion(scene, attempt);
    if (result.ok) return result;
  }
  throw new Error("render failed");
}`,
    lang: "ts",
    title: "pipeline.ts",
    highlight: [6, 7],
    target: { line: 6, cols: [35, 36], exit: "diagonal" },
  },
};

const COLUMN_X = CODE_W + 70;

function Content({ b, sample, callout }: { b: Record<string, Window>; sample: Sample; callout: "box" | "ring" }) {
  const s = useStyle();
  const { height } = useVideoConfig();
  const safe = useSafeArea();
  const { line, cols, exit } = sample.target;
  const text = sample.code.split("\n")[line - 1]!;
  const ring = callout === "ring";
  // кольцо — на знаках cols, рамка — на всей строке без отступа
  const r = codeLineRect(line, { width: CODE_W, fontSize: FONT, cols: ring ? cols : [text.search(/\S/), text.trimEnd().length] });
  const target = { x: CODE_POS.x + r.x - 6, y: CODE_POS.y + r.y + (ring ? 4 : 0), w: r.w + 12, h: r.h - (ring ? 8 : 0) };
  // подпись — в правой колонке: длина горизонтали доводит её до COLUMN_X
  const rx = target.w / 2 + Math.max(10, Math.min(target.w, target.h) * 0.12);
  const startX = target.x + target.w / 2 + (ring && exit === "diagonal" ? rx * Math.SQRT1_2 : rx);
  const rise = exit === "horizontal" ? 0 : ring ? 56 : 40;
  const reach = Math.max(30, COLUMN_X - startX - rise - 10);
  return (
    <>
      <KineticText text="Код сцены" beat={b.kicker!} mode="letters" enter="type" size="caption" font="mono" caps />
      <div style={{ height: 22 }} />
      <Enter kind="none" pre="silhouette" beat={b.headline!}><KineticText text="Рендер с повтором" beat={b.headline!} mode="words" enter="scale" size="h1" highlight={["повтором"]} /></Enter>
      <div style={{ position: "absolute", left: CODE_POS.x, top: CODE_POS.y }}>
        <CodeBlock code={sample.code} lang={sample.lang} beat={b.code!} highlightLines={sample.highlight} title={sample.title} width={CODE_W} fontSize={FONT} />
      </div>
      <Callout
        target={target}
        label="До трёх попыток"
        note="затем — понятная ошибка"
        size={Math.round(typeSize(s, "h2", height) * 0.85)}
        beat={b.callout!}
        side="right"
        shape={callout}
        exit={exit}
        reach={reach}
        bounds={{ x: 0, y: 0, w: safe.w, h: safe.h }}
      />
    </>
  );
}

export const Scene = ({ timing, style, content }: Props) => {
  const b = Object.fromEntries(timing.beats.map((x) => [x.id, x])) as Record<string, Window>;
  const sample = SAMPLES[content?.sample ?? "ts"];
  return (
    <StyleProvider style={style}>
      <Background beat={{ start_frame: 0, end_frame: 40 }} seed="code" />
      <SafeArea>
        <Content b={b} sample={sample} callout={content?.callout ?? "box"} />
      </SafeArea>
    </StyleProvider>
  );
};
