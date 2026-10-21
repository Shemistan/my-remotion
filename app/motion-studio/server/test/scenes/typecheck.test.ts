import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";
import { sceneCompilerOptions, typecheckVersion } from "../../src/scenes/typecheck.js";

const RENDER_FIXTURES = fileURLToPath(new URL("../../../render/test/fixtures/", import.meta.url));
const TYPE_ERROR_SCENE = fileURLToPath(new URL("../fixtures/type-error-scene/", import.meta.url));
const MOTION_KIT = fileURLToPath(new URL("../../../render/src/motion-kit", import.meta.url));
const REPO_TMP = fileURLToPath(new URL("../../../../../tmp/", import.meta.url));

// Первый вызов грузит lib.dom и типы react/remotion — до нескольких секунд.
const SLOW = 60_000;

let tmp: string;
beforeEach(async () => {
  await mkdir(REPO_TMP, { recursive: true });
  tmp = await mkdtemp(join(REPO_TMP, "ms-typecheck-"));
});
afterEach(() => rm(tmp, { recursive: true, force: true }));

it("hello-scene из render проходит", { timeout: SLOW }, async () => {
  expect(await typecheckVersion(join(RENDER_FIXTURES, "hello-scene"))).toEqual([]);
});

it("ассеты (png) импортируются как строки", { timeout: SLOW }, async () => {
  expect(await typecheckVersion(join(RENDER_FIXTURES, "net-scene"))).toEqual([]);
});

it("одна ошибка типов — одна запись с файлом и строкой", { timeout: SLOW }, async () => {
  const errors = await typecheckVersion(TYPE_ERROR_SCENE);
  expect(errors).toHaveLength(1);
  expect(errors[0]).toMatchObject({ file: "src/Scene.tsx", line: 5 });
  expect(errors[0]!.message).toMatch(/string/);
});

it("версия вне каталога приложения: react и remotion находятся в node_modules приложения", { timeout: SLOW }, async () => {
  // tmp/ репозитория лежит вне app/motion-studio — обычный поиск node_modules вверх не сработает.
  await mkdir(join(tmp, "src", "parts"), { recursive: true });
  await writeFile(
    join(tmp, "src", "Scene.tsx"),
    `import { useMemo } from "react";
import { AbsoluteFill, random, useCurrentFrame } from "remotion";
import { Label } from "./parts/Label";
export const Scene = () => {
  const frame = useCurrentFrame();
  const r = useMemo(() => random("seed"), []);
  return <AbsoluteFill><Label text={String(frame + r)} /></AbsoluteFill>;
};
`,
  );
  await writeFile(join(tmp, "src", "parts", "Label.tsx"), "export const Label = ({ text }: { text: string }) => <div>{text}</div>;\n");
  expect(await typecheckVersion(tmp)).toEqual([]);
});

it("ошибки в нескольких файлах, пути относительно версии", { timeout: SLOW }, async () => {
  await mkdir(join(tmp, "src", "parts"), { recursive: true });
  await writeFile(join(tmp, "src", "Scene.tsx"), 'import { Label } from "./parts/Label";\nexport const Scene = () => <Label text={1} />;\n');
  await writeFile(
    join(tmp, "src", "parts", "Label.tsx"),
    "export const Label = ({ text }: { text: string }) => <div>{text}</div>;\nexport const n: number = 'x';\n",
  );
  const errors = await typecheckVersion(tmp);
  expect(errors.map((e) => [e.file, e.line])).toEqual([
    ["src/Scene.tsx", 2],
    ["src/parts/Label.tsx", 2],
  ]);
});

it("типы Node недоступны сцене (process не объявлен)", { timeout: SLOW }, async () => {
  await mkdir(join(tmp, "src"));
  await writeFile(join(tmp, "src", "Scene.tsx"), "export const Scene = () => <div>{process.cwd()}</div>;\n");
  const errors = await typecheckVersion(tmp);
  expect(errors).toHaveLength(1);
  expect(errors[0]!.message).toMatch(/process/);
});

it("неизвестный модуль — ошибка типов, а не исключение", { timeout: SLOW }, async () => {
  await mkdir(join(tmp, "src"));
  await writeFile(join(tmp, "src", "Scene.tsx"), 'import { x } from "no-such-package-ms";\nexport const Scene = () => <div>{String(x)}</div>;\n');
  const errors = await typecheckVersion(tmp);
  expect(errors).toHaveLength(1);
  expect(errors[0]).toMatchObject({ file: "src/Scene.tsx", line: 1 });
});

it("нет src/ — исключение", async () => {
  await expect(typecheckVersion(tmp)).rejects.toThrow(/src/);
});

it("@ms/motion-kit отображается на render/src/motion-kit, как алиас webpack", () => {
  expect(sceneCompilerOptions().paths?.["@ms/motion-kit"]).toEqual([MOTION_KIT]);
  expect(sceneCompilerOptions().types).toEqual([]);
});
