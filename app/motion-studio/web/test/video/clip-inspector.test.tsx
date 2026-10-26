// Task 45 (fix I2): клавиатурный путь сдвига. Инспектор — мгновенная `anchorCheck` по кадру, куда
// встанет сцена (с прилипанием — `snapToWord`), слово вне сцены — предупреждение и обязательная
// причина (`override_reason`). Стрелки ←/→ на сфокусированной сцене дорожки — ±1 кадр, с Shift —
// к началу соседнего слова; слово вне сцены — то же поле причины.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClipInspector } from "../../src/components/timeline/ClipInspector.js";
import { TrackGraphics } from "../../src/components/timeline/TrackGraphics.js";
import { t } from "../../src/i18n/index.js";
import { tclip } from "./timeline-fixtures.js";

const F30 = { num: 30, den: 1 };
// сцена [300, 390), ключевое слово — кадр 330
const clip = tclip(1);

describe("ClipInspector: сдвиг с клавиатуры", () => {
  const setup = (wordFrames: number[] = []) => {
    const onOps = vi.fn();
    render(<ClipInspector clip={clip} n={1} fps={F30} busy={false} wordFrames={wordFrames} onOps={onOps} onOpenPlan={() => undefined} />);
    const input = screen.getByRole("spinbutton", { name: t("projectTimeline.inspector.moveTo") });
    const submit = () => fireEvent.click(screen.getByRole("button", { name: t("projectTimeline.inspector.move") }));
    return { onOps, input, submit };
  };

  it("слово остаётся в сцене — move без причины", () => {
    const { onOps, input, submit } = setup();
    fireEvent.change(input, { target: { value: "310" } });
    expect(screen.queryByTestId("inspector-move-outside")).toBeNull();
    submit();
    expect(onOps).toHaveBeenCalledWith([{ op: "move", clip_id: "clip_sp_001", start_frame: 310 }]);
  });

  it("слово окажется вне сцены — предупреждение сразу; без причины «Сдвинуть» недоступна; с причиной — override_reason", () => {
    const { onOps, input, submit } = setup();
    fireEvent.change(input, { target: { value: "340" } });
    expect(screen.getByTestId("inspector-move-outside").textContent).toContain("«слово1»");
    const btn = screen.getByRole("button", { name: t("projectTimeline.inspector.move") }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    submit();
    expect(onOps).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: t("projectTimeline.drag.reason") }), { target: { value: "подводка до слова" } });
    submit();
    expect(onOps).toHaveBeenCalledWith([{ op: "move", clip_id: "clip_sp_001", start_frame: 340, override_reason: "подводка до слова" }]);
  });

  it("проверка — по кадру после прилипания: 335 прилипает к 329 (слово в сцене); без прилипания — 335, слово вне", () => {
    const { input } = setup([329]);
    fireEvent.change(input, { target: { value: "335" } });
    expect(screen.queryByTestId("inspector-move-outside")).toBeNull();
    expect(screen.getByTestId("inspector-move-target").textContent).toContain("329");
    fireEvent.click(screen.getByRole("checkbox", { name: t("projectTimeline.inspector.noSnap") }));
    expect(screen.getByTestId("inspector-move-outside")).toBeTruthy();
  });
});

describe("TrackGraphics: стрелки на сфокусированной сцене", () => {
  const setup = (c = clip, wordFrames: number[] = [250, 305, 360]) => {
    const onMove = vi.fn();
    const onSelect = vi.fn();
    render(<TrackGraphics clips={[c]} excluded={[]} durationFrames={900} zoom={2} wordFrames={wordFrames} numbers={new Map([["sp_001", 1]])} busy={false} onSelect={onSelect} onMove={onMove} />);
    return { onMove, onSelect, el: screen.getByTestId("timeline-clip-sp_001") };
  };

  it("← / → — ±1 кадр без прилипания", () => {
    const { onMove, el } = setup();
    fireEvent.keyDown(el, { key: "ArrowRight" });
    expect(onMove).toHaveBeenLastCalledWith("clip_sp_001", 301, { snap: false });
    fireEvent.keyDown(el, { key: "ArrowLeft" });
    expect(onMove).toHaveBeenLastCalledWith("clip_sp_001", 299, { snap: false });
  });

  it("Shift+→ / Shift+← — к началу соседнего слова", () => {
    const { onMove, el } = setup();
    fireEvent.keyDown(el, { key: "ArrowRight", shiftKey: true });
    expect(onMove).toHaveBeenLastCalledWith("clip_sp_001", 305, { snap: false });
    fireEvent.keyDown(el, { key: "ArrowLeft", shiftKey: true });
    expect(onMove).toHaveBeenLastCalledWith("clip_sp_001", 250, { snap: false });
  });

  it("слово окажется вне сцены — поле причины, move с причиной", () => {
    // Shift+→ к 360: окно [360, 450) не покрывает слово 330
    const { onMove, el } = setup(clip, [360]);
    fireEvent.keyDown(el, { key: "ArrowRight", shiftKey: true });
    expect(onMove).not.toHaveBeenCalled();
    const form = screen.getByTestId("move-reason");
    fireEvent.change(form.querySelector("input")!, { target: { value: "так задумано" } });
    fireEvent.submit(form);
    expect(onMove).toHaveBeenCalledWith("clip_sp_001", 360, { snap: false, reason: "так задумано" });
  });

  it("начало ролика — ← не уходит меньше 0", () => {
    const { onMove, el } = setup(tclip(1, { start_frame: 0, anchors: [] }), []);
    fireEvent.keyDown(el, { key: "ArrowLeft" });
    expect(onMove).not.toHaveBeenCalled();
  });
});
