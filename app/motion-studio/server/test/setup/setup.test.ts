// S19: ./setup — проверки системы (функции tools/setup/lib.sh), `--check` ничего не пишет,
// with-node.sh берёт Node и ffmpeg из .deps, список исходников KB совпадает с repositories.json.
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const REPO = fileURLToPath(new URL("../../../../../", import.meta.url)).replace(/\/$/, "");
const LIB = join(REPO, "tools/setup/lib.sh");
const REPO_TMP = join(REPO, "tmp");

let tmp: string;
let stubs: string;
beforeEach(async () => {
  await mkdir(REPO_TMP, { recursive: true });
  tmp = await mkdtemp(join(REPO_TMP, "ms-setup-test-"));
  stubs = join(tmp, "stubs");
  mkdirSync(stubs);
});
afterEach(async () => rm(tmp, { recursive: true, force: true }));

/** Исполняемая заглушка команды в каталоге stubs (он первым в PATH). */
const stub = (name: string, body: string) => {
  writeFileSync(join(stubs, name), `#!/bin/sh\n${body}\n`);
  chmodSync(join(stubs, name), 0o755);
};
const PATH = () => `${stubs}:/usr/bin:/bin:/usr/sbin:/sbin`;

/** `. lib.sh; <fn>` в sh с заданным env; вывод — stdout+stderr. */
function lib(fn: string, env: Record<string, string> = {}) {
  const r = spawnSync("/bin/sh", ["-c", `. "${LIB}"; ${fn}`], { env: { PATH: PATH(), HOME: tmp, ...env }, encoding: "utf8" });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

describe("проверки системы (lib.sh)", () => {
  it("платформа: только Darwin arm64", () => {
    stub("uname", 'echo "Darwin x86_64"');
    expect(lib("ms_check_platform")).toMatchObject({ code: 1, out: expect.stringContaining("Apple Silicon") });
    stub("uname", 'echo "Darwin arm64"');
    expect(lib("ms_check_platform")).toMatchObject({ code: 0, out: expect.stringContaining("macOS arm64") });
  });

  it("Command Line Tools: нет xcode-select -p → подсказка xcode-select --install", () => {
    stub("xcode-select", "exit 2");
    const r = lib("ms_check_clt");
    expect(r.code).toBe(1);
    expect(r.out).toContain("xcode-select --install");
  });

  it("claude: нет в PATH / не залогинен → подсказка claude login; залогинен → ok", () => {
    // PATH без claude: только заглушки и системные каталоги (claude ставится в ~/.local/bin)
    expect(lib("ms_check_claude")).toMatchObject({ code: 1, out: expect.stringContaining("claude login") });
    stub("claude", `echo '{"loggedIn": false}'; exit 1`);
    expect(lib("ms_check_claude")).toMatchObject({ code: 1, out: expect.stringContaining("claude login") });
    stub("claude", `echo '{\n  "loggedIn": true,\n  "authMethod": "claude.ai"\n}'`);
    expect(lib("ms_check_claude")).toMatchObject({ code: 0, out: expect.stringContaining("вход выполнен") });
  });

  it("SSD: нет тома → ошибка; каталог на системном диске → ошибка; MS_ALLOW_SYSTEM_DISK=1 (тесты) → ok", () => {
    const materials = join(tmp, "ssd", "moution-studio-materials");
    expect(lib("ms_check_ssd", { MS_MATERIALS_ROOT: materials })).toMatchObject({ code: 1, out: expect.stringContaining("SSD не подключён") });
    mkdirSync(join(tmp, "ssd"));
    expect(lib("ms_check_ssd", { MS_MATERIALS_ROOT: materials })).toMatchObject({ code: 1, out: expect.stringContaining("на системном диске") });
    expect(lib("ms_check_ssd", { MS_MATERIALS_ROOT: materials, MS_ALLOW_SYSTEM_DISK: "1" }).code).toBe(0);
    // проверка ничего не создаёт
    expect(existsSync(materials)).toBe(false);
  });

  it("корень материалов по умолчанию — как в core (materials.ts)", () => {
    expect(lib("ms_materials_root").out.trim()).toBe("/Volumes/External SSD/moution-studio-materials");
    expect(lib("ms_ssd_root").out.trim()).toBe("/Volumes/External SSD");
  });

  it("ms_fetch: неверный sha256 — отказ, файл не остаётся", () => {
    const src = join(tmp, "src.bin");
    writeFileSync(src, "data");
    const dest = join(tmp, "dl", "x.bin");
    const r = lib(`ms_fetch "file://${src}" "${dest}" ${"0".repeat(64)}`);
    expect(r.code).toBe(1);
    expect(r.out).toContain("sha256 не совпал");
    expect(existsSync(dest)).toBe(false);
    expect(existsSync(`${dest}.part`)).toBe(false);
    const sha = "3a6eb0790f39ac87c94f3856b2dd2c5d110e6811602261a9a923d3bb23adc8b7";
    expect(lib(`ms_fetch "file://${src}" "${dest}" ${sha}`).code).toBe(0);
    expect(readFileSync(dest, "utf8")).toBe("data");
  });
});

describe("шаги установки (lib.sh, S19 fix)", () => {
  it("хранилище на системном томе → отказ до записи; на «SSD» (MS_ALLOW_SYSTEM_DISK=1) → ok", () => {
    const store = join(tmp, "sys", "store");
    const r = lib(`ms_check_not_system_disk "${store}" "хранилище (MS_DATA_DIR)"`);
    expect(r.code).toBe(1);
    expect(r.out).toContain("на системном диске");
    expect(existsSync(join(tmp, "sys"))).toBe(false);
    expect(lib(`ms_check_not_system_disk "${store}" x`, { MS_ALLOW_SYSTEM_DISK: "1" }).code).toBe(0);
  });

  it("KB: каталог без .git → отказ с сообщением, клон внутрь не кладётся; готовый клон пропускается", () => {
    const repo = join(tmp, "repo");
    mkdirSync(join(repo, "templates/a"), { recursive: true });
    writeFileSync(join(repo, "templates/a/mine.txt"), "x");
    mkdirSync(join(repo, "templates/b/.git"), { recursive: true });
    const tsv = join(tmp, "kb.tsv");
    writeFileSync(tsv, `# path\turl\tsha\ntemplates/b\tfile:///nowhere\t${"1".repeat(40)}\ntemplates/a\tfile:///nowhere\t${"0".repeat(40)}\n`);
    const r = lib(`ms_install_kb "${repo}" "${tsv}"`);
    expect(r.code).toBe(1);
    expect(r.out).toContain("есть: templates/b");
    expect(r.out).toContain("templates/a уже есть, но это не клон git");
    expect(readdirSync(join(repo, "templates/a"))).toEqual(["mine.txt"]);
    expect(readdirSync(join(repo, "templates")).sort()).toEqual(["a", "b"]);
  });

  it("./setup чистит .deps/.downloads после успешной установки и ставит окружение ASR с --require-hashes", () => {
    const src = readFileSync(join(REPO, "setup"), "utf8");
    expect(src).toMatch(/ms_step "хуки git"[^\n]*\n(#[^\n]*\n)*rm -rf "\$DL"\n/);
    expect(src).toContain("pip sync --quiet --require-hashes");
    const lock = readFileSync(join(REPO, "app/motion-studio/tools/asr-worker/requirements.lock"), "utf8");
    const pins = lock.split("\n").filter((l) => /^[a-z]/.test(l));
    expect(pins.length).toBeGreaterThan(30);
    for (const p of pins) expect(p).toMatch(/^[\w.-]+==[\w.]+ \\$/);
  });
});

describe("./setup --check", () => {
  const okStubs = () => {
    stub("uname", 'echo "Darwin arm64"');
    stub("claude", `echo '{"loggedIn": true}'`);
  };

  it("система в порядке → код 0, список «нет» по компонентам; ничего не ставит и не пишет", () => {
    okStubs();
    const materials = join(tmp, "ssd", "moution-studio-materials");
    mkdirSync(join(tmp, "ssd"));
    const deps = join(tmp, "deps");
    const r = spawnSync(join(REPO, "setup"), ["--check"], {
      env: { PATH: PATH(), HOME: tmp, MS_MATERIALS_ROOT: materials, MS_ALLOW_SYSTEM_DISK: "1", MS_DEPS_DIR: deps }, encoding: "utf8",
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/Node 22\.21\.1 .*: нет/);
    expect(r.stdout).toMatch(/ffmpeg 7\.1\.1 .*: нет/);
    expect(r.stdout).toMatch(/окружение ASR .*: нет/);
    expect(r.stdout).toMatch(/веса whisper-large-v3-turbo .*moution-studio-materials\/models\/asr\/whisper-large-v3-turbo\): нет/);
    expect(r.stdout).toMatch(/хранилище .*moution-studio-materials\/store\): нет/);
    expect(existsSync(deps)).toBe(false);
    expect(readdirSync(join(tmp, "ssd"))).toEqual([]);
  });

  it("SSD не подключён и claude не залогинен → код 1 до установки, все причины в выводе", () => {
    stub("uname", 'echo "Darwin arm64"');
    stub("claude", `echo '{"loggedIn": false}'; exit 1`);
    const deps = join(tmp, "deps");
    const r = spawnSync(join(REPO, "setup"), [], {
      env: { PATH: PATH(), HOME: tmp, MS_MATERIALS_ROOT: join(tmp, "nossd", "moution-studio-materials"), MS_DEPS_DIR: deps }, encoding: "utf8",
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("SSD не подключён");
    expect(r.stderr).toContain("claude login");
    expect(r.stdout).not.toContain("Установка");
    expect(existsSync(deps)).toBe(false);
    expect(existsSync(join(tmp, "nossd"))).toBe(false);
  });

  it("проваленная платформа + исправные CLT → код 1 (проверки не затирают общий счётчик)", () => {
    stub("uname", 'echo "Darwin x86_64"');
    stub("claude", `echo '{"loggedIn": true}'`);
    stub("xcode-select", 'echo /Library/Developer/CommandLineTools');
    for (const t of ["git", "python3", "swiftc", "curl", "unzip", "tar", "shasum", "make"]) stub(t, "exit 0");
    mkdirSync(join(tmp, "ssd"));
    const deps = join(tmp, "deps");
    const r = spawnSync(join(REPO, "setup"), ["--check"], {
      env: { PATH: PATH(), HOME: tmp, MS_MATERIALS_ROOT: join(tmp, "ssd", "moution-studio-materials"), MS_ALLOW_SYSTEM_DISK: "1", MS_DEPS_DIR: deps }, encoding: "utf8",
    });
    expect(r.stdout).toContain("git, python3, swiftc");
    expect(r.stderr).toContain("Apple Silicon");
    expect(r.status).toBe(1);
    expect(r.stdout).not.toContain("Установлено");
  });

  it("неизвестный флаг → код 2", () => {
    expect(spawnSync(join(REPO, "setup"), ["--bogus"], { encoding: "utf8" }).status).toBe(2);
  });
});

describe("with-node.sh", () => {
  it("Node и ffmpeg из .deps (MS_DEPS_DIR) раньше nvm и PATH", () => {
    const deps = join(tmp, "deps");
    const version = readFileSync(join(REPO, "app/motion-studio/.nvmrc"), "utf8").trim();
    mkdirSync(join(deps, "node/bin"), { recursive: true });
    writeFileSync(join(deps, "node/bin/node"), `#!/bin/sh\n[ "$1" = "--version" ] && echo v${version}\n`);
    chmodSync(join(deps, "node/bin/node"), 0o755);
    mkdirSync(join(deps, "ffmpeg"));
    writeFileSync(join(deps, "ffmpeg/ffmpeg"), "#!/bin/sh\n");
    chmodSync(join(deps, "ffmpeg/ffmpeg"), 0o755);
    const r = spawnSync(join(REPO, "app/motion-studio/scripts/with-node.sh"), ["/bin/sh", "-c", "command -v node; command -v ffmpeg"], {
      env: { PATH: "/usr/bin:/bin", HOME: tmp, NVM_DIR: join(tmp, "no-nvm"), MS_DEPS_DIR: deps }, encoding: "utf8",
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim().split("\n")).toEqual([join(deps, "node/bin/node"), join(deps, "ffmpeg/ffmpeg")]);
  });

  it("нет ни .deps/node, ни nvm → понятная ошибка с ./setup", () => {
    const r = spawnSync(join(REPO, "app/motion-studio/scripts/with-node.sh"), ["true"], {
      env: { PATH: "/usr/bin:/bin", HOME: tmp, NVM_DIR: join(tmp, "no-nvm"), MS_DEPS_DIR: join(tmp, "none") }, encoding: "utf8",
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("./setup");
  });
});

it("исходники KB для ./setup --kb: те же пути и коммиты, что в knowledge/repositories.json, https-URL", () => {
  const repos = (JSON.parse(readFileSync(join(REPO, "knowledge/repositories.json"), "utf8")) as { repositories: { path: string; url: string; commit: string }[] }).repositories;
  const rows = readFileSync(join(REPO, "tools/setup/kb-sources.tsv"), "utf8").split("\n").filter((l) => l && !l.startsWith("#")).map((l) => l.split("\t"));
  expect(rows.map((r) => r[0])).toEqual(repos.map((r) => r.path));
  for (const [i, [, url, sha]] of rows.entries()) {
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
    expect(sha!.startsWith(repos[i]!.commit)).toBe(true);
    expect(url).toBe(repos[i]!.url.replace("git@github.com:", "https://github.com/"));
  }
});
