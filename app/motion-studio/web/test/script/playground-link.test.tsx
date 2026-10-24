// S9: Playground сцены сценарного проекта — ссылка «← К сценарию» на рабочее место проекта;
// у сцены обычного проекта ссылки нет.
import { screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { t } from "../../src/i18n/index.js";
import { Playground } from "../../src/pages/Playground.js";
import { versionDto } from "../fixtures.js";
import { TS, fakeFetch, on, renderQ } from "../helpers.js";

afterEach(() => vi.unstubAllGlobals());

function routes(kind: "script" | "playground") {
  return fakeFetch([
    on("GET", "/api/scenes/sc_1", {
      scene: { id: "sc_1", project_id: "p1", title: "01 · В Go 1.24", current_version_id: "v1", approved_version_id: null, created_at: TS },
      versions: [],
      active_job: null,
    }),
    on("GET", "/api/projects/p1", { project: { id: "p1", kind, title: "Go map", settings: null, created_at: TS, updated_at: TS }, scenes: [], exports: [] }),
    on("GET", "/api/versions/v1", versionDto("v1", 1)),
    on("GET", "/api/scenes/sc_1/messages", []),
  ]);
}

it("сцена проекта kind=script → ссылка «← К сценарию» на /projects/<p>", async () => {
  routes("script");
  renderQ(<Playground id="sc_1" />);
  const link = await screen.findByRole("link", { name: t("scriptOutput.backToScript") });
  expect(link.getAttribute("href")).toBe("/projects/p1");
});

it("сцена обычного проекта — без ссылки «← К сценарию»", async () => {
  const { calls } = routes("playground");
  renderQ(<Playground id="sc_1" />);
  await screen.findByRole("link", { name: t("nav.project") });
  await waitFor(() => expect(calls.some((c) => c.url === "/api/projects/p1")).toBe(true));
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByRole("link", { name: t("scriptOutput.backToScript") })).toBeNull();
});
