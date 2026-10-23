// VersionCompare: два синхронизированных <video> с общим seek; diff settings/props/spec
// (JSON Pointer, было → стало) и файлов src/ (unified, как текст).
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { VersionCompare } from "../src/components/VersionCompare.js";
import { t } from "../src/i18n/index.js";
import { frameToTime } from "../src/lib/player-math.js";
import { fakeFetch, on, renderQ } from "./helpers.js";
import { versionDto } from "./fixtures.js";

afterEach(() => vi.unstubAllGlobals());

const diff = {
  settings: [],
  props: [{ path: "/timing/duration_frames", before: 180, after: 240 }, { path: "/style/palette_overrides/accent/0", after: "#7c3aed" }],
  spec: [{ path: "/title", before: "Старое", after: undefined }],
  files: [
    { path: "src/Scene.tsx", status: "changed", unified: "@@ -1 +1 @@\n-const a = 1;\n+const a = <b>2</b>;\n" },
    { path: "src/Other.tsx", status: "same" },
  ],
};

function setup() {
  fakeFetch([
    on("GET", "/api/versions/va", versionDto("va", 1)),
    on("GET", "/api/versions/vb", versionDto("vb", 2)),
    on("GET", "/api/versions/va/diff/vb", diff),
  ]);
  return renderQ(<VersionCompare a="va" b="vb" />);
}

it("два плеера и diff props: путь, было → стало", async () => {
  const view = setup();
  expect(await screen.findByText("/timing/duration_frames")).toBeTruthy();
  expect(view.container.querySelectorAll("video")).toHaveLength(2);
  const row = screen.getByText("/timing/duration_frames").closest("tr")!;
  expect(row.textContent).toContain("180");
  expect(row.textContent).toContain("240");
  expect(screen.getByText("/style/palette_overrides/accent/0").closest("tr")!.textContent).toContain(t("compare.absent"));
  expect(screen.getByText(t("compare.noChanges"))).toBeTruthy(); // settings пуст
});

it("общий seek ставит оба видео на один кадр", async () => {
  const view = setup();
  await screen.findByText("/timing/duration_frames");
  fireEvent.change(screen.getByRole("slider", { name: t("player.seek") }), { target: { value: "30" } });
  const [a, b] = view.container.querySelectorAll("video");
  expect(a!.currentTime).toBeCloseTo(frameToTime(30, { num: 30, den: 1 }), 6);
  expect(b!.currentTime).toBeCloseTo(frameToTime(30, { num: 30, den: 1 }), 6);
});

it("unified diff файлов — как текст, одинаковые файлы помечены", async () => {
  setup();
  expect(await screen.findByText("src/Scene.tsx")).toBeTruthy();
  expect(screen.getByText(/const a = <b>2<\/b>;/)).toBeTruthy();
  expect(document.querySelector("pre b")).toBeNull();
  expect(screen.getByText(t("compare.file.same"))).toBeTruthy();
});

it("воспроизведение: счётчик и ползунок идут за видео, второе видео подтягивается; конец → «Воспроизвести»; шаг от фактического кадра", async () => {
  const view = setup();
  await screen.findByText("/timing/duration_frames");
  const [a, b] = view.container.querySelectorAll("video");
  fireEvent.click(screen.getByRole("button", { name: t("player.play") }));
  expect(screen.getByRole("button", { name: t("player.pause") })).toBeTruthy();
  // видео A ушло на 2 с (кадр 60 при 30 fps), B отстало
  a!.currentTime = 2.01;
  b!.currentTime = 1.5;
  fireEvent.timeUpdate(a!);
  expect(screen.getByText(t("player.frame", { frame: 60, total: 180 }))).toBeTruthy();
  expect((screen.getByRole("slider", { name: t("player.seek") }) as HTMLInputElement).value).toBe("60");
  expect(b!.currentTime).toBeCloseTo(2.01, 2);
  // пауза фиксирует фактический кадр; шаг вперёд — от него, а не от устаревшего
  a!.currentTime = 2.5;
  fireEvent.click(screen.getByRole("button", { name: t("player.pause") }));
  fireEvent.click(screen.getByRole("button", { name: t("player.next") }));
  expect(screen.getByText(t("player.frame", { frame: 76, total: 180 }))).toBeTruthy();
  expect(a!.currentTime).toBeCloseTo(frameToTime(76, { num: 30, den: 1 }), 6);
  // конец ролика: кнопка снова «Воспроизвести»
  fireEvent.click(screen.getByRole("button", { name: t("player.play") }));
  fireEvent.ended(a!);
  expect(screen.getByRole("button", { name: t("player.play") })).toBeTruthy();
});
