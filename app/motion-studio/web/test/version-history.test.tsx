// VersionHistory: v1…vN, статус, родитель, «Открыть», «Восстановить», «Сравнить»;
// «с замечаниями» (visual warn). SceneTimeline: биты, маркеры QA (клик → seek), полоса версий.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SceneTimeline } from "../src/components/SceneTimeline.js";
import { VersionHistory } from "../src/components/VersionHistory.js";
import { t } from "../src/i18n/index.js";
import { fakeFetch, job, on, renderQ } from "./helpers.js";
import { historyEntry } from "./fixtures.js";

afterEach(() => vi.unstubAllGlobals());

const versions = [
  historyEntry("v1", 1),
  historyEntry("v2", 2, { parent_version_id: "v1", qa: { technical: "pass", visual: "warn", semantic: "pass", style: "pass" } }),
  historyEntry("v3", 3, { parent_version_id: "v2", status: "failed", qa: null }),
];

it("строки v1…v3 со статусом и родителем; warn — «с замечаниями»", () => {
  renderQ(<VersionHistory sceneId="s1" versions={versions} openId="v2" currentId="v2" onOpen={() => undefined} onCompare={() => undefined} />);
  const rows = screen.getAllByRole("listitem");
  expect(rows.map((r) => r.querySelector("[data-version]")!.textContent)).toEqual(["v3", "v2", "v1"]);
  expect(rows[1]!.textContent).toContain(t("versions.parent", { n: 1 }));
  expect(rows[1]!.textContent).toContain(t("versions.status.warn"));
  expect(rows[0]!.textContent).toContain(t("versions.status.failed"));
  expect(rows[2]!.textContent).toContain(t("versions.status.ready"));
  expect(rows[1]!.textContent).toContain(t("versions.current"));
});

it("«Открыть» и «Сравнить» с открытой версией", () => {
  const open = vi.fn();
  const compare = vi.fn();
  renderQ(<VersionHistory sceneId="s1" versions={versions} openId="v2" currentId="v2" onOpen={open} onCompare={compare} />);
  const v1 = screen.getAllByRole("listitem")[2]!;
  fireEvent.click(v1.querySelector(`button[data-action="open"]`)!);
  expect(open).toHaveBeenCalledWith("v1");
  fireEvent.click(v1.querySelector(`button[data-action="compare"]`)!);
  expect(compare).toHaveBeenCalledWith("v2", "v1");
});

it("«Восстановить» → POST /restore с ключом; у failed-версии кнопка отключена", async () => {
  const { calls } = fakeFetch([on("POST", "/api/scenes/s1/restore", { job: job({ type: "scene.restore" }) }, 202)]);
  renderQ(<VersionHistory sceneId="s1" versions={versions} openId="v2" currentId="v2" onOpen={() => undefined} onCompare={() => undefined} />);
  const [v3, , v1] = screen.getAllByRole("listitem");
  expect((v3!.querySelector(`button[data-action="restore"]`) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(v1!.querySelector(`button[data-action="restore"]`)!);
  await waitFor(() => expect(calls).toHaveLength(1));
  expect(calls[0]!.body).toEqual({ versionId: "v1" });
  expect(calls[0]!.headers["idempotency-key"]).toBeTruthy();
});

it("SceneTimeline: биты, маркеры QA → seek, полоса версий → open", () => {
  const seek = vi.fn();
  const open = vi.fn();
  render(
    <SceneTimeline
      durationFrames={180} frame={30} beats={[{ id: "intro", start: 0, end: 60 }, { id: "hold", start: 60, end: 180 }]}
      qaFrames={[0, 72]} versions={versions} openId="v2" onSeek={seek} onOpen={open}
    />,
  );
  expect(screen.getByText("intro")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: t("qa.frame", { frame: 72 }) }));
  expect(seek).toHaveBeenCalledWith(72);
  fireEvent.click(screen.getByRole("button", { name: t("versions.label", { n: 1 }) }));
  expect(open).toHaveBeenCalledWith("v1");
  const intro = screen.getByText("intro").closest("[data-beat]") as HTMLElement;
  expect(intro.style.width).toBe("33.33333333333333%");
});

it("SceneTimeline: пересекающиеся биты — на разных дорожках, следующий после конца — на первой", () => {
  render(
    <SceneTimeline
      durationFrames={180} frame={0} qaFrames={[]} versions={[]} openId={undefined} onSeek={() => undefined} onOpen={() => undefined}
      beats={[{ id: "a", start: 0, end: 60 }, { id: "b", start: 10, end: 70 }, { id: "c", start: 60, end: 120 }]}
    />,
  );
  const lane = (id: string) => (document.querySelector(`[data-beat="${id}"]`) as HTMLElement).dataset.lane;
  expect([lane("a"), lane("b"), lane("c")]).toEqual(["0", "1", "0"]);
});
