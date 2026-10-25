import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { acquireOwnerLock, type VolumeProbe } from "@ms/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultSettings } from "@ms/contracts";
import { type AsrCheck, type VisionCheck, checkVisionBin, runDoctor } from "../../src/cli/doctor.js";
import { openDb } from "../../src/db/open.js";
import * as scenes from "../../src/db/repos/scenes.js";
import * as versions from "../../src/db/repos/versions.js";
import { publishVersion, writeBrief } from "../../src/scenes/store.js";
import { unlockTree } from "../db/helpers.js";
import { makeDraft, meta } from "../scenes/helpers.js";

const REPO_TMP = fileURLToPath(new URL("../../../../../tmp/", import.meta.url));
const probe: VolumeProbe = {
  volumeUuid: async () => "VOL-A",
  deviceId: async () => 2,
  systemDeviceId: async () => 1,
  freeBytes: async () => 100 * 1024 ** 3,
};
// Браузер подменён: настоящий ensureRenderBrowser качает Chrome (проверяется в e2e render).
const browser = async () => ({ path: "/fake/chrome-headless-shell" });
const visionOk: VisionCheck = async () => ({ ok: true, status: "ok", detail: "vision-detect 1 (/x/vision-detect)" });
const asrOk: AsrCheck = async () => ({ available: true, workerSha256: "59b7e03bf5a8b7f940b2607d357528e7120f5bb6bbe98efa70de4b39bdce1073", commit: "0456395abcdef", gpuContention: false });

let tmp: string;
beforeEach(async () => {
  await mkdir(REPO_TMP, { recursive: true });
  tmp = await mkdtemp(join(REPO_TMP, "ms-server-test-"));
});
afterEach(async () => {
  await unlockTree(tmp); // опубликованные версии read-only
  await rm(tmp, { recursive: true, force: true });
});

/** Каталог фейковых бинарников для PATH: claude, ffmpeg, ffprobe (только те, что в `only`). */
function fakeBin(opts: { only?: string[]; cost?: number; encoders?: string[]; filters?: string[] } = {}): string {
  const dir = join(tmp, `bin-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir);
  const scripts: Record<string, string> = {
    claude: [
      "#!/bin/sh",
      'if [ "$1" = "--version" ]; then echo "2.1.0 (Claude Code)"; exit 0; fi',
      // каталог запуска входа и его содержимое — для проверки cwd (F8)
      // (только встроенные команды sh: PATH — фейковый каталог)
      'out="${0%/*}/login-cwd.txt"; pwd -P > "$out"; for f in * .[!.]*; do [ -e "$f" ] && echo "$f" >> "$out"; done',
      `echo '{"type":"result","is_error":false,"result":"ok","total_cost_usd":${opts.cost ?? 0.002}}'`,
    ].join("\n"),
    ffmpeg: [
      "#!/bin/sh",
      'if [ "$1" = "-version" ]; then echo "ffmpeg version 7.1.1 Copyright"; exit 0; fi',
      `if [ "$2" = "-filters" ]; then ${(opts.filters ?? ["silencedetect", "scdet"]).map((f) => `echo " ... ${f}             A->A       x";`).join(" ")} exit 0; fi`,
      ...(opts.encoders ?? ["libx264", "aac", "prores_ks"]).map((e) => `echo " V....D ${e}             encoder"`),
    ].join("\n"),
    ffprobe: ["#!/bin/sh", 'echo "ffprobe version 7.1.1 Copyright"'].join("\n"),
  };
  for (const [name, text] of Object.entries(scripts)) {
    if (opts.only && !opts.only.includes(name)) continue;
    writeFileSync(join(dir, name), text + "\n");
    chmodSync(join(dir, name), 0o755);
  }
  return dir;
}

/**
 * S19: окружение «после ./setup» — `.deps` с ffmpeg/ffprobe из `fakeBin` и python ASR, веса в папке
 * материалов (временной). PATH — только claude, чтобы ffmpeg брался из `.deps`.
 */
function setupEnv(opts: Parameters<typeof fakeBin>[0] = {}): Record<string, string> {
  const bin = fakeBin(opts);
  const deps = join(tmp, `deps-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(deps, "ffmpeg"), { recursive: true });
  for (const n of ["ffmpeg", "ffprobe"]) {
    if (existsSync(join(bin, n))) copyFileSync(join(bin, n), join(deps, "ffmpeg", n));
  }
  mkdirSync(join(deps, "asr-venv/bin"), { recursive: true });
  writeFileSync(join(deps, "asr-venv/bin/python"), "#!/bin/sh\n");
  const materials = join(tmp, "mat", "moution-studio-materials");
  mkdirSync(join(materials, "models/asr"), { recursive: true });
  const claudeOnly = join(tmp, `path-${Math.random().toString(36).slice(2)}`);
  mkdirSync(claudeOnly);
  if (existsSync(join(bin, "claude"))) copyFileSync(join(bin, "claude"), join(claudeOnly, "claude"));
  return { PATH: claudeOnly, MS_DEPS_DIR: deps, MS_MATERIALS_ROOT: materials };
}

