// Программные проверки по пикселям кадров, логам браузера и размеру превью.
import type { QAIssue } from "@ms/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { programmaticChecks } from "../../src/qa/programmatic.js";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Canvas, H, W, beat, card, el, makeTmp, removeTmp, solid, spec, style, withFrames } from "./helpers.js";

let tmp: string;
beforeEach(async () => (tmp = await makeTmp()));
afterEach(() => removeTmp(tmp));

const issues = (l: QAIssue[]) => l.map((i) => i.code);
const find = (l: QAIssue[], code: string) => l.filter((i) => i.code === code);

describe("programmaticChecks", () => {
  it("нормальные кадры — без замечаний; source = programmatic", async () => {
    const r = await programmaticChecks(await withFrames(tmp, [card(), card(0, "#a0e0a0").rect(20, 20, 20, 20, "#ffffff")]));
    expect(r).toEqual([]);
  });

  it("blank: однотонный кадр внутри бита — blocking", async () => {
    const r = await programmaticChecks(await withFrames(tmp, [solid("#101010")]));
    expect(issues(r)).toContain("blank");
    expect(find(r, "blank")[0]).toMatchObject({ source: "programmatic", severity: "blocking", frame: 25 });
  });

  it("blank не флагует кадр 0 и кадры до конца входа первого бита", async () => {
    const sp = spec({ beats: [beat("b0", 0, 30, ["a"]), beat("b1", 30, 60, ["a"])] });
    const r = await programmaticChecks(await withFrames(tmp, [solid("#101010"), solid("#101010"), card()], { spec: sp, at: [0, 14, 40] }));
    expect(issues(r)).not.toContain("blank");
  });

  it("blank: кадр вне всех битов не проверяется", async () => {
    const sp = spec({ beats: [beat("b0", 0, 30, ["a"])], duration_frames: 90 });
    const r = await programmaticChecks(await withFrames(tmp, [card(), solid("#101010")], { spec: sp, at: [20, 80] }));
    expect(issues(r)).not.toContain("blank");
  });

  it("clipping: прямоугольник касается правого края — blocking с областью right", async () => {
    // строка текста уходит за правый край
    const rectTouchingRightEdge = new Canvas().rect(150, 40, W - 150, 10, "#ffffff");
    const r = await programmaticChecks(await withFrames(tmp, [rectTouchingRightEdge]));
    expect(issues(r)).toContain("clipping");
    expect(find(r, "clipping")[0]).toMatchObject({ severity: "blocking", area: "right" });
  });

  it("exposed_edge: камера открыла край сцены (прозрачные полосы сверху и справа) — blocking", async () => {
    // дефект Task 13: сцена сдвинута камерой, за ней пусто (в превью — чёрные полосы)
    const shifted = card().clear(0, 0, W, 12).clear(W - 30, 0, 30, H);
    const r = await programmaticChecks(await withFrames(tmp, [shifted]));
    const e = find(r, "exposed_edge");
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ severity: "blocking", frame: 25 });
    expect(e[0]!.area).toContain("top");
    expect(e[0]!.area).toContain("right");
    expect(e[0]!.area).not.toContain("left");
  });

  it("exposed_edge: прозрачный экспорт — прозрачный край не дефект", async () => {
    const input = await withFrames(tmp, [card().clear(0, 0, W, 12)]);
    const r = await programmaticChecks({ ...input, settings: { ...input.settings, transparent_export: true } });
    expect(issues(r)).not.toContain("exposed_edge");
  });

  it("плавный свет фона у края (aurora, виньетка) — не clipping и не safe_area", async () => {
    // светлое пятно у верхнего левого угла плавно спадает к центру: до +70/255 к фону
    const glow = new Canvas();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const k = Math.exp(-(((x - 40) / 70) ** 2 + (y / 45) ** 2));
        const i = (y * W + x) * 4;
        glow.data[i] = 16 + Math.round(40 * k);
        glow.data[i + 1] = 16 + Math.round(20 * k);
        glow.data[i + 2] = 16 + Math.round(70 * k);
      }
    }
    glow.rect(70, 50, 50, 28, "#e0e0e0");
    const r = await programmaticChecks(await withFrames(tmp, [glow]));
    expect(issues(r)).not.toContain("clipping");
    expect(issues(r)).not.toContain("safe_area");
  });

  it("safe_area: объект в поле безопасной зоны — warning, не clipping", async () => {
    const c = new Canvas().rect(4, 40, 6, 12, "#ffffff"); // поле 5 % = 10 px слева, до края 4 px
    const r = await programmaticChecks(await withFrames(tmp, [c]));
    expect(find(r, "safe_area")[0]).toMatchObject({ severity: "warning" });
    expect(issues(r)).not.toContain("clipping");
  });

  it("frozen: соседние кадры разных битов совпадают — для двух кадров всё совпадает → blocking", async () => {
    const same = card();
    const r = await programmaticChecks(await withFrames(tmp, [same, same], { beats: 2 }));
    expect(issues(r)).toContain("frozen");
    expect(find(r, "frozen")).toHaveLength(1);
    expect(find(r, "frozen")[0]!.severity).toBe("blocking");
  });

  it("frozen: одна застывшая пара среди движения — warning", async () => {
    const r = await programmaticChecks(await withFrames(tmp, [card(), card().rect(20, 70, 40, 20, "#4080ff"), card().rect(20, 70, 40, 20, "#4080ff")]));
    const f = find(r, "frozen");
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: "warning", frame: 85 });
  });

  it("frozen: дрейф камеры и фона при застывших объектах — всё равно frozen", async () => {
    const drift = card(2).rect(0, 0, 30, 20, "#181818");
    const r = await programmaticChecks(await withFrames(tmp, [card(), drift], { beats: 2 }));
    expect(issues(r)).toContain("frozen");
  });

  it("frozen: кадры одного бита не сравниваются", async () => {
    const sp = spec({ beats: [beat("b0", 0, 60, ["a"])] });
    const r = await programmaticChecks(await withFrames(tmp, [card(), card()], { spec: sp, at: [20, 40] }));
    expect(issues(r)).not.toContain("frozen");
  });

  it("contrast: text к фону < 4.5 или muted < 3 — blocking", async () => {
    const r = await programmaticChecks(await withFrames(tmp, [card()], { style: style({ text: "#333333", muted: "#222222" }) }));
    const c = find(r, "contrast");
    expect(c.map((i) => i.severity)).toEqual(["blocking", "blocking"]);
    expect(c.map((i) => i.area)).toEqual(["palette.text", "palette.muted"]);
  });

  it("network: запрос в логах браузера — blocking; иные ошибки консоли — console_error warning", async () => {
    const r = await programmaticChecks(await withFrames(tmp, [card()], {
      logs: ["Failed to load https://cdn.x/y.png net::ERR", "[error] TypeError: x is undefined", "[log] ok"],
    }));
    expect(issues(r)).toContain("network");
    expect(find(r, "network")[0]!.severity).toBe("blocking");
    expect(find(r, "console_error")[0]).toMatchObject({ severity: "warning" });
    expect(find(r, "console_error")[0]!.description).toContain("TypeError");
    expect(find(r, "console_error")[0]!.description).not.toContain("net::");
  });

  it("network (Task 36): URL из allowedOrigins рендера — не сеть сцены; чужой origin и net:: — по-прежнему blocking", async () => {
    const media = "http://127.0.0.1:51234";
    const ok = await programmaticChecks(await withFrames(tmp, [card()], {
      logs: [`[log] loaded ${media}/0123456789abcdef0123456789abcdef/video`, "[log] http://localhost:41000/bundle.js ready"],
      allowedOrigins: [media, "http://localhost:41000"],
    }));
    expect(issues(ok)).not.toContain("network");
    // origin-префикс без границы (порт длиннее) — чужой origin
    const lookalike = await programmaticChecks(await withFrames(tmp, [card()], { logs: [`[log] ${media}5/x`], allowedOrigins: [media] }));
    expect(issues(lookalike)).toContain("network");
    const mixed = await programmaticChecks(await withFrames(tmp, [card()], {
      logs: [`[log] ${media}/t/video and https://cdn.x/y.png`], allowedOrigins: [media],
    }));
    expect(find(mixed, "network")[0]!.severity).toBe("blocking");
    const glued = await programmaticChecks(await withFrames(tmp, [card()], { logs: [`[log] ${media}/t/video,https://cdn.x/y.png`], allowedOrigins: [media] }));
    expect(issues(glued)).toContain("network");
    const failed = await programmaticChecks(await withFrames(tmp, [card()], { logs: [`[error] net::ERR_FAILED ${media}/t/video`], allowedOrigins: [media] }));
    expect(issues(failed)).toContain("network");
    // без allowedOrigins (рендер версии) — как раньше: любой URL — сеть
    expect(issues(await programmaticChecks(await withFrames(tmp, [card()], { logs: [`[log] ${media}/t/video`] })))).toContain("network");
  });

  it("preview_size: 0 байт — blocking, > 50 МБ — warning", async () => {
    expect(find(await programmaticChecks(await withFrames(tmp, [card()], { previewBytes: 0 })), "preview_size")[0]!.severity).toBe("blocking");
    expect(find(await programmaticChecks(await withFrames(tmp, [card()], { previewBytes: 51 * 1024 ** 2 })), "preview_size")[0]!.severity).toBe("warning");
  });

  it("кадр меньшего разрешения (превью ½) — поля и полосы масштабируются", async () => {
    const half = new Canvas(W / 2, H / 2).rect(30, 15, 30, 20, "#e0e0e0");
    const r = await programmaticChecks(await withFrames(tmp, [half]));
    expect(r).toEqual([]);
  });
});

