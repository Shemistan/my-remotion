import type { Db } from "../open.js";
import { nowIso } from "./util.js";

/** Результат реальной рендер-проверки компонента KB (как в KB: `rendered-ok` | `rendered-fail`). */
export function upsert(
  db: Db,
  r: { kb_id: string; remotion_version: string; result: "rendered-ok" | "rendered-fail"; version_id: string | null; date?: string },
): void {
  db.prepare(`INSERT INTO component_tests (kb_id, remotion_version, result, version_id, date) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (kb_id, remotion_version) DO UPDATE SET result = excluded.result, version_id = excluded.version_id, date = excluded.date`)
    .run(r.kb_id, r.remotion_version, r.result, r.version_id, r.date ?? nowIso());
}
