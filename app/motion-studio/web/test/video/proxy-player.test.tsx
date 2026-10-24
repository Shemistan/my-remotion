// ProxyPlayer: «Прослушать фрагмент» из режима «После монтажа» (превью ревизии) — переход на
// прокси и seek в source только когда новый src загрузил метаданные, затем воспроизведение
// (ревью Task 29 M4: как смена режима, через `pending`).
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { expect, it, vi } from "vitest";
import { ProxyPlayer, type ProxyPlayerHandle } from "../../src/components/video/ProxyPlayer.js";
import { t } from "../../src/i18n/index.js";
import { dec, edlDto } from "./fixtures.js";

/** `<video>` jsdom без медиа: метаданные «загружены» сразу, записи `currentTime` — с текущим src. */
function stubVideo(v: HTMLVideoElement) {
  const log: { src: string; t: number }[] = [];
  const play = vi.fn(() => Promise.resolve());
  let time = 0;
  Object.defineProperties(v, {
    readyState: { get: () => 1, configurable: true },
    currentSrc: { get: () => v.src, configurable: true },
    paused: { get: () => true, configurable: true },
    currentTime: { get: () => time, set: (x: number) => { time = x; log.push({ src: v.src, t: x }); }, configurable: true },
    play: { value: play, configurable: true },
    pause: { value: vi.fn(), configurable: true },
  });
  return { log, play };
}

it("playRange из превью: seek в source уже на прокси, потом play", () => {
  const edl = { ...edlDto([dec("a", { status: "accepted" })]), preview_ready: true };
  const ref = createRef<ProxyPlayerHandle>();
  const { container } = render(<ProxyPlayer ref={ref} mediaId="med_1" durationUs={10_000_000} fps={{ num: 30, den: 1 }} width={1280} height={720} edl={edl} />);
  const video = container.querySelector("video")!;
  const { log, play } = stubVideo(video);
  fireEvent.click(screen.getByRole("radio", { name: t("video.player.edited") }));
  expect(video.getAttribute("src")).toMatch(/\/preview\.mp4$/);
  log.length = 0;

  act(() => ref.current!.playRange({ start_us: 3_000_000, end_us: 5_000_000 }));
  fireEvent.loadedMetadata(video);
  expect(video.getAttribute("src")).toBe("/api/media/med_1/proxy.mp4");
  // ни одной записи времени на превью: место 3,0 с source — только на прокси
  expect(log.every((e) => e.src.endsWith("/api/media/med_1/proxy.mp4"))).toBe(true);
  expect(log.at(-1)).toMatchObject({ t: 3 });
  expect(play).toHaveBeenCalledTimes(1);
  expect(screen.getByText(t("video.player.listening", { from: "00:00:03.00", to: "00:00:05.00" }))).toBeTruthy();
});
