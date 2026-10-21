// Чекпоинты шагов задачи (M7): файл рядом с журналами агентов, переиспользуется по input_hash.
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readCheckpoint, stepInputHash, writeCheckpoint } from "../../src/pipeline/checkpoints.js";
import { makeStore, makeTmp, removeTmp } from "./helpers.js";

let tmp: string;
let root: string;
beforeEach(async () => {
  tmp = await makeTmp();
  root = await makeStore(tmp);
});
afterEach(() => removeTmp(tmp));

describe("checkpoints", () => {
  it("пишется в logs/agent-runs/<jobId>/checkpoints/<role>.json и читается по совпавшему input_hash", async () => {
    const h = stepInputHash("motion_director", "opus", "вход");
    const path = await writeCheckpoint(root, "job_1", "motion_director", { input_hash: h, output: { spec: 1 } });
    expect(path).toBe(join(root, "logs/agent-runs/job_1/checkpoints/motion_director.json"));
    expect(await readCheckpoint(path, h)).toEqual({ spec: 1 });
    expect(await readCheckpoint(path, stepInputHash("motion_director", "opus", "другой вход"))).toBeUndefined();
    expect(existsSync(`${path}.tmp-${process.pid}`)).toBe(false);
  });

  it("нет файла или он недописан — как нет чекпоинта", async () => {
    expect(await readCheckpoint(join(root, "нет.json"), "h")).toBeUndefined();
    const path = join(root, "half.json");
    await writeFile(path, '{"input_hash": "h", "out');
    expect(await readCheckpoint(path, "h")).toBeUndefined();
  });

  it("input_hash зависит от роли, модели и входа", () => {
    const base = stepInputHash("concept", "sonnet", { a: 1, b: 2 });
    expect(stepInputHash("concept", "sonnet", { b: 2, a: 1 })).toBe(base);
    expect(stepInputHash("concept", "opus", { a: 1, b: 2 })).not.toBe(base);
    expect(stepInputHash("motion_director", "sonnet", { a: 1, b: 2 })).not.toBe(base);
  });
});
