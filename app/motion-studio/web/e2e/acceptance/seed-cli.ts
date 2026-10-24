// Засев фикстур приёмки (Task 22, `09` §1 п. 4 и §5 п. 4; M14): только хранилище
// MotionStudio-acceptance на SSD, до старта сервера (ядро CLI берёт owner-lock). Проект
// «Приёмка — фикстуры <время>»: kit-gallery (ready, реальный рендер) и hang-scene с коротким
// таймаутом (реальный рендер падает → failed-версия с журналом). Без LLM.
// Последняя строка вывода — JSON с id.
import { fileURLToPath } from "node:url";
import { bootCore } from "../../../server/src/boot.js";
import { seedScene } from "../seed.js";

const RENDER_FIXTURES = fileURLToPath(new URL("../../../render/test/fixtures/", import.meta.url));
// тот же путь, что ACC_ROOT в helpers.ts (helpers тянет Playwright — здесь не нужен)
const ACC_ROOT = "/Volumes/External SSD/MotionStudio-acceptance";
const HANG = fileURLToPath(new URL("../fixtures/hang-scene/", import.meta.url));

async function main() {
  if (process.env.MS_DATA_DIR !== ACC_ROOT) throw new Error(`seed приёмки: только ${ACC_ROOT}, а не ${process.env.MS_DATA_DIR}`);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13).toLowerCase();
  const projectId = `acc-fixtures-${stamp}`;
  const core = await bootCore({ env: process.env, kind: "cli", handlers: {} });
  try {
    const opts = { projectId, projectTitle: `Приёмка — фикстуры ${stamp}` };
    const kit = await seedScene(core, [{ dir: `${RENDER_FIXTURES}kit-gallery`, prompt: "Фикстура: галерея примитивов motion-kit (для экспорта после сломанной сцены)" }], opts);
    const hang = await seedScene(core, [{ dir: HANG, timeoutMs: 20_000, prompt: "Фикстура: сцена, которая вешает рендер" }], opts);
    console.log(JSON.stringify({ projectId, kit, hang }));
  } finally {
    await core.close();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
