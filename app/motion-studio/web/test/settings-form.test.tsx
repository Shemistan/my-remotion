// SettingsForm (ТЗ §6.4): все параметры сцены, проверка ввода, пресеты разрешения.
import { defaultSettings, type Settings } from "@ms/contracts";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { SettingsForm } from "../src/components/SettingsForm.js";
import { t } from "../src/i18n/index.js";

function Harness({ onChange }: { onChange: (s: Settings) => void }) {
  const [s, setS] = useState<Settings>(defaultSettings());
  return <SettingsForm value={s} onChange={(n) => { setS(n); onChange(n); }} />;
}

const field = (key: Parameters<typeof t>[0]) => screen.getByLabelText(t(key));

it("все поля ТЗ §6.4 на месте", () => {
  render(<Harness onChange={() => undefined} />);
  for (const k of [
    "settings.aspect_ratio", "settings.resolution", "settings.fps", "settings.duration", "settings.style_preset", "settings.color_palette",
    "settings.font", "settings.animation_intensity", "settings.background", "settings.transparent_export", "settings.safe_area_x", "settings.safe_area_y",
  ] as const) expect(field(k)).toBeTruthy();
});

it("fps 0 → сообщение об ошибке, наверх не уходит", () => {
  const onChange = vi.fn();
  render(<Harness onChange={onChange} />);
  fireEvent.change(field("settings.fps"), { target: { value: "0" } });
  expect(screen.getByText(t("settings.errors.fps"))).toBeTruthy();
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.change(field("settings.fps"), { target: { value: "60" } });
  expect(screen.queryByText(t("settings.errors.fps"))).toBeNull();
  // длительность в секундах сохраняется: 6 с × 60 fps
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ fps: { num: 60, den: 1 }, duration_frames: 360 }));
});

it("9:16 → 1080×1920; 1:1 → 1080×1080; 720p в 16:9 → 1280×720", () => {
  const onChange = vi.fn();
  render(<Harness onChange={onChange} />);
  fireEvent.change(field("settings.aspect_ratio"), { target: { value: "9:16" } });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ aspect_ratio: "9:16", width: 1080, height: 1920 }));
  fireEvent.change(field("settings.aspect_ratio"), { target: { value: "1:1" } });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ width: 1080, height: 1080 }));
  fireEvent.change(field("settings.aspect_ratio"), { target: { value: "16:9" } });
  fireEvent.change(field("settings.resolution"), { target: { value: "720" } });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ width: 1280, height: 720 }));
});

it("длительность в секундах → кадры; 0 — ошибка", () => {
  const onChange = vi.fn();
  render(<Harness onChange={onChange} />);
  fireEvent.change(field("settings.duration"), { target: { value: "8" } });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ duration_frames: 240 }));
  fireEvent.change(field("settings.duration"), { target: { value: "0" } });
  expect(screen.getByText(t("settings.errors.duration"))).toBeTruthy();
});

it("палитра — список цветов через запятую; неверный цвет — ошибка", () => {
  const onChange = vi.fn();
  render(<Harness onChange={onChange} />);
  fireEvent.change(field("settings.color_palette"), { target: { value: "#7c3aed, #a78bfa" } });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ color_palette: ["#7c3aed", "#a78bfa"] }));
  fireEvent.change(field("settings.color_palette"), { target: { value: "фиолетовый" } });
  expect(screen.getByText(t("settings.errors.palette"))).toBeTruthy();
  fireEvent.change(field("settings.color_palette"), { target: { value: "" } });
  expect(onChange.mock.lastCall![0]).not.toHaveProperty("color_palette");
});

it("безопасная зона в процентах, прозрачный экспорт, интенсивность", () => {
  const onChange = vi.fn();
  render(<Harness onChange={onChange} />);
  fireEvent.change(field("settings.safe_area_x"), { target: { value: "8" } });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ safe_area: { x: 0.08, y: 0.05 } }));
  fireEvent.change(field("settings.safe_area_y"), { target: { value: "60" } });
  expect(screen.getByText(t("settings.errors.safe_area"))).toBeTruthy();
  fireEvent.click(field("settings.transparent_export"));
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ transparent_export: true }));
  fireEvent.change(field("settings.animation_intensity"), { target: { value: "energetic" } });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ animation_intensity: "energetic" }));
});

it("readOnly-поля: disabled — форма показывает, но не правит", () => {
  render(<SettingsForm value={defaultSettings()} onChange={() => undefined} disabled />);
  expect(field("settings.fps").matches(":disabled")).toBe(true);
});
