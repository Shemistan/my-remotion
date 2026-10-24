// Экспорт MP4 через UI: диалог → задача scene.export (реальный рендер сервера) → «Скачать»;
// скачанный файл проходит ffprobe: 1920×1080, h264 + aac.
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { RUN_DIR, shot, state } from "./helpers.js";

interface Stream { codec_type: string; codec_name: string; width?: number; height?: number }

test("«Экспорт» MP4 → задача → «Скачать»; ffprobe 1920×1080 h264/aac", async ({ page }) => {
  const { versions } = state();
  await page.goto(`/scenes/${versions.sceneId}`);
  await expect(page.getByRole("heading", { name: "v2", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Экспорт", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Экспорт версии" });
  await expect(dialog.getByLabel("MP4 (H.264 + AAC)")).toBeChecked();
  // версия непрозрачная — ProRes недоступен с подсказкой (H4)
  await expect(dialog.getByLabel("ProRes 4444 с альфа-каналом")).toBeDisabled();
  await expect(dialog).toContainText("ProRes 4444 недоступен");
  await shot(page, "export-dialog");
  await dialog.getByRole("button", { name: "Экспортировать" }).click();
  await expect(dialog).toHaveCount(0);

  const download = page.getByRole("link", { name: "Скачать" });
  await expect(download).toBeVisible({ timeout: 180_000 });
  await shot(page, "export-done");
  const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
  const path = join(RUN_DIR, `download-${Date.now()}.mp4`);
  await file.saveAs(path);
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", path], { encoding: "utf8" })) as { streams: Stream[] };
  const video = probe.streams.find((s) => s.codec_type === "video")!;
  const audio = probe.streams.find((s) => s.codec_type === "audio");
  expect(video).toMatchObject({ codec_name: "h264", width: 1920, height: 1080 });
  expect(audio?.codec_name).toBe("aac");
});
