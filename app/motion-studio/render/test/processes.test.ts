// chrome-wrapper.sh и reapStrayRenderers без настоящего Chrome: вместо него — sh-скрипт.
import { type ChildProcess, spawn } from "node:child_process";
import { chmodSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileProcessRegistry, groupExists, procInfo, reapStale, safeMkdir } from "@ms/core";
import { afterEach, beforeEach, expect, it } from "vitest";
import { CHROME_WRAPPER } from "../src/node/browser.js";
import { BROWSER_CMD_PREFIX, findByMarker, reapStrayRenderers, settleBrowserRecords } from "../src/node/processes.js";
import { makeStore, makeTmp, removeTmp } from "./helpers.js";

let tmp: string;
let root: string;
const children: ChildProcess[] = [];

beforeEach(async () => {
  tmp = await makeTmp();
  root = await makeStore(tmp);
  await safeMkdir(root, "run/processes");
});
afterEach(async () => {
  for (const c of children.splice(0)) {
    try {
      process.kill(-c.pid!, "SIGKILL");
    } catch {
      // уже нет
    }
  }
  await removeTmp(tmp);
});

async function until(cond: () => boolean | Promise<boolean>, ms = 5000): Promise<void> {
  const end = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > end) throw new Error("условие не выполнилось");
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** Как Remotion запускает браузер: detached, env процесса. Вместо Chrome — fake-chrome.sh. */
function launchViaWrapper(args: string[], extraEnv: Record<string, string> = {}, tag = ""): { child: ChildProcess; argsOut: string } {
  const fake = join(tmp, "fake-chrome.sh");
  const argsOut = join(tmp, `args${tag}.txt`);
  writeFileSync(fake, '#!/bin/sh\nprintf "%s\\n" "$@" > "$ARGS_OUT"\nexec sleep 60\n');
  chmodSync(fake, 0o755);
  const child = spawn(CHROME_WRAPPER, args, {
    detached: true,
    stdio: "ignore",
    env: { PATH: process.env.PATH, ARGS_OUT: argsOut, MS_CHROME: fake, MS_RUN_ROOT: root, MS_RUN_ID: "run7", MS_RUN_ATTEMPT: "2", MS_BUNDLE_PORT: "3123", ...extraEnv },
  });
  children.push(child);
  return { child, argsOut };
}

it("chrome-wrapper registers Chrome in run/processes and reapStale kills it after a crash", async () => {
  const { child, argsOut } = launchViaWrapper(["about:blank", "--no-proxy-server", "--proxy-server='direct://'", "--proxy-bypass-list=*", "--user-data-dir=/x y"]);
  const pid = child.pid!;
  const file = join(root, "run/processes", `run7-a2-${pid}.json`);
  await until(() => existsSync(argsOut) && readFileSync(argsOut, "utf8").includes("--proxy-server=127.0.0.1:9"));

  const rec = JSON.parse(readFileSync(file, "utf8"));
  expect(rec).toMatchObject({ runId: "run7", attempt: 2, pid, pgid: pid });
  expect(rec.cmd.startsWith(BROWSER_CMD_PREFIX)).toBe(true);
  // startedAt совпадает с procInfo — reapStale узнает процесс после exec
  expect(rec.startedAt).toBe((await procInfo(pid))!.startedAt);
  // прокси Remotion выкинуты, сеть закрыта (и loopback, кроме порта бандла), остальные аргументы целы
  expect(readFileSync(argsOut, "utf8").trim().split("\n")).toEqual([
    "about:blank",
    "--user-data-dir=/x y",
    "--proxy-server=127.0.0.1:9",
    "--proxy-bypass-list=<-loopback>;localhost:3123;127.0.0.1:3123",
  ]);

  // сервер упал: записью Chrome занимается reapStale
  const r = await reapStale(root, "run7", { graceMs: 200, waitMs: 5000 });
  expect(r).toEqual({ clean: true, alive: [] });
  expect(groupExists(pid)).toBe(false);
  expect(readdirSync(join(root, "run/processes"))).toEqual([]);
});

it("chrome-wrapper refuses to start Chrome without a numeric MS_BUNDLE_PORT", async () => {
  const fake = join(tmp, "fake-chrome-never.sh");
  const marker = join(tmp, "started.txt");
  writeFileSync(fake, `#!/bin/sh\ntouch "${marker}"\n`);
  chmodSync(fake, 0o755);
  for (const port of ["", "80;evil", undefined]) {
    const env: Record<string, string | undefined> = { PATH: process.env.PATH, MS_CHROME: fake, MS_RUN_ROOT: root, MS_RUN_ID: "run8", MS_RUN_ATTEMPT: "1" };
    if (port !== undefined) env.MS_BUNDLE_PORT = port;
    const child = spawn(CHROME_WRAPPER, ["about:blank"], { stdio: "ignore", env });
    const code = await new Promise<number | null>((r) => child.once("exit", (c) => r(c)));
    expect(code, String(port)).not.toBe(0);
  }
  expect(existsSync(marker)).toBe(false);
});

