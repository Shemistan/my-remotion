import { randomBytes } from "node:crypto";

// Алфавит Крокфорда: без I, L, O, U.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export type IdPrefix =
  | "scn" | "ver" | "run" | "prj" | "job" | "msg" | "exp"
  // Phase 2–3: исходник, транскрипт, EDL, approval, footage, semantic, StyleBible, план, синхронная правка
  | "med" | "trn" | "edl" | "apr" | "ftg" | "sem" | "sty" | "pln" | "syn"
  // загрузка видео через браузер (Task 29): `workspace/uploads/upl_…`
  | "upl"
  // карантин каталога-сироты артефакта
  | "qrn";

let lastTime = -1;
let lastRand = 0n;

function encode(value: bigint, len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out = ALPHABET[Number(value & 31n)]! + out;
    value >>= 5n;
  }
  return out;
}

/**
 * ULID с префиксом (`scn_…`, `ver_…`, `job_…` и т. д.). Внутри одной миллисекунды
 * монотонен (случайная часть увеличивается), поэтому сортировка строк = порядок
 * создания. Подходит под SAFE_ID из core (`run/processes`).
 */
export function newId(prefix: IdPrefix): string {
  let time = Date.now();
  let rand: bigint;
  if (time <= lastTime) {
    time = lastTime;
    rand = lastRand + 1n;
    if (rand >= 1n << 80n) {
      time += 1;
      rand = BigInt("0x" + randomBytes(10).toString("hex"));
    }
  } else {
    rand = BigInt("0x" + randomBytes(10).toString("hex"));
  }
  lastTime = time;
  lastRand = rand;
  return `${prefix}_${encode(BigInt(time), 10)}${encode(rand, 16)}`;
}
