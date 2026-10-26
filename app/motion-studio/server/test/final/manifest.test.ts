// Task 43: `final-manifest.json` — хеш входов не зависит от порядка ключей, учитывает настройки и
// render_lock_sha256 и не зависит от прочих полей окружения; документ проходит схему.
import { expect, it } from "vitest";
import { FinalManifestSchema } from "@ms/contracts";
import { type FinalManifestInput, buildFinalManifest } from "../../src/final/manifest.js";

const H = (c: string) => c.repeat(64);
const inputsA: FinalManifestInput = {
  export_id: "fin_1",
  project_id: "p1",
  timeline: { id: "tl_p1", revision: 2, hash: H("1") },
  inputs: {
    edl: { id: "edl_1", revision: 1, hash: H("2") }, plan: { id: "pln_1", revision: 1, hash: H("3") }, style: { id: "sty_1", revision: 1, hash: H("4") },
    media_sha256: H("5"), master_sha256: H("6"), audio_sha256: H("7"),
    scenes: [{ clip_id: "clip_sp_001", version_id: "ver_1", manifest_sha256: H("8") }],
  },
  request: { resolution: "1080p", quality: "standard", audio_bitrate_kbps: 192 },
  output: { width: 1920, height: 1080, fps: { num: 30, den: 1 }, frames: 555 },
  render_env: { remotion: "4.0.537", render_lock_sha256: H("9"), motion_kit: "sha256:0123456789abcdef", chrome_headless_shell: "x", node: "22.21.1" },
  ffprobe: { durationMs: 18_500, width: 1920, height: 1080, fps: { num: 30, den: 1 }, codec: "h264", audioCodec: "aac", pixFmt: "yuv420p" },
  verify: { verdict: "pass", report: "verify.json" },
  created_at: "2026-10-26T00:00:00.000Z",
};

/** Те же данные с ключами в обратном порядке на всех уровнях. */
function shuffleKeys<T>(v: T): T {
  if (Array.isArray(v)) return v.map(shuffleKeys) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, shuffleKeys(x)])) as T;
  return v;
}

it("inputs_hash не зависит от порядка ключей; манифест проходит схему", () => {
  const m = buildFinalManifest(inputsA);
  expect(FinalManifestSchema.parse(m)).toEqual(m);
  expect(m).toMatchObject({ schema_version: 1, export_id: "fin_1", inputs_hash: expect.stringMatching(/^[0-9a-f]{64}$/) });
  expect(buildFinalManifest(shuffleKeys(inputsA)).inputs_hash).toBe(m.inputs_hash);
});

it("inputs_hash: другие настройки, вход или render_lock — другой; node, время, id экспорта и ffprobe — тот же", () => {
  const h = buildFinalManifest(inputsA).inputs_hash;
  expect(buildFinalManifest({ ...inputsA, request: { ...inputsA.request, quality: "high" } }).inputs_hash).not.toBe(h);
  expect(buildFinalManifest({ ...inputsA, render_env: { ...inputsA.render_env, render_lock_sha256: H("a") } }).inputs_hash).not.toBe(h);
  expect(buildFinalManifest({ ...inputsA, inputs: { ...inputsA.inputs, master_sha256: H("b") } }).inputs_hash).not.toBe(h);
  expect(buildFinalManifest({
    ...inputsA, export_id: "fin_2", created_at: "2026-10-27T00:00:00.000Z", render_env: { ...inputsA.render_env, node: "22.22.0" },
    ffprobe: { ...inputsA.ffprobe, durationMs: 18_533 },
  }).inputs_hash).toBe(h);
});
