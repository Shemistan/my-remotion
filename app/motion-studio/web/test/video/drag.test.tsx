// Task 45: перетаскивание сцены — только перемещение (Р-V6): прилипание к слову (Alt — без),
// пределы ролика, мгновенная проверка ключевых слов; «вернуть ревизию» — операции разницы.
// Дорожка «Графика»: сдвиг мышью → операция move; слово вне сцены — красная подсветка и причина.
import type { VideoTimelineClip, VideoTimelineDoc } from "@ms/contracts";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TrackGraphics } from "../../src/components/timeline/TrackGraphics.js";
import { t } from "../../src/i18n/index.js";
import { dragMove, revertOps } from "../../src/timeline/drag.js";

const clip = (over: Partial<VideoTimelineClip> = {}): VideoTimelineClip => ({
  clip_id: "clip_sp_001", scene_id: "scn_1", item_id: "sp_001", version_id: "ver_1", version_number: 1, include: "approved",
  start_frame: 330, duration_frames: 87, placement: { mode: "overlay", zone: "lower_third", rect: { x: 0, y: 0.66, w: 1, h: 0.34 }, transparent: true }, z: 1,
  anchors: [{ word_id: "w_000024", text: "выручка", frame: 340 }], version_frames: 87, ...over,
});

describe("dragMove", () => {
  it("якорь 340, сдвиг −80 от 330 → окно [250, 337) не покрывает слово: anchor.ok === false", () => {
    const r = dragMove(clip(), -80, [], false);
    expect(r.start_frame).toBe(250);
    expect(r.anchor).toEqual({ ok: false, outside: ["w_000024"] });
  });

  it("прилипание к ближайшему слову в пределах 6 кадров; с Alt — кадр как есть", () => {
    const words = [300, 336, 351];
    expect(dragMove(clip(), 4, words, false)).toMatchObject({ start_frame: 336, snapped: true, anchor: { ok: true } });
    expect(dragMove(clip(), 4, words, true)).toMatchObject({ start_frame: 334, snapped: false });
    // слово дальше 6 кадров — без прилипания
    expect(dragMove(clip(), -12, words, false)).toMatchObject({ start_frame: 318, snapped: false });
  });

  it("начало — в пределах [0, maxStart]; длительность не меняется", () => {
    expect(dragMove(clip(), -1000, [], false).start_frame).toBe(0);
    expect(dragMove(clip(), 1000, [], false, 900 - 87).start_frame).toBe(813);
    expect(dragMove(clip(), 7.6, [], true).start_frame).toBe(338);
  });
});

describe("revertOps", () => {
  type Doc = Pick<VideoTimelineDoc, "scenes" | "excluded" | "ops">;
  const doc = (scenes: VideoTimelineClip[], excluded: VideoTimelineDoc["excluded"] = [], ops: VideoTimelineDoc["ops"] = []): Doc => ({ scenes, excluded, ops });
  it("сдвиг назад, возврат исключённой, исключение лишней; одинаковые — пусто", () => {
    const a = clip();
    const b = clip({ clip_id: "clip_sp_002", item_id: "sp_002", start_frame: 600, anchors: [] });
    const cur = doc([{ ...a, start_frame: 360 }, { ...clip({ clip_id: "clip_sp_003", item_id: "sp_003" }) }]);
    expect(revertOps(cur, doc([a, b], [{ item_id: "sp_003", reason: "user" }]))).toEqual([
      { op: "include", clip_id: "clip_sp_003", include: false },
      { op: "move", clip_id: "clip_sp_001", start_frame: 330, snap: false },
      { op: "include", clip_id: "clip_sp_002", include: true },
      { op: "use_version", clip_id: "clip_sp_002", version_id: "ver_1" },
      { op: "move", clip_id: "clip_sp_002", start_frame: 600, snap: false },
    ]);
    expect(revertOps(doc([a]), doc([a]))).toEqual([]);
  });

  it("клип, исключённый в цели не пользователем (не утверждён, устарел), не исключается пользователем", () => {
    const a = clip();
    const c = clip({ clip_id: "clip_sp_003", item_id: "sp_003" });
    expect(revertOps(doc([a, c]), doc([a], [{ item_id: "sp_003", reason: "not_approved" }]))).toEqual([]);
    expect(revertOps(doc([a, c]), doc([a], [{ item_id: "sp_003", reason: "stale" }]))).toEqual([]);
  });

  it("override-клип: причина сдвига — из последнего move цели, не причина включения", () => {
    const o = clip({ include: "override", override_reason: "черновик для заказчика", start_frame: 250 });
    const target = doc([o], [], [{ op: "move", clip_id: "clip_sp_001", start_frame: 250, override_reason: "слово раньше сцены — так задумано" }]);
    expect(revertOps(doc([{ ...o, start_frame: 330 }]), target)).toEqual([
      { op: "move", clip_id: "clip_sp_001", start_frame: 250, snap: false, override_reason: "слово раньше сцены — так задумано" },
    ]);
    // сдвиг цели без причины — и move без причины (причина включения не переносится)
    expect(revertOps(doc([{ ...o, start_frame: 330 }]), doc([o], [], [{ op: "move", clip_id: "clip_sp_001", start_frame: 250 }]))).toEqual([
      { op: "move", clip_id: "clip_sp_001", start_frame: 250, snap: false },
    ]);
  });
});

