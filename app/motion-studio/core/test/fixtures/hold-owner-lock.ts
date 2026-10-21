// Фикстура: отдельный процесс берёт owner-lock хранилища $1, пишет "locked" и ждёт,
// пока его не убьют. release не зовёт никогда.
// Режим `drop-gc` ($2, нужен --expose-gc): ссылку на lock не держит и гоняет сборщик
// мусора — проверка, что lock не снимается при GC.
import { acquireOwnerLock } from "../../src/run/owner-lock.js";

const root = process.argv[2];
if (!root) throw new Error("usage: hold-owner-lock <root> [drop-gc]");

if (process.argv[3] === "drop-gc") {
  await acquireOwnerLock(root, "server");
  const gc = (globalThis as { gc?: () => void }).gc;
  if (!gc) throw new Error("drop-gc требует --expose-gc");
  for (let i = 0; i < 5; i++) {
    gc();
    await new Promise((r) => setImmediate(r));
  }
  process.stdout.write("locked\n");
  setInterval(() => gc(), 50);
} else {
  const lock = await acquireOwnerLock(root, "server");
  process.stdout.write("locked\n");
  // ссылка на lock живёт до конца процесса
  setInterval(() => void lock, 1 << 30);
}
