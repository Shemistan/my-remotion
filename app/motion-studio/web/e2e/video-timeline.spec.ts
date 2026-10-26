// Таймлайн и финал видеопроекта в UI (Task 45): настоящий сервер на tmp-хранилище, без LLM
// (claudeBin — заглушка). Свой видеопроект (`seed-video-timeline.ts`: импорт ffmpeg, план из трёх
// сцен с ключевыми словами, A, B, C у двух готовых версий) → вкладка «Таймлайн» → «Собрать
// таймлайн» (настоящая задача `timeline.build`) → дорожки, третья сцена «не вошла» → перетаскивание
// сцены мышью с прилипанием к слову (ревизия r2) → «Собрать превью ревизии» (`timeline.preview`,
// реальный рендер, Range) → «Экспорт финала…» 720p черновое → «Смонтировать и экспортировать»
// (`final.render`: master, рендер, проверка) → история экспортов, отчёт проверки, файл по Range.
// Скриншоты: tmp/e2e-ui/phase-5/ui/ (MS_WRITE_EVIDENCE=1 — docs/evidence/phase-5/ui/).
import { join } from "node:path";
import { type FinalExportDto, type TimelineDto, usToFrame } from "@ms/contracts";
import { type Page, expect, test } from "@playwright/test";
import { t } from "../src/i18n/index.js";
import { evidenceDirs } from "./evidence.js";
import { REPO, shot, state } from "./helpers.js";

const EVIDENCE_PHASE5 = join(evidenceDirs(REPO, process.env.MS_WRITE_EVIDENCE).root, "phase-5/ui");
const RENDER_TIMEOUT = 900_000;

const openTimeline = (page: Page) => page.getByRole("tab", { name: t("video.tab.timeline"), exact: true }).click();

