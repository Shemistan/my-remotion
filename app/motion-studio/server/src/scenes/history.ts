// История версий сцены для Edit Planner и UI (Task 18; Task 20 — `GET /scenes/:id`):
// строка на версию с разрешённой палитрой (H3), глубиной и длительностью. Источник —
// props.json по контракту (ScenePropsBase); у версий среза и импортированных — spec.json и
// settings.json версии (depth 1, M18; строка БД — если файла нет). Файл не прочитан (failed без файлов, версия пропала) — палитра
// пресета настроек: история показывает все номера.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type HistoryEntry, MotionSpecSchema, QaGateSchema, ScenePropsBaseSchema, SettingsSchema } from "@ms/contracts";
import { resolveStyle } from "@ms/render";
import type { Db } from "../db/open.js";
import * as versions from "../db/repos/versions.js";

function readJson(dir: string, name: string): unknown {
  try {
    return JSON.parse(readFileSync(join(dir, name), "utf8"));
  } catch {
    return undefined;
  }
}

export function versionHistoryDigest(db: Db, root: string, sceneId: string): HistoryEntry[] {
  return versions.listByScene(db, sceneId).map((v) => {
    const dir = join(root, v.path);
    const props = ScenePropsBaseSchema.safeParse(readJson(dir, "props.json"));
    const spec = MotionSpecSchema.safeParse(readJson(dir, "spec.json"));
    const qa = QaGateSchema.safeParse((readJson(dir, "manifest.json") as { qa?: unknown } | undefined)?.qa);
    // settings.json версии — источник правды (H4); строка БД — если файла нет
    const file = SettingsSchema.safeParse(readJson(dir, "settings.json"));
    const s = file.success ? file.data : v.settings;
    let palette: HistoryEntry["palette"];
    let depth: HistoryEntry["depth"] = 1;
    let duration = s.duration_frames;
    if (props.success) {
      const st = props.data.style;
      palette = resolveStyle({ preset: st.preset, intensity: st.intensity, ...(st.palette_overrides ? { palette_overrides: st.palette_overrides } : {}) }).palette;
      depth = st.depth;
      duration = props.data.timing.duration_frames;
    } else if (spec.success) {
      palette = resolveStyle({ preset: spec.data.style_preset, intensity: s.animation_intensity, ...(spec.data.palette_overrides ? { palette_overrides: spec.data.palette_overrides } : {}) }).palette;
    } else {
      palette = resolveStyle({ preset: s.style_preset, intensity: s.animation_intensity }).palette;
    }
    return {
      version_id: v.id,
      number: v.number,
      status: v.status,
      parent_version_id: v.parent_version_id,
      prompt: v.prompt,
      palette,
      depth,
      duration_frames: duration,
      qa: qa.success ? qa.data : null,
      created_at: v.created_at,
    };
  });
}