type Check = { name: string; ok: boolean; status: string; detail: string };
const checks = (output: string): Record<string, Check> =>
  Object.fromEntries((JSON.parse(output).checks as Check[]).map((c) => [c.name, c]));

describe("--init / --adopt / --import-slice", () => {
  it("--init creates the store, then reports ok", async () => {
    const root = join(tmp, "store");
    const r = await runDoctor(["--init"], { MS_DATA_DIR: root }, probe, browser);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.output)).toMatchObject({ ok: true, root, marker: { volume_uuid: "VOL-A" } });
  });

  it("--init without MS_DATA_DIR fails with env_missing", async () => {
    const r = await runDoctor(["--init"], {}, probe, browser);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.output)).toMatchObject({ ok: false, reason: "env_missing" });
  });

  it("--init failure is reported as StorageStatus JSON, not thrown", async () => {
    const r = await runDoctor(["--init"], { MS_DATA_DIR: join(tmp, "no/such") }, probe, browser);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.output)).toMatchObject({
      ok: false,
      reason: "not_found",
      detail: expect.stringMatching(/родительский каталог/),
    });
  });

  it("rejects unknown arguments with exit 2", async () => {
    const r = await runDoctor(["--frobnicate"], {}, probe, browser);
    expect(r.code).toBe(2);
    expect(r.output).toMatch(/--init/);
  });

  it("--import-slice регистрирует версии среза в studio.db", async () => {
    const root = join(tmp, "store");
    await runDoctor(["--init"], { MS_DATA_DIR: root }, probe, browser);
    const status = { ok: true as const, root, marker: {} as never, freeBytes: 1 };
    await writeBrief(root, "scn_S", { prompt: "срез", settings: defaultSettings(), created_at: "2026-10-20T00:00:00.000Z" });
    const v = await publishVersion(await makeDraft(root, { runId: "run_1", attempt: 1, sceneId: "scn_S" }), meta("scn_S"), async () => status);

    const r = await runDoctor(["--import-slice"], { MS_DATA_DIR: root }, probe, browser);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.output)).toMatchObject({ ok: true, import: { imported: 1, skipped: [] } });
    const db = openDb(root);
    try {
      expect(versions.get(db, v.versionId)).toMatchObject({ number: 1, status: "ready" });
      expect(scenes.get(db, "scn_S")!.current_version_id).toBe(v.versionId);
    } finally {
      db.close();
    }
    const again = await runDoctor(["--import-slice"], { MS_DATA_DIR: root }, probe, browser);
    expect(JSON.parse(again.output)).toMatchObject({ ok: true, import: { imported: 0 } });
  });

  it("--import-slice без хранилища — отказ без создания БД", async () => {
    const root = join(tmp, "nope");
    const r = await runDoctor(["--import-slice"], { MS_DATA_DIR: root }, probe, browser);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.output)).toMatchObject({ ok: false, reason: "not_found" });
    expect(existsSync(root)).toBe(false);
  });
});

