// Фикстура: отдельный процесс берёт owner-lock хранилища $1, пишет "locked" и ждёт,
// пока его не убьют. release не зовёт никогда.
import { acquireOwnerLock } from "../../src/run/owner-lock.js";

const root = process.argv[2];
if (!root) throw new Error("usage: hold-owner-lock <root>");
await acquireOwnerLock(root, "server");
process.stdout.write("locked\n");
setInterval(() => undefined, 1 << 30);