describe("TrackGraphics: перетаскивание мышью", () => {
  const setup = (c = clip()) => {
    const onMove = vi.fn();
    const onSelect = vi.fn();
    render(
      <TrackGraphics clips={[c]} excluded={[{ item_id: "sp_009", reason: "not_approved", start: 700, end: 760 }]} durationFrames={900} zoom={2}
        wordFrames={[336]} numbers={new Map([["sp_001", 1], ["sp_009", 3]])} busy={false} onSelect={onSelect} onMove={onMove} />,
    );
    return { onMove, onSelect, el: screen.getByTestId("timeline-clip-sp_001") };
  };

  it("сдвиг на +8 px (4 кадра) прилипает к слову 336 → move с прилипанием", () => {
    const { onMove, el } = setup();
    fireEvent.pointerDown(el, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(el, { clientX: 108, pointerId: 1 });
    expect(el.getAttribute("data-start")).toBe("336");
    expect(el.className).toContain("snapped");
    fireEvent.pointerUp(el, { clientX: 108, pointerId: 1 });
    expect(onMove).toHaveBeenCalledWith("clip_sp_001", 336, { snap: true });
  });

  it("с Alt — без прилипания (snap: false)", () => {
    const { onMove, el } = setup();
    fireEvent.pointerDown(el, { button: 0, clientX: 100, pointerId: 1, altKey: true });
    fireEvent.pointerMove(el, { clientX: 108, pointerId: 1, altKey: true });
    fireEvent.pointerUp(el, { clientX: 108, pointerId: 1 });
    expect(onMove).toHaveBeenCalledWith("clip_sp_001", 334, { snap: false });
  });

  it("слово вне сцены: красная подсветка, сохранение — только с причиной", () => {
    const { onMove, el } = setup();
    fireEvent.pointerDown(el, { button: 0, clientX: 300, pointerId: 1 });
    fireEvent.pointerMove(el, { clientX: 140, pointerId: 1 });
    expect(el.getAttribute("data-anchor")).toBe("outside");
    expect(el.className).toContain("bad");
    fireEvent.pointerUp(el, { clientX: 140, pointerId: 1 });
    expect(onMove).not.toHaveBeenCalled();
    expect(screen.getByTestId("move-reason").textContent).toContain(t("projectTimeline.drag.outside", { words: "«выручка»" }));
    fireEvent.change(screen.getByPlaceholderText(t("projectTimeline.drag.reasonPlaceholder")), { target: { value: "пауза перед словом" } });
    fireEvent.click(screen.getByRole("button", { name: t("projectTimeline.drag.apply") }));
    expect(onMove).toHaveBeenCalledWith("clip_sp_001", 250, { snap: true, reason: "пауза перед словом" });
  });

  it("клик без сдвига — выбор; исключённая сцена — серым с причиной", () => {
    const { onMove, onSelect, el } = setup();
    fireEvent.pointerDown(el, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerUp(el, { clientX: 100, pointerId: 1 });
    expect(onSelect).toHaveBeenCalledWith("sp_001");
    expect(onMove).not.toHaveBeenCalled();
    const x = screen.getByTestId("timeline-excluded-sp_009");
    expect(x.className).toContain("excluded");
    expect(x.textContent).toContain(t("projectTimeline.excluded.reason.not_approved"));
    expect(el.textContent).toContain(t("projectTimeline.clip.badgeC"));
  });
});