describe("полный doctor (03 §7)", () => {
  async function store(): Promise<string> {
    const root = join(tmp, "store");
    await runDoctor(["--init"], { MS_DATA_DIR: root }, probe, browser);
    return root;
  }

  it("всё в порядке: node, claude (версия и вход haiku), ffmpeg/ffprobe и энкодеры, KB, хранилище, Chrome, БД, owner-lock → код 0", async () => {
    const root = await store();
    const r = await runDoctor(["--json"], { MS_DATA_DIR: root, ...setupEnv() }, probe, browser, asrOk, visionOk);
    const c = checks(r.output);
    // node тестов — из nvm, не из .deps: единственное предупреждение строки deps (S19)
    expect(Object.keys(c)).toEqual(["node", "claude", "claude_login", "ffmpeg", "ffprobe", "encoders", "filters", "asr", "vision", "kb", "storage", "chrome", "db", "owner_lock", "deps"]);
    for (const x of Object.values(c)) if (x.name !== "deps") expect(x, x.name).toMatchObject({ ok: true, status: "ok" });
    expect(c.deps).toMatchObject({ ok: true, status: "warning" });
    expect(c.deps!.detail).toMatch(/^не из \.deps: node \(/);
    expect(c.deps!.detail).not.toMatch(/ffmpeg|python|local_models/);
    expect(c.deps!.detail).toContain("./setup");
    expect(c.ffmpeg!.detail).toMatch(/^ffmpeg version 7\.1\.1 .*\/deps-\w+\/ffmpeg\/ffmpeg\)$/);
    expect(c.claude!.detail).toContain("2.1.0");
    expect(c.claude_login!.detail).toMatch(/\$0\.002/);
    expect(c.chrome!.detail).toBe("/fake/chrome-headless-shell");
    expect(r.code).toBe(0);
    expect(JSON.parse(r.output)).toMatchObject({ ok: true, storage: { ok: true, root } });
    // без --json — таблица
    expect(c.asr!.detail).toMatch(/whisper-large-v3-turbo.*sha256 59b7e03bf5a8.*ai-platform 0456395/);
    const t = await runDoctor([], { MS_DATA_DIR: root, ...setupEnv() }, probe, browser, asrOk, visionOk);
    expect(t.code).toBe(0);
    expect(t.output).toMatch(/^warning\s+deps\s+/m);
    expect(t.output).toMatch(/^ok\s+node\s+/m);
    expect(t.output).toMatch(/^ok\s+owner_lock\s+/m);
  });

  it("S19: до ./setup — ffmpeg из PATH и прежний python ASR работают, но doctor предупреждает (код 0)", async () => {
    const root = await store();
    const home = join(tmp, "home");
    const legacy = join(home, ".local/share/montage/mlx-audio-0.5.8/.venv/bin/python");
    mkdirSync(join(legacy, ".."), { recursive: true });
    writeFileSync(legacy, "#!/bin/sh\n");
    const env = { MS_DATA_DIR: root, PATH: fakeBin(), HOME: home, MS_DEPS_DIR: join(tmp, "no-deps") };
    const r = await runDoctor(["--json"], env, probe, browser, asrOk, visionOk);
    const c = checks(r.output);
    expect(c.ffmpeg).toMatchObject({ ok: true, status: "ok" });
    expect(c.deps).toMatchObject({ ok: true, status: "warning" });
    expect(c.deps!.detail).toMatch(/ffmpeg \(PATH .*\/ffmpeg\)/);
    expect(c.deps!.detail).toMatch(/ffprobe \(PATH /);
    expect(c.deps!.detail).toContain(`python ASR (${legacy})`);
    expect(r.code).toBe(0);
  });

  it("вход Claude запускается в пустом временном каталоге, не в cwd процесса; каталог убран (F8)", async () => {
    const root = await store();
    const bin = fakeBin();
    await runDoctor(["--json"], { MS_DATA_DIR: root, PATH: bin }, probe, browser);
    const [cwd, ...entries] = readFileSync(join(bin, "login-cwd.txt"), "utf8").trim().split("\n");
    expect(cwd).not.toBe(realpathSync(process.cwd()));
    expect(cwd!.startsWith(realpathSync(tmpdir()))).toBe(true);
    expect(entries).toEqual([]);
    expect(existsSync(cwd!)).toBe(false);
  });

  it("фейковый PATH без claude → строка claude missing, вход не проверяется, код 1", async () => {
    const root = await store();
    const r = await runDoctor(["--json"], { MS_DATA_DIR: root, PATH: fakeBin({ only: ["ffmpeg", "ffprobe"] }) }, probe, browser);
    const c = checks(r.output);
    expect(c.claude).toMatchObject({ ok: false, status: "missing" });
    expect(c.claude_login).toMatchObject({ ok: false, status: "skipped" });
    expect(c.ffmpeg!.ok).toBe(true);
    expect(r.code).toBe(1);
    expect((await runDoctor([], { MS_DATA_DIR: root, PATH: fakeBin({ only: ["ffmpeg", "ffprobe"] }) }, probe, browser)).output).toMatch(/^missing\s+claude\s+/m);
  });

  it("вход Claude дороже $0.01 или ошибка → claude_login не ok; нет энкодера prores_ks → encoders не ok", async () => {
    const root = await store();
    const r = await runDoctor(["--json"], { MS_DATA_DIR: root, PATH: fakeBin({ cost: 0.05, encoders: ["libx264", "aac"] }) }, probe, browser);
    const c = checks(r.output);
    expect(c.claude_login).toMatchObject({ ok: false, status: "expensive" });
    expect(c.encoders).toMatchObject({ ok: false, status: "missing", detail: expect.stringContaining("prores_ks") });
    expect(r.code).toBe(1);
  });

  it("нет фильтра scdet (Phase 2–3) → filters не ok, код 1", async () => {
    const root = await store();
    const r = await runDoctor(["--json"], { MS_DATA_DIR: root, PATH: fakeBin({ filters: ["silencedetect"] }) }, probe, browser);
    const c = checks(r.output);
    expect(c.filters).toMatchObject({ ok: false, status: "missing", detail: expect.stringContaining("scdet") });
    expect(r.code).toBe(1);
  });

  it("ASR (Task 26): контракт воркера изменился → asr не ok с причиной, код 1; порт 8780 занят — ok с пометкой", async () => {
    const root = await store();
    const changed: AsrCheck = async () => ({ available: false, reason: "asr_contract_changed", detail: "sha256 asr_worker.py = dead…" });
    const r = await runDoctor(["--json"], { MS_DATA_DIR: root, PATH: fakeBin() }, probe, browser, changed);
    expect(checks(r.output).asr).toMatchObject({ ok: false, status: "asr_contract_changed", detail: expect.stringContaining("dead") });
    expect(r.code).toBe(1);
    const busy: AsrCheck = async () => ({ available: true, workerSha256: "a".repeat(64), commit: "0456395", gpuContention: true });
    const r2 = await runDoctor(["--json"], { MS_DATA_DIR: root, PATH: fakeBin() }, probe, browser, busy);
    expect(checks(r2.output).asr).toMatchObject({ ok: true, detail: expect.stringContaining("8780") });
  });

  it("vision-detect (Task 30, ревью m8): не собран → vision degraded с подсказкой, не ошибка (код 0); сломан → ошибка, код 1", async () => {
    const root = await store();
    const missing: VisionCheck = async () => ({ ok: true, status: "degraded", detail: "нет /x/vision-detect — анализ видеоряда в режиме llm_only; собрать: make install или npm run build:vision" });
    const r = await runDoctor(["--json"], { MS_DATA_DIR: root, PATH: fakeBin() }, probe, browser, asrOk, missing);
    expect(checks(r.output).vision).toMatchObject({ ok: true, status: "degraded", detail: expect.stringContaining("build:vision") });
    expect(r.code).toBe(0);
    const t = await runDoctor([], { MS_DATA_DIR: root, PATH: fakeBin() }, probe, browser, asrOk, missing);
    expect(t.output).toMatch(/^degraded\s+vision/m);
    expect(t.output).toMatch(/всё в порядке \(с ограничениями: vision\)/);
    const broken: VisionCheck = async () => ({ ok: false, status: "error", detail: "/x/vision-detect --version: killed" });
    const b = await runDoctor(["--json"], { MS_DATA_DIR: root, PATH: fakeBin() }, probe, browser, asrOk, broken);
    expect(checks(b.output).vision).toMatchObject({ ok: false, status: "error" });
    expect(b.code).toBe(1);
  });

  it("checkVisionBin: нет бинарника — degraded (ok: true) с подсказкой, а не missing", async () => {
    const v = await checkVisionBin(join(await store(), "no-such-vision-detect"));
    expect(v).toMatchObject({ ok: true, status: "degraded", detail: expect.stringContaining("llm_only") });
  });

  it("S18: хранилище на SSD вне папки материалов → materials warning с новым путём (код 0); внутри — строки нет", async () => {
    const ssd = join(tmp, "ssd");
    const materials = join(ssd, "moution-studio-materials");
    await mkdir(join(materials, "store"), { recursive: true });
    const old = join(ssd, "MotionStudio");
    // --init / --adopt вне папки материалов на её SSD — отказ, каталог не создаётся (ревью S18, I1)
    for (const mode of ["--init", "--adopt"]) {
      const r = await runDoctor([mode], { MS_DATA_DIR: old, MS_MATERIALS_ROOT: materials }, probe, browser);
      expect(r.code, mode).toBe(1);
      expect(JSON.parse(r.output), mode).toMatchObject({ ok: false, reason: "outside_materials", detail: expect.stringContaining(join(materials, "store")) });
      expect(existsSync(old), mode).toBe(false);
    }
    // «старое» хранилище для проверки warning: создано, пока корень материалов — по умолчанию (tmp не на том SSD)
    await runDoctor(["--init"], { MS_DATA_DIR: old }, probe, browser);
    const env = { MS_DATA_DIR: old, MS_MATERIALS_ROOT: materials, PATH: fakeBin() };
    const r = await runDoctor(["--json"], env, probe, browser, asrOk, visionOk);
    const c = checks(r.output);
    expect(c.materials).toMatchObject({ ok: true, status: "warning", detail: expect.stringContaining(join(materials, "store")) });
    expect(c.storage).toMatchObject({ ok: true, status: "ok" });
    expect(r.code).toBe(0);
    const t = await runDoctor([], env, probe, browser, asrOk, visionOk);
    expect(t.output).toMatch(/^warning\s+materials\s+/m);
    expect(t.output).toMatch(/предупреждения: materials/);

    const inside = join(materials, "store", "s");
    expect((await runDoctor(["--init"], { MS_DATA_DIR: inside, MS_MATERIALS_ROOT: materials }, probe, browser)).code).toBe(0);
    const ok = checks((await runDoctor(["--json"], { ...env, MS_DATA_DIR: inside }, probe, browser, asrOk, visionOk)).output);
    expect(ok.materials).toBeUndefined();
  });

  it("S18 (ревью M3): относительный MS_MATERIALS_ROOT → строка error materials, а не исключение", async () => {
    const root = await store();
    const r = await runDoctor(["--json"], { MS_DATA_DIR: root, MS_MATERIALS_ROOT: "rel/dir", PATH: fakeBin() }, probe, browser, asrOk, visionOk);
    expect(checks(r.output).materials).toMatchObject({ ok: false, status: "error", detail: expect.stringContaining("MS_MATERIALS_ROOT") });
    expect(r.code).toBe(1);
  });

  it("S18: --init на системном томе по-прежнему отказ (хранилище не создаётся)", async () => {
    const sys: VolumeProbe = { ...probe, deviceId: async () => 1 };
    const root = join(tmp, "sys-store");
    const r = await runDoctor(["--init"], { MS_DATA_DIR: root }, sys, browser);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.output)).toMatchObject({ ok: false, reason: "system_volume" });
    expect(existsSync(root)).toBe(false);
  });

  it("без MS_DATA_DIR → storage env_missing, БД и lock пропущены, код 1", async () => {
    const r = await runDoctor(["--json"], { PATH: fakeBin() }, probe, browser);
    const c = checks(r.output);
    expect(c.storage).toMatchObject({ ok: false, status: "env_missing" });
    expect(c.db).toMatchObject({ ok: false, status: "skipped" });
    expect(c.owner_lock).toMatchObject({ ok: false, status: "skipped" });
    expect(r.code).toBe(1);
  });

  it("owner-lock занят (сервер запущен) → busy с pid; браузер недоступен → chrome не ok", async () => {
    const root = await store();
    const lock = await acquireOwnerLock(root, "server");
    try {
      const broken = async () => {
        throw new Error("download blocked");
      };
      const r = await runDoctor(["--json"], { MS_DATA_DIR: root, PATH: fakeBin() }, probe, broken);
      const c = checks(r.output);
      expect(c.owner_lock).toMatchObject({ ok: false, status: "busy", detail: expect.stringContaining(String(process.pid)) });
      expect(c.chrome).toMatchObject({ ok: false, status: "error", detail: "download blocked" });
      expect(r.code).toBe(1);
    } finally {
      await lock.release();
    }
  });

  it("studio.db: quick_check на существующей базе; новой базы ещё нет — ok без создания файла", async () => {
    const root = await store();
    const r1 = checks((await runDoctor(["--json"], { MS_DATA_DIR: root, PATH: fakeBin() }, probe, browser)).output);
    expect(r1.db).toMatchObject({ ok: true, status: "ok", detail: expect.stringMatching(/ещё нет/) });
    expect(existsSync(join(root, "studio.db"))).toBe(false);
    openDb(root).close();
    const r2 = checks((await runDoctor(["--json"], { MS_DATA_DIR: root, PATH: fakeBin() }, probe, browser)).output);
    expect(r2.db).toMatchObject({ ok: true, status: "ok", detail: "quick_check ok" });
  });
});
