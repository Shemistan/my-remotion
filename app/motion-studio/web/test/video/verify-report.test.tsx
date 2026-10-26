// Task 45: отчёт проверки финала — `failed_verification`: красным, без «Готово», «Скачать всё равно»
// с подтверждением; пройдена — «Готово» и «Скачать»; строки синхронности (норма — кадр), кадров,
// громкости. История экспортов: вердикт, итог повтора, «Повторить экспорт» — POST reproduce.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExportHistory } from "../../src/components/timeline/ExportHistory.js";
import { VerifyReport } from "../../src/components/timeline/VerifyReport.js";
import { t } from "../../src/i18n/index.js";
import { fakeFetch, job, on, renderQ } from "../helpers.js";
import { VERIFY, finalExport } from "./timeline-fixtures.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("VerifyReport", () => {
  it("failed_verification — без «Готово», перечень проверок красным, «Скачать всё равно» с подтверждением", () => {
    render(<VerifyReport exp={finalExport()} words={new Map([["w_000002", "выручка"]])} />);
    expect(screen.queryByText(t("finalExport.verify.ready"))).toBeNull();
    expect(screen.getByTestId("verify-report").getAttribute("data-verdict")).toBe("fail");
    expect(screen.getByRole("alert").textContent).toBe(t("finalExport.verify.failed", { list: t("finalExport.verify.check.sync") }));
    const sync = screen.getByTestId("verify-sync").querySelectorAll("li");
    expect(sync[0]!.className).toBe("");
    expect(sync[1]!.className).toBe("bad");
    expect(sync[1]!.textContent).toContain(t("finalExport.verify.syncRow", { word: "выручка", ms: 120 }));
    expect(screen.getByTestId("verify-frames").textContent).toContain(t("finalExport.verify.inconclusive"));
    const link = screen.getByTestId("final-download");
    expect(link.textContent).toBe(t("finalExport.downloadAnyway"));
    expect(link.getAttribute("href")).toBe("/api/final-exports/fin_1/file");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(ev);
    expect(confirm).toHaveBeenCalledWith(t("finalExport.downloadConfirm"));
    expect(ev.defaultPrevented).toBe(true);
  });

  it("пройдена — «Готово» и «Скачать» без подтверждения", () => {
    render(<VerifyReport exp={finalExport({ status: "ready", verify: { ...VERIFY, verdict: "pass", failures: [], sync: [] } })} />);
    expect(screen.getByText(t("finalExport.verify.ready"))).toBeTruthy();
    expect(screen.getByTestId("final-download").textContent).toBe(t("finalExport.download"));
    expect(screen.getByText(t("finalExport.verify.syncNone"))).toBeTruthy();
  });
});

describe("ExportHistory", () => {
  it("экспорты с вердиктом и итогом повтора; «Повторить экспорт» — POST reproduce с ключом", async () => {
    const compare = { reproduced_from: "fin_1", inputs_equal: true, probe_equal: true, frames: [{ frame: 5, psnr_db: 61.24 }, { frame: 9, psnr_db: 58.1 }], file_sha256_equal: false, verdict: "reproduced" as const };
    const { calls } = fakeFetch([
      on("GET", "/api/projects/p1/final-exports", [finalExport({ id: "fin_2", status: "ready", compare }), finalExport()]),
      on("POST", "/api/final-exports/fin_1/reproduce", { job: job({ id: "job_rep", type: "final.reproduce", status: "pending" }) }, 202),
      on("GET", /\/api\/jobs\/job_rep/, { job: job({ id: "job_rep", type: "final.reproduce", status: "running" }), events: [], processes: [] }),
    ]);
    renderQ(<ExportHistory projectId="p1" active={false} />);
    const rows = await screen.findAllByTestId("final-export");
    expect(rows.map((r) => r.getAttribute("data-status"))).toEqual(["ready", "failed_verification"]);
    expect(screen.getByTestId("compare").textContent).toBe(t("finalExport.history.compare.reproduced", { id: "fin_1", min: "58.1" }));
    fireEvent.click(rows[1]!.querySelector("button[title]")!);
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url === "/api/final-exports/fin_1/reproduce")).toBe(true));
    expect(calls.find((c) => c.method === "POST")!.headers["idempotency-key"]).toMatch(/:fin_1$/);
    // отчёт проверки по кнопке
    fireEvent.click(rows[1]!.querySelector("button[aria-expanded]")!);
    expect(rows[1]!.querySelector("[data-testid=verify-report]")).toBeTruthy();
  });
});
