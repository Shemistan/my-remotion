// Засев tmp-хранилища для Playwright UI: `tsx web/e2e/seed-cli.ts` с `MS_DATA_DIR` (только
// tmp-хранилище тестов, `MS_ALLOW_SYSTEM_DISK=1`). Раннер берёт только задачи засева (`onlyIds`):
// три сцены — две версии (kit-gallery → choreo-gallery), прозрачная kit-gallery для ProRes,
// hang-scene → failed-версия; сценарный проект (S9, `seed-script.ts`), его план строит задача
// `script.plan` без агента; видеопроект со сценами плана (Task 40, `seed-video-scenes.ts`).
// Последняя строка вывода — JSON с id.
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { bootCore } from "../../server/src/boot.js";
import { registerHandlers } from "../../server/src/jobs/handlers.js";
import { seedScript } from "./seed-script.js";
import { seedScene } from "./seed.js";
import { seedVideoScenes } from "./seed-video-scenes.js";

const RENDER_FIXTURES = fileURLToPath(new URL("../../render/test/fixtures/", import.meta.url));
const HANG = fileURLToPath(new URL("./fixtures/hang-scene/", import.meta.url));
// Motion Spec для choreo-gallery: без него «Рендер» (правка параметров) не прочитает базу
const CHOREO_SPEC = fileURLToPath(new URL("./fixtures/choreo-gallery.spec.json", import.meta.url));
const PROJECT = "e2e-ui";

async function main() {
  const root = process.env.MS_DATA_DIR ?? "";
  if (!root.includes("/tmp/")) throw new Error(`seed: только tmp-хранилище тестов, а не ${root}`);
  const mine = new Set<string>();
  const core = await bootCore({ env: process.env, kind: "cli", runner: { onlyIds: mine }, handlers: (svc) => registerHandlers(svc) });
  try {
    const versions = await seedScene(core, [
      { dir: `${RENDER_FIXTURES}kit-gallery`, prompt: "Галерея примитивов motion-kit: граф, счётчик и карточки" },
      { dir: `${RENDER_FIXTURES}choreo-gallery`, specFile: CHOREO_SPEC, prompt: "Хореография: элементы входят по битам, разными движениями" },
    ], { projectId: PROJECT, projectTitle: "Демо UI" });
    const prores = await seedScene(core, [
      { dir: `${RENDER_FIXTURES}kit-gallery`, settings: { transparent_export: true }, prompt: "Галерея для прозрачного экспорта" },
    ], { projectId: PROJECT });
    const failed = await seedScene(core, [{ dir: HANG, timeoutMs: 20_000, prompt: "Сцена, которая вешает рендер" }], { projectId: PROJECT });
    const script = await seedScript(core, mine, join(root, "..", "script-fixtures"));
    const videoScenes = await seedVideoScenes(core, mine, join(root, "..", "video-scene-fixtures"));
    console.log(JSON.stringify({ projectId: PROJECT, versions, prores, failed, script, videoScenes }));
  } finally {
    await core.close();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
