// ExportDialog: MP4 / ProRes 4444 (только для версии с transparent_export, H4), FPS, качество;
// запрос с Idempotency-Key.
import { defaultSettings } from "@ms/contracts";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ExportDialog } from "../src/components/ExportDialog.js";
import { t } from "../src/i18n/index.js";
import { fakeFetch, job, on, renderQ } from "./helpers.js";

afterEach(() => vi.unstubAllGlobals());

it("версия с transparent_export false → ProRes недоступен с подсказкой", () => {
  renderQ(<ExportDialog versionId="v1" settings={{ ...defaultSettings(), transparent_export: false }} onClose={() => undefined} onCreated={() => undefined} />);
  const prores = screen.getByLabelText(t("export.format.prores4444")) as HTMLInputElement;
  expect(prores.disabled).toBe(true);
  expect(screen.getByText(t("export.proresUnavailable"))).toBeTruthy();
  expect((screen.getByLabelText(t("export.format.mp4")) as HTMLInputElement).checked).toBe(true);
});

it("прозрачная версия → ProRes доступен; отправка: формат, fps, crf, масштаб, ключ", async () => {
  const { calls } = fakeFetch([on("POST", "/api/versions/v1/exports", { job: job({ type: "scene.export" }) }, 202)]);
  const created = vi.fn();
  renderQ(<ExportDialog versionId="v1" settings={{ ...defaultSettings(), transparent_export: true }} onClose={() => undefined} onCreated={created} />);
  const prores = screen.getByLabelText(t("export.format.prores4444")) as HTMLInputElement;
  expect(prores.disabled).toBe(false);
  fireEvent.click(prores);
  fireEvent.change(screen.getByLabelText(t("export.fps")), { target: { value: "60" } });
  fireEvent.change(screen.getByLabelText(t("export.quality")), { target: { value: "16" } });
  fireEvent.change(screen.getByLabelText(t("export.scale")), { target: { value: "0.5" } });
  fireEvent.click(screen.getByRole("button", { name: t("export.start") }));
  await waitFor(() => expect(created).toHaveBeenCalled());
  expect(calls[0]!.body).toEqual({ format: "prores4444", fps: 60, crf: 16, scale: 0.5 });
  expect(calls[0]!.headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
});

it("fps «как в версии» — поле не отправляется; MP4 по умолчанию", async () => {
  const { calls } = fakeFetch([on("POST", "/api/versions/v1/exports", { job: job({ type: "scene.export" }) }, 202)]);
  renderQ(<ExportDialog versionId="v1" settings={defaultSettings()} onClose={() => undefined} onCreated={() => undefined} />);
  fireEvent.click(screen.getByRole("button", { name: t("export.start") }));
  await waitFor(() => expect(calls).toHaveLength(1));
  expect(calls[0]!.body).toEqual({ format: "mp4", crf: 18, scale: 1 });
});
