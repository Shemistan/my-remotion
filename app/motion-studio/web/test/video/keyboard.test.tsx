// Клавиатура Video Workspace (ревью Task 29 M6): слово транскрипта — кнопка в порядке Tab,
// Enter/Space → seek; волна — ползунок с фокусом, стрелки → seek ± 1 с (Shift — ± 5 с),
// Home/End — начало/конец; миниатюры — кнопки с подписью времени.
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ThumbStrip } from "../../src/components/video/ThumbStrip.js";
import { TranscriptEditor } from "../../src/components/video/TranscriptEditor.js";
import { Waveform } from "../../src/components/video/Waveform.js";
import { t } from "../../src/i18n/index.js";
import { fakeFetch, renderQ } from "../helpers.js";
import { edlDto, transcriptDto } from "./fixtures.js";

afterEach(() => vi.unstubAllGlobals());

it("слово: role=button, tabIndex 0; Enter и Space → seek в начало слова", () => {
  fakeFetch();
  const onSeek = vi.fn();
  renderQ(<TranscriptEditor transcript={transcriptDto()} wordMap={edlDto().word_map} currentUs={0} onSeek={onSeek} onCut={vi.fn()} />);
  const word = screen.getByRole("button", { name: "как" });
  expect(word.tabIndex).toBe(0);
  fireEvent.keyDown(word, { key: "Enter" });
  expect(onSeek).toHaveBeenLastCalledWith(3_000_000);
  fireEvent.keyDown(screen.getByRole("button", { name: "мир." }), { key: " " });
  expect(onSeek).toHaveBeenLastCalledWith(500_000);
  fireEvent.keyDown(word, { key: "a" });
  expect(onSeek).toHaveBeenCalledTimes(2);
});

it("волна: ползунок с фокусом; ← → ± 1 с, Shift ± 5 с, Home/End, границы", () => {
  fakeFetch();
  const onSeek = vi.fn();
  renderQ(<Waveform mediaId="med_1" hasWaveform durationUs={10_000_000} decisions={[]} currentUs={4_000_000} onSeek={onSeek} />);
  const wf = screen.getByRole("slider", { name: t("video.waveform") });
  expect(wf.getAttribute("tabindex")).toBe("0");
  expect(wf.getAttribute("aria-valuetext")).toBe("00:00:04.00");
  fireEvent.keyDown(wf, { key: "ArrowRight" });
  expect(onSeek).toHaveBeenLastCalledWith(5_000_000);
  fireEvent.keyDown(wf, { key: "ArrowLeft" });
  expect(onSeek).toHaveBeenLastCalledWith(3_000_000);
  fireEvent.keyDown(wf, { key: "ArrowRight", shiftKey: true });
  expect(onSeek).toHaveBeenLastCalledWith(9_000_000);
  fireEvent.keyDown(wf, { key: "Home" });
  expect(onSeek).toHaveBeenLastCalledWith(0);
  fireEvent.keyDown(wf, { key: "End" });
  expect(onSeek).toHaveBeenLastCalledWith(10_000_000);
});

it("волна у конца: → не уходит дальше длительности", () => {
  fakeFetch();
  const onSeek = vi.fn();
  renderQ(<Waveform mediaId="med_1" hasWaveform durationUs={10_000_000} decisions={[]} currentUs={9_500_000} onSeek={onSeek} />);
  fireEvent.keyDown(screen.getByRole("slider", { name: t("video.waveform") }), { key: "ArrowRight" });
  expect(onSeek).toHaveBeenLastCalledWith(10_000_000);
});

it("миниатюры: подпись кнопки — время кадра", () => {
  const onSeek = vi.fn();
  render(<ThumbStrip mediaId="med_1" count={3} everyUs={5_000_000} durationUs={15_000_000} decisions={[]} onSeek={onSeek} />);
  const btn = screen.getByRole("button", { name: t("video.thumbAt", { tc: "00:00:05.00" }) });
  fireEvent.click(btn);
  expect(onSeek).toHaveBeenCalledWith(5_000_000);
});