it("settleBrowserRecords kills the Chrome group and removes the record only once it is gone", async () => {
  const { child } = launchViaWrapper(["about:blank"]);
  const pid = child.pid!;
  await until(() => existsSync(join(root, "run/processes", `run7-a2-${pid}.json`)) && readdirSync(join(root, "run/processes")).length === 1);
  await until(async () => (await procInfo(pid)) !== undefined);
  // другая попытка того же прогона не задета
  expect(await settleBrowserRecords(fileProcessRegistry(root), { runId: "run7", attempt: 1 })).toEqual([]);
  expect(readdirSync(join(root, "run/processes"))).toHaveLength(1);

  expect(await settleBrowserRecords(fileProcessRegistry(root), { runId: "run7", attempt: 2 }, 5000)).toEqual([]);
  expect(groupExists(pid)).toBe(false);
  expect(readdirSync(join(root, "run/processes"))).toEqual([]);
});

it("settleBrowserRecords with renderId leaves Chrome of a parallel render of the same attempt alive", async () => {
  // два дубля одной попытки рендерят одновременно: ref (runId, attempt) у них общий
  const a = launchViaWrapper(["about:blank"], { MS_RENDER_ID: "run7-a2-AAAAAA" }, "a");
  const b = launchViaWrapper(["about:blank"], { MS_RENDER_ID: "run7-a2-BBBBBB" }, "b");
  const recs = join(root, "run/processes");
  await until(() => readdirSync(recs).filter((n) => n.endsWith(".json") && !n.startsWith(".")).length === 2);
  await until(async () => (await procInfo(a.child.pid!)) !== undefined && (await procInfo(b.child.pid!)) !== undefined);
  const recB = JSON.parse(readFileSync(join(recs, `run7-a2-${b.child.pid}.json`), "utf8"));
  expect(recB.cmd.startsWith(`${BROWSER_CMD_PREFIX} [render=run7-a2-BBBBBB] `)).toBe(true);

  // рендер A закончился первым: его уборка не трогает Chrome рендера B
  expect(await settleBrowserRecords(fileProcessRegistry(root), { runId: "run7", attempt: 2, renderId: "run7-a2-AAAAAA" }, 5000)).toEqual([]);
  expect(groupExists(a.child.pid!)).toBe(false);
  expect(groupExists(b.child.pid!)).toBe(true);
  expect(readdirSync(recs)).toEqual([`run7-a2-${b.child.pid}.json`]);

  expect(await settleBrowserRecords(fileProcessRegistry(root), { runId: "run7", attempt: 2, renderId: "run7-a2-BBBBBB" }, 5000)).toEqual([]);
  expect(groupExists(b.child.pid!)).toBe(false);
  expect(readdirSync(recs)).toEqual([]);
});

it("reapStrayRenderers kills process groups started from <root>/run/tmp/ and nothing else", async () => {
  const runTmp = join(root, "run", "tmp", "old-a1-xyz");
  await mkdir(runTmp, { recursive: true });
  // sh остаётся в живых (не exec), его командная строка содержит путь; sleep — в той же группе
  const stray = spawn("/bin/sh", ["-c", "trap '' TERM; sleep 60; :", join(runTmp, "profile")], { detached: true, stdio: "ignore" });
  const bystander = spawn("/bin/sh", ["-c", "sleep 60; :", join(tmp, "elsewhere")], { detached: true, stdio: "ignore" });
  children.push(stray, bystander);
  await until(async () => (await findByMarker(runTmp)).length > 0);

  // SIGTERM игнорируется — дойдёт до SIGKILL после grace
  expect(await reapStrayRenderers(root, { graceMs: 300, waitMs: 5000 })).toEqual([]);
  await until(() => !groupExists(stray.pid!));
  expect(groupExists(bystander.pid!)).toBe(true);
  expect(await reapStrayRenderers(root)).toEqual([]);
});

it("findByMarker never returns our own process or our own group", async () => {
  // наша командная строка содержит путь к тестам; маркер, который точно в ней есть
  const own = process.argv.find((a) => a.includes("/")) ?? process.execPath;
  const found = await findByMarker(own);
  expect(found.find((p) => p.pid === process.pid)).toBeUndefined();
  for (const p of found) expect(p.pgid).toBeGreaterThan(1);
});
