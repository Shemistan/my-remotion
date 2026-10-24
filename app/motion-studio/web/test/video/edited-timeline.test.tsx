// EditedTimelineBar: две линейки (source и edited) со связями клипов; наведение на edited —
// оба таймкода `чч:мм:сс.кк` и номер кадра.
import { fireEvent, render, screen } from "@testing-library/react";
import { buildTimeline } from "@ms/contracts";
import { afterEach, expect, it, vi } from "vitest";
import { EditedTimelineBar } from "../../src/components/video/EditedTimelineBar.js";

afterEach(() => vi.restoreAllMocks());

const tl = buildTimeline(10_000_000, [{ start_us: 1_000_000, end_us: 2_500_000 }], { num: 30, den: 1 });

it("наведение на edited 2,5 с → source «00:00:04.00», edited «00:00:02.50», кадр 75", () => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 850, height: 20, right: 850, bottom: 20, x: 0, y: 0, toJSON: () => ({}) });
  render(<EditedTimelineBar timeline={tl} />);
  expect(screen.getAllByTestId("clip-link")).toHaveLength(2);
  fireEvent.mouseMove(screen.getByTestId("edited-bar"), { clientX: 250 });
  const hint = screen.getByTestId("timeline-hover").textContent ?? "";
  expect(hint).toContain("00:00:04.00");
  expect(hint).toContain("00:00:02.50");
  expect(hint).toContain("75");
});

it("клик по линейке source — seek в source-время", () => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 1000, height: 20, right: 1000, bottom: 20, x: 0, y: 0, toJSON: () => ({}) });
  const onSeek = vi.fn();
  render(<EditedTimelineBar timeline={tl} onSeek={onSeek} />);
  fireEvent.click(screen.getByTestId("source-bar"), { clientX: 400 });
  expect(onSeek).toHaveBeenCalledWith(4_000_000);
  fireEvent.click(screen.getByTestId("edited-bar"), { clientX: 0 });
  expect(onSeek).toHaveBeenLastCalledWith(0);
});
