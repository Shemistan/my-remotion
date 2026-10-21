// Нагрузочный тест сторожа хранилища (H2): N сторожей `watchStorage` на настоящем
// `checkStorage` + `macosProbe` крутятся `--secs` секунд под нагрузкой CPU (процессы `yes`),
// диска (запись `dd` в каталог `--io-dir`) и шторма `diskutil` (параллельные вызовы, как от
// соседних задач). Диск подключён всё время, поэтому любой offline — ложный.
// Итог — JSON; код выхода 1, если ложных offline больше нуля.
//
// Запуск из app/motion-studio (MS_DATA_DIR — инициализированное хранилище на SSD):
//   MS_DATA_DIR="/Volumes/External SSD/MotionStudio" ./scripts/with-node.sh npx tsx scripts/storage-load-test.mts
//   ... scripts/storage-load-test.mts --secs 120 --watchers 16 --interval 2000 --cpu 16 --diskutil 40
//   ... scripts/storage-load-test.mts --legacy   # поведение до H2: diskutil каждую проверку, 5 с, offline с первого отказа
//
// В хранилище пишет только checkStorage (свой файл пробной записи); нагрузка диска — в
// `--io-dir` (по умолчанию os.tmpdir()), файл удаляется в конце.
import { type ChildProcess, execFile, spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  INCONCLUSIVE_LIMIT,
  type StorageStatus,
  type VolumeProbe,
  checkStorage,
  createMacosProbe,
  isInconclusive,
  macosProbe,
  watchStorage,
} from "../core/src/index.ts";

const args = process.argv.slice(2);
const opt = (name: string, def: number): number => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const SECS = opt("secs", 60);
const WATCHERS = opt("watchers", 8);
const INTERVAL = opt("interval", 10_000); // как у сервера и конвейера
const CPU = opt("cpu", 12);
const DISKUTIL = opt("diskutil", 40);
const IO = opt("io", 2);
const LEGACY = args.includes("--legacy");
const ioDirArg = args.indexOf("--io-dir");
const IO_DIR = ioDirArg >= 0 ? args[ioDirArg + 1]! : tmpdir();
const root = process.env.MS_DATA_DIR?.trim();
if (!root) {
  console.error("storage-load-test: задай MS_DATA_DIR (инициализированное хранилище)");
  process.exit(2);
}

const run = promisify(execFile);
/** До H2: VolumeUUID не кэшировался, diskutil с таймаутом 5 с на каждой проверке. */
const legacyProbe: VolumeProbe = createMacosProbe({
  diskutilInfo: async (mount) => (await run("diskutil", ["info", "-plist", mount], { timeout: 5000, killSignal: "SIGKILL" })).stdout,
  mountIdentity: async () => Math.random().toString(),
});
/** Время шагов пробы: максимум по методу (остаток проверки — stat корня, маркер, пробная запись). */
const stepMax: Record<string, number> = {};
const timed = (base: VolumeProbe): VolumeProbe => {
  const wrap = <A extends unknown[], R>(name: string, fn: (...a: A) => Promise<R>) => async (...a: A): Promise<R> => {
    const s = Date.now();
    try {
      return await fn(...a);
    } finally {
      stepMax[name] = Math.max(stepMax[name] ?? 0, Date.now() - s);
    }
  };
  return {
    volumeUuid: wrap("volumeUuid", base.volumeUuid),
    deviceId: wrap("deviceId", base.deviceId),
    systemDeviceId: wrap("systemDeviceId", base.systemDeviceId),
    freeBytes: wrap("freeBytes", base.freeBytes),
  };
};
const probe = timed(LEGACY ? legacyProbe : macosProbe);
const env = { MS_DATA_DIR: root };

const first = await checkStorage(env, probe);
if (!first.ok) {
  console.error(`storage-load-test: хранилище не в порядке до нагрузки: ${first.reason}: ${first.detail}`);
  process.exit(2);
}
const storeId = first.marker.store_id;

// --- нагрузка ---
const children: ChildProcess[] = [];
for (let i = 0; i < CPU; i++) children.push(spawn("yes", [], { stdio: "ignore" }));
const ioFiles: string[] = [];
for (let i = 0; i < IO; i++) {
  const f = join(IO_DIR, `ms-storage-load-${process.pid}-${i}.bin`);
  ioFiles.push(f);
  // бесконечная перезапись 2 ГиБ кусками по 1 МиБ
  children.push(spawn("sh", ["-c", `while :; do dd if=/dev/zero of="${f}" bs=1m count=2048 2>/dev/null; done`], { stdio: "ignore" }));
}
// шторм diskutil — отдельными процессами, как от соседних задач (не в цикле событий сторожа)
for (let i = 0; i < DISKUTIL; i++) {
  children.push(spawn("sh", ["-c", 'while :; do diskutil info -plist "$1" >/dev/null 2>&1; done', "storm", root], { stdio: "ignore" }));
}
const deadline = Date.now() + SECS * 1000;
// сэмплер: сколько отвечает diskutil под этой нагрузкой (раз в 2 с)
let sampleMaxMs = 0;
let samples = 0;
const sampler = (async () => {
  while (Date.now() < deadline) {
    const s = Date.now();
    await run("diskutil", ["info", "-plist", root], { timeout: 120_000 }).catch(() => undefined);
    samples++;
    sampleMaxMs = Math.max(sampleMaxMs, Date.now() - s);
    await new Promise((r) => setTimeout(r, 2000));
  }
})();

// --- сторожа ---
let checks = 0;
let inconclusive = 0;
let maxCheckMs = 0;
const falseOffline: string[] = [];
const counted = async (): Promise<StorageStatus> => {
  const s = Date.now();
  const st = await checkStorage(env, probe, storeId);
  maxCheckMs = Math.max(maxCheckMs, Date.now() - s);
  checks++;
  if (isInconclusive(st)) inconclusive++;
  return st;
};
const watchers = new Set<ReturnType<typeof watchStorage>>();
const startWatcher = (): void => {
  const w = watchStorage(counted, INTERVAL, LEGACY ? { inconclusiveLimit: 1 } : {});
  watchers.add(w);
  w.signal.addEventListener("abort", () => {
    watchers.delete(w);
    const f = w.lastFailure();
    falseOffline.push(f && !f.ok ? `${f.reason}: ${f.detail.slice(0, 200)}` : String(w.signal.reason));
    if (Date.now() < deadline) startWatcher(); // считаем дальше
  }, { once: true });
};
for (let i = 0; i < WATCHERS; i++) startWatcher();

const cleanup = (): void => {
  for (const c of children) c.kill("SIGKILL");
  for (const f of ioFiles) rmSync(f, { force: true });
};
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});

await new Promise((r) => setTimeout(r, SECS * 1000));
for (const w of watchers) w.stop();
await sampler;
cleanup();

const reasons: Record<string, number> = {};
for (const r of falseOffline) reasons[r] = (reasons[r] ?? 0) + 1;
console.log(JSON.stringify({
  mode: LEGACY ? "legacy (до H2)" : "H2",
  secs: SECS, watchers: WATCHERS, intervalMs: INTERVAL, inconclusiveLimit: LEGACY ? 1 : INCONCLUSIVE_LIMIT,
  load: { yes: CPU, ddWriters: IO, ioDir: IO_DIR, diskutilStorm: DISKUTIL, diskutilSamples: samples, diskutilMaxMs: sampleMaxMs },
  checks, inconclusive, maxCheckMs, stepMaxMs: stepMax,
  falseOffline: falseOffline.length,
  reasons,
}, null, 2));
process.exit(falseOffline.length > 0 ? 1 : 0);
