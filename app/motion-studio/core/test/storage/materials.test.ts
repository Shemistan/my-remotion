import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MATERIALS_ROOT,
  MaterialsPathError,
  SSD_ROOT,
  assertInMaterials,
  assertSsdWriteAllowed,
  isInMaterials,
  materialsAdvice,
  materialsPath,
  materialsRoot,
} from "../../src/storage/materials.js";
import { makeTmp, removeTmp } from "../helpers.js";

let tmp: string;
let ssd: string;
let root: string;
let env: Record<string, string | undefined>;
const saved = process.env.MS_MATERIALS_ROOT;

beforeEach(async () => {
  tmp = await makeTmp();
  ssd = join(tmp, "ssd");
  root = join(ssd, "moution-studio-materials");
  mkdirSync(join(root, "store"), { recursive: true });
  env = { MS_MATERIALS_ROOT: root };
});
afterEach(async () => {
  if (saved === undefined) delete process.env.MS_MATERIALS_ROOT;
  else process.env.MS_MATERIALS_ROOT = saved;
  await removeTmp(tmp);
});

describe("корень материалов", () => {
  it("по умолчанию — /Volumes/External SSD/moution-studio-materials", () => {
    expect(SSD_ROOT).toBe("/Volumes/External SSD");
    expect(MATERIALS_ROOT).toBe("/Volumes/External SSD/moution-studio-materials");
    expect(materialsRoot({})).toBe(MATERIALS_ROOT);
    expect(materialsRoot({ MS_MATERIALS_ROOT: "  " })).toBe(MATERIALS_ROOT);
  });

  it("MS_MATERIALS_ROOT переопределяет корень; относительный путь — ошибка", () => {
    expect(materialsRoot(env)).toBe(root);
    expect(() => materialsRoot({ MS_MATERIALS_ROOT: "rel/dir" })).toThrow(/MS_MATERIALS_ROOT/);
  });
});

describe("materialsPath", () => {
  it("строит пути областей store / acceptance / e2e / examples", () => {
    delete process.env.MS_MATERIALS_ROOT;
    expect(materialsPath("store")).toBe(`${MATERIALS_ROOT}/store`);
    expect(materialsPath("acceptance", "store")).toBe(`${MATERIALS_ROOT}/acceptance/store`);
    expect(materialsPath("e2e", "s7")).toBe(`${MATERIALS_ROOT}/e2e/s7`);
    expect(materialsPath("examples", "script-mvp", "block-1")).toBe(`${MATERIALS_ROOT}/examples/script-mvp/block-1`);
    process.env.MS_MATERIALS_ROOT = root;
    expect(materialsPath("e2e", "script")).toBe(join(root, "e2e/script"));
  });

  it.each([["../x"], ["a/../../x"], ["/etc"], [""]])("отказ для выхода за область %j", (seg) => {
    const err = (() => {
      try {
        materialsPath("e2e", seg);
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(MaterialsPathError);
  });

  it("неизвестная область — ошибка", () => {
    expect(() => materialsPath("tmp" as never)).toThrow(/област/);
  });
});

describe("assertInMaterials", () => {
  it("путь внутри (в т. ч. ещё не созданный) — возвращает абсолютный путь", () => {
    expect(assertInMaterials(join(root, "store"), env)).toBe(join(root, "store"));
    expect(assertInMaterials(join(root, "e2e/new/deep"), env)).toBe(join(root, "e2e/new/deep"));
    expect(assertInMaterials(root, env)).toBe(root);
  });

  it("путь вне корня — ошибка с понятным текстом", () => {
    for (const p of [join(ssd, "MotionStudio"), join(ssd, "moution-studio-materials-old"), join(root, "..", "x"), "/"]) {
      expect(() => assertInMaterials(p, env), p).toThrow(MaterialsPathError);
    }
    expect(() => assertInMaterials(join(ssd, "MotionStudio"), env)).toThrow(/только внутри .*moution-studio-materials/);
  });

  it("APFS без учёта регистра: путь в другом регистре — тот же каталог (realpath.native, ревью S18 M1)", () => {
    const upper = join(tmp, "SSD", "MOUTION-STUDIO-MATERIALS");
    if (!existsSync(upper)) return; // ФС с учётом регистра — случай неприменим
    expect(isInMaterials(join(upper, "store"), env)).toBe(true);
    expect(() => assertInMaterials(join(upper, "e2e", "new"), env)).not.toThrow();
    expect(isInMaterials(join(root, "store"), { MS_MATERIALS_ROOT: upper })).toBe(true);
    // и в обратную сторону: соседняя папка в другом регистре остаётся вне материалов
    mkdirSync(join(ssd, "Other"));
    expect(isInMaterials(join(tmp, "SSD", "OTHER"), env)).toBe(false);
  });

  it("симлинк внутри материалов, ведущий наружу, — ошибка (realpath)", () => {
    const outside = join(ssd, "Youtube");
    mkdirSync(outside);
    symlinkSync(outside, join(root, "link"));
    expect(() => assertInMaterials(join(root, "link", "a.mov"), env)).toThrow(MaterialsPathError);
  });
});

describe("assertSsdWriteAllowed и materialsAdvice", () => {
  it("запись на SSD вне материалов — ошибка; вне SSD и внутри материалов — можно", () => {
    expect(() => assertSsdWriteAllowed(join(ssd, "MotionStudio-e2e-s7"), env)).toThrow(MaterialsPathError);
    expect(assertSsdWriteAllowed(join(root, "e2e/s7"), env)).toBe(join(root, "e2e/s7"));
    expect(assertSsdWriteAllowed(join(tmp, "elsewhere"), env)).toBe(join(tmp, "elsewhere"));
  });

  it("хранилище на SSD вне материалов → подсказка нового пути; иначе undefined", () => {
    expect(materialsAdvice(join(ssd, "MotionStudio"), env)).toMatch(new RegExp(`${join(root, "store").replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}`));
    expect(materialsAdvice(join(root, "store"), env)).toBeUndefined();
    expect(materialsAdvice(join(tmp, "store"), env)).toBeUndefined();
  });
});
