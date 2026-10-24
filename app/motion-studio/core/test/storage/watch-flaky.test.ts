// H2: настоящий checkStorage на настоящем корне, проба тома медленная и сбоящая (как
// diskutil под нагрузкой). Ложного offline нет; настоящий rename корня — offline на
// первом же тике, как до H2.
import { rename } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { type VolumeProbe, checkStorage, initStore } from "../../src/storage/guard.js";
import { watchStorage } from "../../src/storage/watch.js";
import { fakeProbe, makeTmp, removeTmp } from "../helpers.js";

// 100 мс: дедлайн 300 мс переживает fsync пробной записи под нагрузкой ./check + e2e
const INTERVAL = 100;
let tmp: string;
let root: string;

beforeEach(async () => {
  tmp = await makeTmp();
  root = join(tmp, "store");
  await initStore(root, fakeProbe(), { allowSystemDisk: true });
});
afterEach(() => removeTmp(tmp));

/** Каждая третья проба падает, каждая третья отвечает дольше дедлайна сторожа. */
function flakyProbe(): VolumeProbe & { calls: () => number } {
  const base = fakeProbe();
  let n = 0;
  return {
    ...base,
    calls: () => n,
    async volumeUuid(p) {
      const i = n++;
      if (i % 3 === 0) throw new Error("Command failed: diskutil info -plist");
      if (i % 3 === 1) await new Promise((r) => setTimeout(r, 4 * INTERVAL));
      return base.volumeUuid(p);
    },
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

it("a slow and failing volume probe never takes a live store offline", async () => {
  const probe = flakyProbe();
  const w = watchStorage(() => checkStorage({ MS_DATA_DIR: root }, probe), INTERVAL);
  // по числу проверок, а не по времени: под нагрузкой тики редеют
  for (const end = Date.now() + 8000; probe.calls() < 15 && !w.signal.aborted && Date.now() < end; ) await sleep(INTERVAL);
  w.stop();
  expect(probe.calls()).toBeGreaterThanOrEqual(15);
  expect(w.signal.aborted).toBe(false);
  expect(w.lastFailure()).toBeUndefined();
});

it("renaming the root still goes offline on the next tick (not_found is conclusive)", async () => {
  const probe = flakyProbe();
  const w = watchStorage(() => checkStorage({ MS_DATA_DIR: root }, probe), INTERVAL);
  await sleep(5 * INTERVAL);
  expect(w.signal.aborted).toBe(false);
  // подписка ДО rename: под нагрузкой тик сторожа успевает сработать, пока ждём rename, и
  // событие abort (одноразовое) уходит раньше подписки — тест висел до таймаута
  const aborted = new Promise<void>((r) => w.signal.addEventListener("abort", () => r(), { once: true }));
  const t = Date.now();
  await rename(root, `${root}.gone`);
  await sleep(5 * INTERVAL); // нагрузка между rename и ожиданием: abort уже мог случиться
  await aborted;
  // окно: проверка в полёте может дойти до дедлайна (3 интервала) — она неокончательна,
  // следующий тик (≤ интервала) видит, что корня нет; запас 1 с — на нагрузку ./check
  expect(Date.now() - t).toBeLessThan(3 * INTERVAL + INTERVAL + 1000);
  expect(w.lastFailure()).toMatchObject({ ok: false, reason: "not_found" });
});
