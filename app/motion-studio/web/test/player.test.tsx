// Player: шаг ±1 кадр ставит currentTime в середину кадра, счётчик кадров, сведения о версии.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { expect, it } from "vitest";
import { Player, type PlayerHandle } from "../src/components/Player.js";
import { t } from "../src/i18n/index.js";
import { frameToTime } from "../src/lib/player-math.js";

const fps = { num: 30, den: 1 };

function setup() {
  const ref = createRef<PlayerHandle>();
  const view = render(<Player ref={ref} src="/api/versions/v1/preview.mp4" fps={fps} durationFrames={150} width={1920} height={1080} />);
  const video = view.container.querySelector("video")!;
  return { ref, video };
}

it("«следующий кадр» на кадре 10 → currentTime = frameToTime(11), счётчик 11", () => {
  const { ref, video } = setup();
  act(() => ref.current!.seek(10));
  expect(video.currentTime).toBeCloseTo(frameToTime(10, fps), 6);
  fireEvent.click(screen.getByRole("button", { name: t("player.next") }));
  expect(video.currentTime).toBeCloseTo(frameToTime(11, fps), 6);
  expect(screen.getByTestId("frame").textContent).toBe(t("player.frame", { frame: 11, total: 150 }));
  fireEvent.click(screen.getByRole("button", { name: t("player.prev") }));
  fireEvent.click(screen.getByRole("button", { name: t("player.prev") }));
  expect(screen.getByTestId("frame").textContent).toBe(t("player.frame", { frame: 9, total: 150 }));
});

it("пауза сразу фиксирует кадр по currentTime; шаг — от него", () => {
  const { video } = setup();
  video.currentTime = 2.01;
  fireEvent.pause(video);
  expect(screen.getByTestId("frame").textContent).toBe(t("player.frame", { frame: 60, total: 150 }));
  fireEvent.click(screen.getByRole("button", { name: t("player.next") }));
  expect(screen.getByTestId("frame").textContent).toBe(t("player.frame", { frame: 61, total: 150 }));
});

it("шаг назад на кадре 0 и вперёд на последнем — без выхода за границы", () => {
  const { ref } = setup();
  fireEvent.click(screen.getByRole("button", { name: t("player.prev") }));
  expect(screen.getByTestId("frame").textContent).toBe(t("player.frame", { frame: 0, total: 150 }));
  act(() => ref.current!.seek(149));
  fireEvent.click(screen.getByRole("button", { name: t("player.next") }));
  expect(screen.getByTestId("frame").textContent).toBe(t("player.frame", { frame: 149, total: 150 }));
});

it("ползунок seek переводит на кадр; сведения: соотношение, FPS, длительность", () => {
  const { video } = setup();
  fireEvent.change(screen.getByRole("slider", { name: t("player.seek") }), { target: { value: "72" } });
  expect(video.currentTime).toBeCloseTo(frameToTime(72, fps), 6);
  const info = screen.getByTestId("player-info").textContent!;
  expect(info).toContain("16:9");
  expect(info).toContain("1920×1080");
  expect(info).toContain(t("player.fps", { fps: "30" }));
  expect(info).toContain(t("player.duration", { seconds: "5,0", frames: 150 }));
});

it("событие timeupdate видео обновляет счётчик кадров", () => {
  const { video } = setup();
  video.currentTime = frameToTime(42, fps);
  fireEvent(video, new Event("timeupdate"));
  expect(screen.getByTestId("frame").textContent).toBe(t("player.frame", { frame: 42, total: 150 }));
});
