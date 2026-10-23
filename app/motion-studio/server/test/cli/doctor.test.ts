import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { acquireOwnerLock, type VolumeProbe } from "@ms/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultSettings } from "@ms/contracts";
import { runDoctor } from "../../src/cli/doctor.js";
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
function fakeBin(opts: { only?: string[]; cost?: number; encoders?: string[] } = {}): string {
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
    const r = await runDoctor(["--json"], { MS_DATA_DIR: root, PATH: fakeBin() }, probe, browser);
    const c = checks(r.output);
    expect(Object.keys(c)).toEqual(["node", "claude", "claude_login", "ffmpeg", "ffprobe", "encoders", "kb", "storage", "chrome", "db", "owner_lock"]);
    for (const x of Object.values(c)) expect(x, x.name).toMatchObject({ ok: true, status: "ok" });
    expect(c.claude!.detail).toContain("2.1.0");
    expect(c.claude_login!.detail).toMatch(/\$0\.002/);
    expect(c.chrome!.detail).toBe("/fake/chrome-headless-shell");
    expect(r.code).toBe(0);
    expect(JSON.parse(r.output)).toMatchObject({ ok: true, storage: { ok: true, root } });
    // без --json — таблица
    const t = await runDoctor([], { MS_DATA_DIR: root, PATH: fakeBin() }, probe, browser);
    expect(t.code).toBe(0);
    expect(t.output).toMatch(/^ok\s+node\s+/m);
    expect(t.output).toMatch(/^ok\s+owner_lock\s+/m);
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