// Крупные объекты у края (ревью раунда 1): фон края не должен «съедать» объект больше ⅛
// длины края. Кадр 960×540, поля 5 % (48 × 27 px); размеры — половина от 1920×1080.
describe("крупные объекты у края", () => {
  const big = (paint: (c: Canvas) => void) => {
    const c = new Canvas(960, 540, "#0b0d12");
    paint(c);
    return c;
  };
  const run = async (c: Canvas) => {
    const inp = await withFrames(tmp, [c]);
    return programmaticChecks({ ...inp, settings: { ...inp.settings, width: 960, height: 540 } });
  };

  it("карточка 300 px (600 в 1080p), срезанная нижним краем — clipping bottom", async () => {
    const r = await run(big((c) => c.rect(300, 400, 300, 200, "#e0e0e0")));
    expect(r).toContainEqual(expect.objectContaining({ code: "clipping", severity: "blocking", area: "bottom" }));
  });

  it("график 400×150 (800×300 в 1080p), срезанный правым краем — clipping right", async () => {
    const r = await run(big((c) => {
      c.rect(600, 150, 400, 150, "#1d2a4a");
      for (let x = 600; x < 960; x += 40) c.rect(x, 300 - ((x - 600) / 3), 40, 6, "#8b7cff"); // линия данных
      c.rect(600, 150, 400, 4, "#8b91a5");
    }));
    expect(r).toContainEqual(expect.objectContaining({ code: "clipping", severity: "blocking", area: "right" }));
  });

  it("карточка 300 px в нижнем поле, края не касается — safe_area, не clipping", async () => {
    const r = await run(big((c) => c.rect(300, 350, 300, 180, "#e0e0e0"))); // низ 530 < 540, поле с 513
    expect(issues(r)).not.toContain("clipping");
    expect(r).toContainEqual(expect.objectContaining({ code: "safe_area", severity: "warning" }));
  });

  describe("accent_static: финальный акцент жив (кадры N−20 и N−1)", () => {
    // акцент — бейдж в центре safe area (поля 5 %): регион в px ≈ x 67–125, y 34–74
    const sp = () => spec({
      beats: [beat("b0", 0, 60, ["title"]), beat("b1", 60, 90, ["badge"], "final-emphasis"), beat("b2", 90, 120, ["badge", "title"], "hold")],
      elements: [el("title", { layout: { x: 0, y: 0, w: 0.4, h: 0.1 } }), el("badge", { kind: "card", role: "акцент: итог", entrance: "scale", layout: { x: 0.35, y: 0.3, w: 0.3, h: 0.4 } })],
    });
    async function run(a: Canvas, b: Canvas, s = sp()) {
      const input = await withFrames(tmp, [card()], { spec: s, at: [100] });
      const pair = [];
      for (const [frame, c] of [[100, a], [119, b]] as const) {
        const path = join(tmp, `hold-${frame}.png`);
        await writeFile(path, c.png());
        pair.push({ frame, path });
      }
      return programmaticChecks({ ...input, accentFrames: pair });
    }

    it("регион акцента не меняется между N−20 и N−1 — warning с кадром N−1 и id элемента", async () => {
      const r = await run(card(), card());
      expect(find(r, "accent_static")).toEqual([expect.objectContaining({ severity: "warning", frame: 119, area: "badge" })]);
    });

    it("регион акцента дышит (свечение ярче) — замечания нет; изменения вне региона не в счёт", async () => {
      expect(find(await run(card(), card(0, "#ffffff")), "accent_static")).toEqual([]);
      const outside = card().rect(0, 90, 30, 10, "#ffffff");
      expect(find(await run(card(), outside), "accent_static")).toHaveLength(1);
    });

    it("изменение уровня дрейфа фона (|ΔY'| ≈ 0.007 < планки 0.01) — акцент всё ещё застыл", async () => {
      expect(find(await run(card(), card(0, "#e2e2e2")), "accent_static")).toHaveLength(1);
    });

    it("тайловая мера: живая точка в крупном регионе (Timeline на пол-кадра) не разбавляется неподвижной частью", async () => {
      // регион акцента — 0.9 × 0.66 safe area; дышит только точка 6×6 px
      const big = spec({
        beats: [beat("b0", 0, 60, ["title"]), beat("b1", 60, 90, ["tl"], "final-emphasis"), beat("b2", 90, 120, ["tl", "title"], "hold")],
        elements: [el("title", { layout: { x: 0, y: 0, w: 0.4, h: 0.1 } }), el("tl", { kind: "shape", role: "акцент: шкала", layout: { x: 0.05, y: 0.25, w: 0.9, h: 0.66 } })],
      });
      const frame = (dot: string) => new Canvas().rect(30, 60, 130, 2, "#8b91a5").rect(140, 58, 6, 6, dot);
      expect(find(await run(frame("#6a5cd0"), frame("#b8acff"), big), "accent_static")).toEqual([]);
      expect(find(await run(frame("#6a5cd0"), frame("#6a5cd0"), big), "accent_static")).toHaveLength(1);
    });

    it("планка — от фона сцены: акцент меняется не сильнее дрейфа фона вне раскладок (×2) — застыл", async () => {
      // фон вне раскладок мерцает на |ΔY'| ≈ 0.047 (частицы, аврора), акцент — на ≈ 0.043
      const drift = (bg: string, badge: string) => {
        const c = new Canvas(W, H, bg);
        return c.rect(70, 40, 50, 28, badge);
      };
      expect(find(await run(drift("#101010", "#e0e0e0"), drift("#1c1c1c", "#ebebeb")), "accent_static")).toHaveLength(1);
      // тот же фон, акцент дышит заметно сильнее фона — жив
      expect(find(await run(drift("#101010", "#c0c0c0"), drift("#1c1c1c", "#ffffff")), "accent_static")).toEqual([]);
    });

    it("регион — через safeRect (поле 0.05 × 192 → 10 px, не 9.6): столбец 9 вне региона", async () => {
      const left = spec({
        beats: [beat("b0", 0, 60, ["title"]), beat("b1", 60, 90, ["badge"], "final-emphasis"), beat("b2", 90, 120, ["badge", "title"], "hold")],
        elements: [el("title", { layout: { x: 0.6, y: 0, w: 0.3, h: 0.1 } }), el("badge", { kind: "card", role: "акцент: итог", layout: { x: 0, y: 0.3, w: 0.5, h: 0.4 } })],
      });
      const edge = card().rect(9, 30, 1, 50, "#ffffff");
      expect(find(await run(card(), edge, left), "accent_static")).toHaveLength(1);
      const inside = card().rect(10, 30, 1, 50, "#ffffff");
      expect(find(await run(card(), inside, left), "accent_static")).toEqual([]);
    });

    it("акцента нет на последнем кадре (ушёл раньше) или кадров пары нет — проверки нет", async () => {
      const gone = spec({
        beats: [beat("b0", 0, 60, ["title"]), beat("b1", 60, 90, ["badge"], "final-emphasis"), beat("b2", 90, 120, ["title"], "hold")],
        elements: [el("title", { layout: { x: 0, y: 0, w: 0.4, h: 0.1 } }), el("badge", { kind: "card", role: "акцент: итог", layout: { x: 0.35, y: 0.3, w: 0.3, h: 0.4 } })],
      });
      expect(find(await run(card(), card(), gone), "accent_static")).toEqual([]);
      const input = await withFrames(tmp, [card()], { spec: sp(), at: [100] });
      expect(find(await programmaticChecks(input), "accent_static")).toEqual([]);
    });
  });

  describe("0.4.0: реестр раскладки, застывшая схема, кадр-постер", () => {
    const layout = (items: unknown[]) => `[log] [motion-kit:layout] ${JSON.stringify({ frame: 25, height: 1080, ghosts: [], items })}`;
    const it2 = (id: string, role: string, text: string, x: number) => ({ id, role, text, rect: { x, y: 100, w: 200, h: 40 }, fontPx: 32, opacity: 1 });

    it("строка реестра в логах → token_on_label (blocking, source programmatic)", async () => {
      const r = await programmaticChecks(await withFrames(tmp, [card()], { logs: [layout([it2("l", "label", "База", 100), it2("t", "token", "user:42", 150)])] }));
      expect(find(r, "token_on_label")).toEqual([expect.objectContaining({ source: "programmatic", severity: "blocking", frame: 25 })]);
    });

    it("[motion-kit:error] в логах → kit_misuse blocking с текстом; в console_error не дублируется", async () => {
      const logs = ["[error] [motion-kit:error] DataToken: ячейка 2 очереди \"q\" вне буфера", "[error] TypeError: x is undefined"];
      const r = await programmaticChecks(await withFrames(tmp, [card()], { logs }));
      expect(find(r, "kit_misuse")).toEqual([expect.objectContaining({ severity: "blocking", source: "programmatic" })]);
      expect(find(r, "kit_misuse")[0]!.description).toContain("ячейка 2");
      expect(find(r, "console_error")[0]!.description).not.toContain("ячейка 2");
    });

    async function hold(a: Canvas, b: Canvas, kind: "graph" | "chart") {
      const sp = spec({ beats: [beat("b0", 0, 120, ["g"])], elements: [el("g", { kind })] });
      const input = await withFrames(tmp, [card()], { spec: sp, at: [100] });
      const pair = [];
      for (const [frame, c] of [[100, a], [119, b]] as const) {
        const path = join(tmp, `h-${kind}-${frame}.png`);
        await writeFile(path, c.png());
        pair.push({ frame, path });
      }
      return programmaticChecks({ ...input, accentFrames: pair });
    }
    it("схема (graph) застыла между N−20 и N−1 — frozen blocking; живая — нет; не схема — нет", async () => {
      expect(find(await hold(card(), card(), "graph"), "frozen")).toEqual([expect.objectContaining({ severity: "blocking", frame: 119 })]);
      expect(find(await hold(card(), card(12), "graph"), "frozen")).toEqual([]);
      expect(find(await hold(card(), card(), "chart"), "frozen")).toEqual([]);
    });

    async function poster(f0: Canvas, f4: Canvas) {
      const input = await withFrames(tmp, [card().rect(10, 10, 60, 8, "#ffffff").rect(130, 80, 40, 10, "#ffffff")], { at: [25] });
      const posterFrames = [];
      for (const [frame, c] of [[0, f0], [4, f4]] as const) {
        const path = join(tmp, `p-${frame}.png`);
        await writeFile(path, c.png());
        posterFrames.push({ frame, path });
      }
      return programmaticChecks({ ...input, posterFrames });
    }
    it("frame0_coverage: пустой кадр 0 при собранном финале — warning; кадр-постер — нет", async () => {
      expect(find(await poster(solid("#101010"), solid("#101010")), "frame0_coverage")).toEqual([expect.objectContaining({ severity: "warning", frame: 0 })]);
      expect(find(await poster(card(), card()), "frame0_coverage")).toEqual([]);
    });
  });
});
