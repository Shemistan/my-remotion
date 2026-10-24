// StyleBiblePanel (Task 33): пресет, палитра со свотчами и контрастом, шрифт с образцом
// кириллицы, интенсивность, глубина, обоснование Art Director; сохранение — новая ревизия
// (PUT с base_revision); предупреждение, что B станет устаревшим; 400 — нечитаемые пары.
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StyleBiblePanel } from "../../src/components/video/StyleBiblePanel.js";
import { t } from "../../src/i18n/index.js";
import { fakeFetch, on, renderQ } from "../helpers.js";
import { styleDto } from "./plan-fixtures.js";

afterEach(() => vi.unstubAllGlobals());

it("показывает стиль: пресет, свотчи с контрастом, обоснование, автор и ревизию", () => {
  fakeFetch();
  renderQ(<StyleBiblePanel projectId="p1" style={styleDto()} bValid={false} onSaved={vi.fn()} />);
  const panel = screen.getByTestId("style-bible");
  expect(panel.textContent).toContain(t("style.revision", { n: 2, who: t("style.author.agent") }));
  expect(panel.textContent).toContain("спокойная деловая тема");
  expect((screen.getByRole("combobox", { name: t("style.preset") }) as HTMLSelectElement).value).toBe("dark-premium");
  const text = screen.getByTestId("swatch-text");
  expect(text.textContent).toContain("#f2f4f8");
  expect(text.textContent).toContain(t("style.contrastOk"));
  expect(screen.getByTestId("swatch-muted").textContent).toContain(t("style.contrastLow"));
  expect(screen.getByTestId("swatch-accent-0").textContent).toContain("#6d8bff");
  expect(screen.getByTestId("font-sample").style.fontFamily).toContain("Inter");
  expect(screen.queryByText(t("style.staleWarning"))).toBeNull();
});

it("правка: шрифт и интенсивность → предупреждение о B → «Сохранить» — PUT с base_revision → onSaved", async () => {
  const { calls } = fakeFetch([on("PUT", "/api/projects/p1/style", styleDto({ revision: 3, author: "user" }), 201)]);
  const onSaved = vi.fn();
  renderQ(<StyleBiblePanel projectId="p1" style={styleDto()} bValid onSaved={onSaved} />);
  fireEvent.change(screen.getByRole("combobox", { name: t("style.font") }), { target: { value: "Manrope" } });
  expect(screen.getByTestId("font-sample").style.fontFamily).toContain("Manrope");
  fireEvent.change(screen.getByRole("combobox", { name: t("style.intensity") }), { target: { value: "calm" } });
  expect(screen.getByText(t("style.staleWarning"))).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: t("style.save") }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(calls.at(-1)).toMatchObject({ method: "PUT", body: { base: { preset: "dark-premium", intensity: "calm", depth: 1, font: "Manrope" }, base_revision: 2 } });
});

it("цвет текста меняется — контраст пересчитывается на месте; 400 style_contrast — нечитаемые пары", async () => {
  fakeFetch([on("PUT", "/api/projects/p1/style", {
    error: "style_contrast", message: "контраст palette.text", pairs: [{ key: "text", color: "#333333", bg: "#0b0d12", ratio: 1.6, min: 4.5, good: 7 }],
  }, 400)]);
  renderQ(<StyleBiblePanel projectId="p1" style={styleDto()} bValid={false} onSaved={vi.fn()} />);
  fireEvent.change(screen.getByLabelText(t("style.color.text")), { target: { value: "#333333" } });
  expect(screen.getByTestId("swatch-text").textContent).toContain(t("style.contrastBad"));
  fireEvent.click(screen.getByRole("button", { name: t("style.save") }));
  await waitFor(() => expect(screen.getByTestId("style-error").textContent).toContain("#333333"));
});

it("ревью V1: свотчи палитры не используют общий класс .swatch (18 px), подпись — не в схлопнутой колонке", () => {
  fakeFetch();
  renderQ(<StyleBiblePanel projectId="p1" style={styleDto()} bValid={false} onSaved={vi.fn()} />);
  const sw = screen.getByTestId("swatch-text");
  expect(sw.classList.contains("swatch")).toBe(false);
  expect(sw.classList.contains("palette-swatch")).toBe(true);
});
