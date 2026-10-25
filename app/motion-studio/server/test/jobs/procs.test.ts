// Уборка процессов тестов восстановления: фикстура, запущенная мимо track() (дочерним
// «сервером»), не должна переживать тест.
import { spawn } from "node:child_process";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { procInfo } from "@ms/core";
import { makeTmp, removeTmp } from "../qa/helpers.js";
import { ORPHAN_RENDER, killStrays, readPid, waitFor } from "./procs.js";

let tmp: string;
beforeEach(async () => (tmp = await makeTmp()));
afterEach(() => removeTmp(tmp));

it("killStrays добивает неотслеженную фикстуру: лидера группы и внука, игнорирующего SIGTERM", async () => {
  const pidFile = join(tmp, "grandchild.pid");
  const child = spawn(ORPHAN_RENDER, [pidFile], { detached: true, stdio: "ignore" });
  child.unref();
  const leader = child.pid!;
  const grandchild = await waitFor(() => readPid(pidFile), "pid внука");

  killStrays(tmp);

  await waitFor(async () => ((await procInfo(leader)) || (await procInfo(grandchild)) ? undefined : true), "смерть фикстуры", 5_000);
});

it("killStrays: каталог — абсолютный и не короче 16 знаков, иначе ошибка (не бьёт по всем процессам)", () => {
  expect(() => killStrays("")).toThrow();
  expect(() => killStrays("/tmp")).toThrow();
  expect(() => killStrays("relative/dir/with/long/name")).toThrow();
});

it("killStrays: совпадение по границе пути — соседний каталог с тем же префиксом не задет", async () => {
  // путь соседа — $0 оболочки: виден в командной строке ps (`sleep` с лишним аргументом сразу выходит)
  const child = spawn("/bin/sh", ["-c", "sleep 30; :", `${tmp}-sibling/x`], { detached: true, stdio: "ignore" });
  child.unref();
  try {
    await waitFor(async () => ((await procInfo(child.pid!)) ? true : undefined), "запуск соседа");
    killStrays(tmp);
    await new Promise((r) => setTimeout(r, 100));
    expect(await procInfo(child.pid!)).toBeDefined();
  } finally {
    process.kill(-child.pid!, "SIGKILL");
  }
});

it("killStrays не трогает процессы вне каталога", async () => {
  const child = spawn("/bin/sleep", ["30"], { detached: true, stdio: "ignore" });
  child.unref();
  killStrays(tmp);
  await new Promise((r) => setTimeout(r, 100));
  expect(await procInfo(child.pid!)).toBeDefined();
  process.kill(child.pid!, "SIGKILL");
});
