// Task 40: «Утвердить (C)» — POST /scenes/:id/approve { version_id }; при блокирующих замечаниях QA
// версии — подтверждение «Утвердить с замечаниями» до запроса; утверждённая текущая — без кнопки,
// «Снять утверждение» → unapprove; 409 plan_changed — понятный текст; подписи состояний.
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApprovalCButton, approvalText } from "../../src/components/video-scenes/ApprovalCButton.js";
import { t } from "../../src/i18n/index.js";
import { versionDto } from "../fixtures.js";
import { type Call, fakeFetch, on, renderQ } from "../helpers.js";
import { approvalC } from "./scenes-fixtures.js";

afterEach(() => vi.unstubAllGlobals());

const APPROVE = "/api/scenes/scn_1/approve";
const posts = (calls: Call[], url: string) => calls.filter((c) => c.method === "POST" && c.url === url);
const blockingQa = {
  gate: { technical: "pass", visual: "fail", semantic: "pass", style: "pass" },
  issues: [{ source: "agent", code: "text_overlap", severity: "blocking", description: "текст наезжает" }],
  checked_frames: [0], ocr: { checked: false, texts: [] },
};
const approved = { id: "apr_1", project_id: "p1", kind: "C", subject_ref: "scene:scn_1@r1", subject_hash: "a".repeat(64), status: "valid", decided_at: "2026-10-26T10:00:00.000Z" };
const btn = (approval = approvalC("missing")) =>
  <ApprovalCButton projectId="p1" sceneId="scn_1" versionId="ver_1" versionNumber={1} approval={approval} />;

describe("Approval C сцены", () => {
  it("без блокирующих QA — сразу POST approve { version_id }", async () => {
    const { calls } = fakeFetch([on("GET", "/api/versions/ver_1", versionDto("ver_1", 1)), on("POST", APPROVE, approved, 201)]);
    renderQ(btn());
    const approve = screen.getByRole("button", { name: t("videoScenes.c.approve") }) as HTMLButtonElement;
    await waitFor(() => expect(approve.disabled).toBe(false));
    fireEvent.click(approve);
    await waitFor(() => expect(posts(calls, APPROVE)).toHaveLength(1));
    expect(posts(calls, APPROVE)[0]!.body).toEqual({ version_id: "ver_1" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("блокирующие QA — подтверждение до запроса; «Отмена» — запроса нет; «Утвердить с замечаниями» — POST", async () => {
    const { calls } = fakeFetch([on("GET", "/api/versions/ver_1", versionDto("ver_1", 1, { qa: blockingQa })), on("POST", APPROVE, approved, 201)]);
    renderQ(btn());
    // пока отчёт QA версии не получен — кнопка недоступна (иначе подтверждение проскочило бы)
    const approve = screen.getByRole("button", { name: t("videoScenes.c.approve") }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    await waitFor(() => expect(approve.disabled).toBe(false));
    fireEvent.click(approve);
    expect(screen.getByRole("alertdialog").textContent).toContain(t("videoScenes.c.blocking", { n: 1, count: 1 }));
    expect(posts(calls, APPROVE)).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: t("videoScenes.c.cancel") }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(posts(calls, APPROVE)).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: t("videoScenes.c.approve") }));
    fireEvent.click(screen.getByRole("button", { name: t("videoScenes.c.confirm") }));
    await waitFor(() => expect(posts(calls, APPROVE)).toHaveLength(1));
  });

  it("текущая версия утверждена — «Утвердить» нет; «Снять утверждение» → unapprove", async () => {
    const { calls } = fakeFetch([on("GET", "/api/versions/ver_1", versionDto("ver_1", 1)), on("POST", "/api/scenes/scn_1/unapprove", { state: "missing" })]);
    renderQ(btn(approvalC("valid", { version_id: "ver_1", version_number: 1 })));
    expect(screen.getByTestId("approval-c-badge").textContent).toBe(t("videoScenes.c.valid", { n: 1 }));
    expect(screen.queryByRole("button", { name: t("videoScenes.c.approve") })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: t("videoScenes.c.unapprove") }));
    await waitFor(() => expect(posts(calls, "/api/scenes/scn_1/unapprove")).toHaveLength(1));
  });

  it("409 plan_changed — текст словаря области", async () => {
    fakeFetch([on("GET", "/api/versions/ver_1", versionDto("ver_1", 1)), on("POST", APPROVE, { error: "plan_changed", message: "x" }, 409)]);
    renderQ(btn());
    const approve = screen.getByRole("button", { name: t("videoScenes.c.approve") }) as HTMLButtonElement;
    await waitFor(() => expect(approve.disabled).toBe(false));
    fireEvent.click(approve);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(t("videoScenes.error.plan_changed")));
  });

  it("подписи состояний", () => {
    expect(approvalText(approvalC("missing"), 2)).toBe(t("videoScenes.c.missing"));
    expect(approvalText(approvalC("valid", { version_number: 2 }), 2)).toBe(t("videoScenes.c.valid", { n: 2 }));
    expect(approvalText(approvalC("valid", { version_number: 2 }), 3)).toBe(t("videoScenes.c.validCurrent", { n: 2, current: 3 }));
    expect(approvalText(approvalC("stale", { reason: "version_changed" }), 3)).toBe(t("videoScenes.c.staleReason.version_changed"));
    expect(approvalText(approvalC("stale", { reason: "edl_changed" }), 3)).toBe(t("videoScenes.c.stale"));
  });
});
