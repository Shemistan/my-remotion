// Task 5L: вкладка «Экспорт» видеопроекта — «Собрать папку клипов» (по умолчанию только
// утверждённые, флажок — и неутверждённые), ход задачи, карточка папки: путь, Finder, «не вошли»,
// шпаргалка таблицей из .md и ссылки на .csv/.txt.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VideoProjectDto } from "@ms/contracts";
import { t } from "../../src/i18n/index.js";
import { ExportTab } from "../../src/pages/video/ExportTab.js";
import { TS, fakeFetch, job, on, renderQ } from "../helpers.js";

afterEach(() => vi.unstubAllGlobals());

const SHA = "e".repeat(64);
const probe = { durationMs: 3100, width: 1920, height: 1080, fps: { num: 30, den: 1 }, codec: "h264", audioCodec: "aac" };
const data = { project: { id: "p1", kind: "video", title: "Протокол", settings: null, created_at: TS, updated_at: TS } } as unknown as VideoProjectDto;

const pkg = {
  id: "pkg_1", rel_path: "workspace/projects/p1/packages/pkg_1", abs_path: "/Volumes/SSD/store/workspace/projects/p1/packages/pkg_1",
  display_name: "Протокол_клипы_2026-10-26", created_at: TS,
  manifest: {
    schema_version: 1, package_id: "pkg_1", project_id: "p1", project_title: "Протокол", name: "Протокол_клипы_2026-10-26", fps: { num: 30, den: 1 },
    edl: { id: "edl_1", revision: 2 }, plan: { id: "pln_1", revision: 3 },
    scenes: [{
      n: 1, item_id: "sp_001", scene_id: "scn_1", version_id: "ver_1", version_number: 1, approved: true,
      source: { start_us: 0, end_us: 3_100_000 }, edited: { start_us: 0, end_us: 3_100_000 }, frames: { start: 0, end: 93 }, quote: "Раз два",
      mode: "overlay", zone: "left_third", mp4: { file: "01_raz-dva.mp4", export_id: "exp_1", sha256: SHA, ffprobe: probe }, alpha: null, warnings: [],
    }],
    missing: [{ item_id: "sp_002", quote: "Три четыре", reason: "не утверждена (C)", n: 2 }],
    created_at: TS,
  },
};

const MD = [
  "# Шпаргалка: клипы ↔ ролик", "", "Проект «Протокол» · fps 30 · таймкоды ЧЧ:ММ:СС:КК (КК — кадр).", "",
  "| № | ролик: начало | ролик: конец | фраза | C |", "|---|---|---|---|---|", "| 01 | 00:00:00:00 | 00:00:03:03 | Раз два | да |", "",
  "## Не вошли в папку (1)", "", "| № | ролик: начало | фраза | причина |", "|---|---|---|---|", "| 02 | 00:00:04:00 | Три четыре | не утверждена (C) |", "",
].join("\n");

function setup(list: unknown[] = [pkg]) {
  const pkgJob = (over: Record<string, unknown> = {}) => job({ id: "job_pkg", type: "video.package", scene_id: null, project_id: "p1", ...over });
  const fake = fakeFetch([
    on("GET", "/api/projects/p1/video-packages", list),
    on("POST", "/api/projects/p1/video/package", { job: pkgJob({ status: "pending" }) }, 202),
    on("GET", "/api/jobs/job_pkg", { job: pkgJob({ status: "completed", output_refs: { package_id: "pkg_1" } }), events: [], processes: [] }),
    on("POST", "/api/video-packages/pkg_1/reveal", null, 204),
  ]);
  const inner = fake.fn;
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    String(input).includes("/cheatsheet?format=md") ? new Response(MD, { status: 200, headers: { "content-type": "text/markdown; charset=utf-8" } }) : inner(input, init));
  vi.stubGlobal("fetch", fn);
  return fake.calls;
}

describe("ExportTab видеопроекта", () => {
  it("папка: путь, «не вошли» с номером и причиной, шпаргалка таблицами; csv/txt — ссылки; Finder", async () => {
    const calls = setup();
    renderQ(<ExportTab data={data} currentUs={0} onSeek={() => undefined} onChanged={() => undefined} />);
    const card = await screen.findByTestId("video-package-card");
    expect(within(card).getByText("Протокол_клипы_2026-10-26")).toBeTruthy();
    expect(within(card).getByText(pkg.abs_path)).toBeTruthy();
    const missing = within(card).getByTestId("video-package-missing");
    expect(missing.textContent).toContain("Сцена 2");
    expect(missing.textContent).toContain("не утверждена (C)");
    const tables = await within(card).findAllByRole("table");
    expect(tables).toHaveLength(2);
    expect(within(tables[0]!).getAllByRole("columnheader").map((x) => x.textContent)).toEqual(["№", "ролик: начало", "ролик: конец", "фраза", "C"]);
    expect(within(card).getByRole("heading", { name: "Не вошли в папку (1)" })).toBeTruthy();
    expect(within(card).getByRole("link", { name: t("videoExport.cheatsheet.csv") }).getAttribute("href")).toBe("/api/video-packages/pkg_1/cheatsheet?format=csv");
    expect(within(card).getByRole("link", { name: t("videoExport.cheatsheet.txt") }).getAttribute("href")).toBe("/api/video-packages/pkg_1/cheatsheet?format=txt");
    fireEvent.click(within(card).getByRole("button", { name: t("videoExport.package.reveal") }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url === "/api/video-packages/pkg_1/reveal")).toBe(true));
  });

  it("«Собрать папку клипов»: по умолчанию only_approved, с флажком — false; ключ идемпотентности; ход задачи", async () => {
    const calls = setup([]);
    renderQ(<ExportTab data={data} currentUs={0} onSeek={() => undefined} onChanged={() => undefined} />);
    expect(await screen.findByText(t("videoExport.packages.none"))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t("videoExport.clips.build") }));
    await waitFor(() => expect(calls.filter((c) => c.method === "POST" && c.url === "/api/projects/p1/video/package")).toHaveLength(1));
    const first = calls.find((c) => c.method === "POST" && c.url === "/api/projects/p1/video/package")!;
    expect(first.body).toEqual({ only_approved: true });
    expect(first.headers["idempotency-key"]).toBeTruthy();
    await waitFor(() => expect(calls.some((c) => c.url === "/api/jobs/job_pkg")).toBe(true));
    // задача завершилась — список папок перечитан
    await waitFor(() => expect(calls.filter((c) => c.url === "/api/projects/p1/video-packages").length).toBeGreaterThan(1));
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect((screen.getByRole("button", { name: t("videoExport.clips.build") }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: t("videoExport.clips.build") }));
    await waitFor(() => expect(calls.filter((c) => c.method === "POST" && c.url === "/api/projects/p1/video/package")).toHaveLength(2));
    const second = calls.filter((c) => c.method === "POST" && c.url === "/api/projects/p1/video/package")[1]!;
    expect(second.body).toEqual({ only_approved: false });
    expect(second.headers["idempotency-key"]).not.toBe(first.headers["idempotency-key"]);
  });
});