test("таймлайн видеопроекта: сборка, сдвиг по словам, превью ревизии, финал 720p и отчёт проверки", async ({ page, request }) => {
  test.setTimeout(2_400_000);
  const st = state().videoTimeline;
  const [i1, i2, i3] = st.itemIds as [string, string, string];
  await page.goto(`/projects/${st.projectId}`);
  await openTimeline(page);

  // сборка: настоящая задача timeline.build
  await expect(page.getByText(t("projectTimeline.empty"))).toBeVisible();
  await page.getByRole("button", { name: t("projectTimeline.build"), exact: true }).click();
  await expect(page.getByTestId("timeline-view")).toBeVisible({ timeout: 180_000 });
  await expect(page.getByTestId("timeline-revision")).toHaveText(t("projectTimeline.revision", { n: 1 }));
  for (const id of ["track-video", "track-audio", "track-graphics", "track-anchors"]) await expect(page.getByTestId(id)).toBeVisible();
  const c1 = page.getByTestId(`timeline-clip-${i1}`);
  await expect(c1).toContainText(t("projectTimeline.clip.badgeC"));
  await expect(page.getByTestId(`timeline-clip-${i2}`)).toBeVisible();
  await expect(page.getByTestId(`timeline-excluded-${i3}`)).toHaveAttribute("data-reason", "no_version");
  await expect(page.getByTestId("anchor-tick")).toHaveCount(2);
  await expect(page.getByTestId("timeline-seq").first()).toBeVisible();

  const r1 = (await (await request.get(`/api/projects/${st.projectId}/timeline`)).json()) as TimelineDto;
  const before = r1.doc.scenes.find((c) => c.item_id === i1)!;

  // перетаскивание мышью: крупнее, сдвиг влево — прилипает к началу слова
  await page.getByRole("button", { name: t("projectTimeline.zoomIn") }).click();
  const zoom = Number(await page.getByTestId("timeline-view").getAttribute("data-zoom"));
  const box = (await c1.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  // влево на ~12 кадров (слово): вправо сцена 1 налезла бы на непрозрачную сцену 2 (scene_overlap)
  const dx = -Math.max(12 * zoom, 12);
  for (let k = 1; k <= 5; k++) await page.mouse.move(x + (k * dx) / 5, y);
  await expect(c1).toHaveClass(/dragging/);
  await page.mouse.up();
  await expect(page.getByTestId("timeline-revision")).toHaveText(t("projectTimeline.revision", { n: 2 }), { timeout: 30_000 });
  const r2 = (await (await request.get(`/api/projects/${st.projectId}/timeline`)).json()) as TimelineDto;
  const moved = r2.doc.scenes.find((c) => c.item_id === i1)!;
  expect(moved.start_frame).not.toBe(before.start_frame);
  expect(moved.duration_frames).toBe(before.duration_frames);
  // слова фикстуры — каждые 0,4 с с 1 с, монтаж без вырезок: сцена встала на начало слова
  const fps = r2.doc.fps;
  expect(Array.from({ length: 27 }, (_, k) => usToFrame(1_000_000 + k * 400_000, fps))).toContain(moved.start_frame);
  expect(r2.doc.ops).toEqual([{ op: "move", clip_id: before.clip_id, start_frame: moved.start_frame }]);
  await expect(page.getByTestId("clip-inspector")).toContainText(t("projectTimeline.inspector.frames", { from: moved.start_frame, to: moved.start_frame + moved.duration_frames, n: moved.duration_frames }));
  await expect(page.getByTestId("timeline-revisions").locator("li")).toHaveCount(2);
  expect(r2.doc.issues.filter((i) => i.severity === "blocking")).toEqual([]);
  await shot(page, "timeline-r2-moved", EVIDENCE_PHASE5);

  // сдвиг с клавиатуры (fix I2): кадр, при котором слово вне сцены, — предупреждение сразу и
  // обязательная причина; без неё «Сдвинуть» недоступна (правка не отправляется)
  const insp = page.getByTestId("clip-inspector");
  const moveTo = insp.getByRole("spinbutton", { name: t("projectTimeline.inspector.moveTo") });
  await moveTo.fill(String(moved.start_frame + moved.duration_frames + 30));
  await expect(insp.getByTestId("inspector-move-outside")).toBeVisible();
  await expect(insp.getByRole("button", { name: t("projectTimeline.inspector.move"), exact: true })).toBeDisabled();
  await shot(page, "timeline-inspector-outside", EVIDENCE_PHASE5);
  await moveTo.fill("");
  // «Изменить границы — в плане»: вкладка «План» этой сцены без перезагрузки
  await insp.getByRole("button", { name: t("projectTimeline.inspector.bounds") }).click();
  await expect(page.getByRole("tab", { name: t("video.tab.plan"), exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(new RegExp(`tab=plan&item=${i1}`));
  await openTimeline(page);
  await expect(page.getByTestId("timeline-revision")).toHaveText(t("projectTimeline.revision", { n: 2 }));

  // превью ревизии: настоящая задача timeline.preview → видео по Range
  await page.getByRole("button", { name: t("projectTimeline.preview.build") }).click();
  const preview = page.getByTestId("timeline-preview");
  await expect(preview).toBeVisible({ timeout: RENDER_TIMEOUT });
  const src = (await preview.getAttribute("src"))!;
  expect(src).toBe(`/api/timelines/${r2.timeline_id}/revisions/2/preview.mp4`);
  const part = await request.get(src, { headers: { range: "bytes=0-99" } });
  expect(part.status()).toBe(206);
  expect((await part.body()).length).toBe(100);

  // финал: 720p черновое, «Смонтировать и экспортировать» → final.render
  await page.getByRole("button", { name: t("projectTimeline.export") }).click();
  const dialog = page.getByTestId("final-dialog");
  await dialog.getByLabel(t("finalExport.resolution")).selectOption("720p");
  await dialog.getByLabel(t("finalExport.quality")).selectOption("draft");
  await expect(dialog.getByTestId("final-output")).toContainText("1280×720");
  await expect(dialog.getByTestId("final-inputs")).toContainText(t("finalExport.inputs.timeline", { n: 2, edl: r2.doc.inputs.edl.revision, plan: r2.doc.inputs.plan.revision, style: r2.doc.inputs.style.revision }));
  await dialog.getByLabel(t("finalExport.fps")).selectOption("24");
  await expect(dialog.getByTestId("fps-warning")).toBeVisible();
  await dialog.getByLabel(t("finalExport.fps")).selectOption("");
  await expect(dialog.getByTestId("fps-warning")).toHaveCount(0);
  await shot(page, "final-dialog", EVIDENCE_PHASE5);
  await dialog.getByRole("button", { name: t("finalExport.start") }).click();
  await expect(page.getByTestId("final-job")).toBeVisible();

  const row = page.getByTestId("final-export").first();
  await expect(row).toBeVisible({ timeout: RENDER_TIMEOUT });
  const exports = (await (await request.get(`/api/projects/${st.projectId}/final-exports`)).json()) as FinalExportDto[];
  expect(exports).toHaveLength(1);
  const fin = exports[0]!;
  expect(fin).toMatchObject({ timeline_revision: 2, request: { resolution: "720p", quality: "draft" }, output: { width: 1280, height: 720 } });
  expect(fin.verify).not.toBeNull();
  await expect(row).toHaveAttribute("data-status", fin.status);
  await row.getByRole("button", { name: t("finalExport.history.report") }).click();
  const report = row.getByTestId("verify-report");
  await expect(report).toBeVisible();
  if (fin.status === "ready") await expect(report).toContainText(t("finalExport.verify.ready"));
  else await expect(report).not.toContainText(t("finalExport.verify.ready"));
  const file = await request.get(`/api/final-exports/${fin.id}/file`, { headers: { range: "bytes=0-99" } });
  expect(file.status()).toBe(206);
  const fpsName = fps.den === 1 ? `${fps.num}` : (fps.num / fps.den).toFixed(2);
  expect(file.headers()["content-disposition"]).toContain(`-r2-720p-${fpsName}.mp4"`);
  await report.scrollIntoViewIfNeeded();
  await shot(page, "final-verify-report", EVIDENCE_PHASE5);
});
