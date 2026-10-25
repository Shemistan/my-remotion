// Каталоги скриншотов Playwright UI (S17b): по умолчанию `tmp/e2e-ui/` (gitignored) — обычный
// `make e2e-ui` не перезаписывает evidence в репозитории; `MS_WRITE_EVIDENCE=1` — `docs/evidence/`
// (как у e2e сервера).
import { join } from "node:path";

export function evidenceDirs(repo: string, writeEvidence: string | undefined) {
  const root = writeEvidence === "1" ? join(repo, "docs/evidence") : join(repo, "tmp/e2e-ui");
  return {
    root,
    phase1: join(root, "phase-1/ui"),
    /** Скриншоты Video Workspace (Task 29). */
    video: join(root, "phase-2/ui"),
    /** Скриншоты анализа и визуального плана (Task 33): уменьшенные до 480 px (V4). */
    phase3: join(root, "phase-3/ui"),
    /** Скриншоты UI сценария (S8/S9): уменьшенные до 480 px. */
    script: join(root, "script-mvp/ui"),
  };
}
