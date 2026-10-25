// `final-manifest.json` финала (Task 43): входы с хешами, настройки, выход, окружение рендера, ffprobe
// и итог проверки. `inputs_hash` — то, по чему повтор (`final.reproduce`) узнаёт «те же входы».
import { type FinalManifest, FinalManifestSchema } from "@ms/contracts";
import { canonicalHash } from "@ms/contracts/canonical";

/** Файлы опубликованного экспорта `final/<id>/`. */
export const FINAL_FILE = "final.mp4";
export const FINAL_MANIFEST_FILE = "final-manifest.json";
export const VERIFY_FILE = "verify.json";
export const SNAPSHOT_FILE = "project-snapshot.json";
/** Итог повтора (`final.reproduce`): `compareExports` с исходным экспортом. */
export const COMPARE_FILE = "compare.json";

export type FinalManifestInput = Omit<FinalManifest, "schema_version" | "inputs_hash">;

/**
 * `canonicalHash(inputs + request + render_env.render_lock_sha256)`: порядок ключей не важен;
 * версия Node, Chrome, время и id экспорта в хеш не входят — только то, что меняет картинку.
 */
export function finalInputsHash(m: Pick<FinalManifest, "inputs" | "request" | "render_env">): string {
  return canonicalHash({ inputs: m.inputs, request: m.request, render_lock_sha256: m.render_env.render_lock_sha256 });
}

/** Манифест финала, проверенный схемой. */
export function buildFinalManifest(i: FinalManifestInput): FinalManifest {
  return FinalManifestSchema.parse({ schema_version: 1, ...i, inputs_hash: finalInputsHash(i) });
}
