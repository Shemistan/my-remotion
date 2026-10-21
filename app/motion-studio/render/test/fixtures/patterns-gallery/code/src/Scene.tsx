// Галерея паттернов: код — 8 строк TypeScript набираются по токенам, строки цикла
// подсвечиваются, выноска указывает на повтор.
import { Background, Callout, CodeBlock, KineticText, SafeArea, StyleProvider, codeLineRect, useSafeArea, type ResolveStyleInput } from "@ms/motion-kit";

type Window = { start_frame: number; end_frame: number };
interface Props {
  timing: { duration_frames: number; beats: ({ id: string } & Window)[] };
  style: Omit<ResolveStyleInput, "fps">;
  /** Вариант для e2e: выноска рамкой на всю строку (по умолчанию) или кольцом на «3». */
  content?: { callout?: "ring" | "box" };
}

const CODE = `export async function render(scene: Scene) {
  const spec = await plan(scene.prompt);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await renderVersion(spec, attempt);
    if (result.ok) return result; // готово
  }
  throw new Error("render failed");
}`;

const CODE_W = 1120;
const FONT = 30;
/** Блок кода в safe area: слева, под заголовком. */
const CODE_POS = { x: 0, y: 190 };

function Content({ b, callout }: { b: Record<string, Window>; callout: "ring" | "box" }) {
  const safe = useSafeArea();
  const line = codeLineRect(3, { width: CODE_W, fontSize: FONT });
  // цель выноски, px safe area: кольцо — на «3» в условии цикла, рамка — вся строка
  // (моноширинный 30 px — 18 px на знак)
  const ch = FONT * 0.6;
  const col = CODE.split("\n")[2]!.indexOf("<= 3") + 3;
  const target =
    callout === "ring"
      ? { x: CODE_POS.x + line.x + col * ch - 6, y: CODE_POS.y + line.y + 4, w: ch + 12, h: line.h - 8 }
      : { x: CODE_POS.x + line.x - 6, y: CODE_POS.y + line.y, w: 51 * ch + 12, h: line.h };
  return (
    <>
      <KineticText text="Код сцены" beat={b.kicker!} mode="letters" enter="type" size="caption" font="mono" caps />
      <div style={{ height: 22 }} />
      <KineticText text="Рендер с повтором" beat={b.headline!} mode="words" enter="scale" size="h1" highlight={["повтором"]} />
      <div style={{ position: "absolute", left: CODE_POS.x, top: CODE_POS.y }}>
        <CodeBlock code={CODE} lang="ts" beat={b.code!} highlightLines={[3, 4]} title="pipeline.ts" width={CODE_W} fontSize={FONT} />
      </div>
      <Callout target={target} label="До трёх попыток" beat={b.callout!} side="right" shape={callout} reach={callout === "ring" ? 380 : 150} bounds={{ x: 0, y: 0, w: safe.w, h: safe.h }} />
    </>
  );
}

export const Scene = ({ timing, style, content }: Props) => {
  const b = Object.fromEntries(timing.beats.map((x) => [x.id, x])) as Record<string, Window>;
  return (
    <StyleProvider style={style}>
      <Background beat={{ start_frame: 0, end_frame: 40 }} seed="code" />
      <SafeArea>
        <Content b={b} callout={content?.callout ?? "box"} />
      </SafeArea>
    </StyleProvider>
  );
};
