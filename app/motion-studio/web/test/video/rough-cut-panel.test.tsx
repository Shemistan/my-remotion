// RoughCutPanel: вырезки с причиной, длительностью, уверенностью и объяснением; принять /
// отклонить / восстановить; «Принять все ≥ 0,8» — только уверенные proposed; «Утвердить (A)»
// недоступна с подсказкой, пока есть proposed; итог «было → стало».
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RoughCutPanel } from "../../src/components/video/RoughCutPanel.js";
import { t } from "../../src/i18n/index.js";
import { fakeFetch, on, renderQ } from "../helpers.js";
import { DECISIONS, approvals, dec, edlDto } from "./fixtures.js";

afterEach(() => vi.unstubAllGlobals());

const props = (over: Record<string, unknown> = {}) => ({
  projectId: "p1",
  edl: edlDto(),
  approvals: approvals(),
  onListen: vi.fn(),
  onChanged: vi.fn(),
  ...over,
});

it("«Утвердить (A)» недоступна при proposed, подсказка с их числом", () => {
  fakeFetch();
  renderQ(<RoughCutPanel {...props({ edl: edlDto([DECISIONS[0]!, DECISIONS[1]!, dec("x", { status: "accepted" })]) })} />);
  const btn = screen.getByRole("button", { name: t("roughcut.approve") });
  expect((btn as HTMLButtonElement).disabled).toBe(true);
  expect(btn.getAttribute("title")).toBe(t("approval.a.proposedLeft", { n: 2 }));
  // подсказка видна рядом с кнопкой и связана с ней (aria-describedby), не только в title
  const hint = document.getElementById(btn.getAttribute("aria-describedby") ?? "")!;
  expect(hint).toBeTruthy();
  expect(hint.textContent).toBe(t("approval.a.proposedLeft", { n: 2 }));
});

it("нет proposed — подсказки нет, «Утвердить (A)» доступна", () => {
  fakeFetch();
  renderQ(<RoughCutPanel {...props({ edl: edlDto([dec("x", { status: "accepted" })]) })} />);
  const btn = screen.getByRole("button", { name: t("roughcut.approve") });
  expect((btn as HTMLButtonElement).disabled).toBe(false);
  expect(btn.getAttribute("aria-describedby")).toBeNull();
  expect(screen.queryByTestId("approve-hint")).toBeNull();
});

it("«Принять все ≥ 0,8» — set_status accepted только для proposed с confidence ≥ 0.8, от текущей ревизии", async () => {
  const { calls } = fakeFetch([on("POST", "/api/edls/edl_1/revisions", edlDto(DECISIONS, 2), 201)]);
  renderQ(<RoughCutPanel {...props()} />);
  fireEvent.click(screen.getByRole("button", { name: t("roughcut.acceptConfident") }));
  await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
  expect(calls.find((c) => c.method === "POST")!.body).toEqual({
    base_revision: 1,
    ops: [{ op: "set_status", decision_id: "pau_r1_1", status: "accepted" }, { op: "set_status", decision_id: "pau_r1_2", status: "accepted" }],
  });
});

it("строка вырезки: причина, длительность, уверенность, объяснение; «Принять» → set_status; принятая — «Восстановить»", async () => {
  const { calls } = fakeFetch([on("POST", "/api/edls/edl_1/revisions", edlDto(DECISIONS, 2), 201)]);
  renderQ(<RoughCutPanel {...props({ edl: edlDto([DECISIONS[0]!, dec("acc", { status: "accepted", source_start_us: 5_000_000, source_end_us: 5_500_000 })]) })} />);
  const row = screen.getByTestId("cut-pau_r1_1");
  expect(row.textContent).toContain(t("cut.reason.pause"));
  expect(row.textContent).toContain("1,5");
  expect(row.textContent).toContain("0,95");
  expect(row.textContent).toContain("пауза 1,5 с");
  expect(row.querySelector("button[data-action='accept']")).toBeTruthy();
  expect(row.querySelector("button[data-action='reject']")).toBeTruthy();
  fireEvent.click(screen.getByTestId("cut-acc").querySelector("button[data-action='restore']")!);
  await waitFor(() => expect(calls.filter((c) => c.method === "POST")).toHaveLength(1));
  expect(calls.find((c) => c.method === "POST")!.body).toMatchObject({ ops: [{ op: "set_status", decision_id: "acc", status: "rejected" }] });
});

it("«Прослушать фрагмент» — диапазон −1 с … +1 с вокруг вырезки", () => {
  fakeFetch();
  const p = props();
  renderQ(<RoughCutPanel {...p} />);
  fireEvent.click(screen.getByTestId("cut-pau_r1_1").querySelector("button[data-action='listen']")!);
  expect(p.onListen).toHaveBeenCalledWith({ start_us: 0, end_us: 3_500_000 });
});

it("итог «было → стало» по таймлайну ревизии", () => {
  fakeFetch();
  renderQ(<RoughCutPanel {...props({ edl: edlDto([dec("a", { status: "accepted" })]) })} />);
  expect(screen.getByTestId("roughcut-summary").textContent).toBe(t("roughcut.summary", { before: "10,0", after: "8,5" }));
});

it("409 revision_conflict → сообщение и перезагрузка EDL", async () => {
  fakeFetch([on("POST", "/api/edls/edl_1/revisions", { error: "revision_conflict", message: "r1", base: 1, current: 2 }, 409)]);
  const p = props();
  renderQ(<RoughCutPanel {...p} />);
  fireEvent.click(screen.getByTestId("cut-pau_r1_1").querySelector("button[data-action='accept']")!);
  expect(await screen.findByText(t("roughcut.conflict"))).toBeTruthy();
  expect(p.onChanged).toHaveBeenCalled();
});
