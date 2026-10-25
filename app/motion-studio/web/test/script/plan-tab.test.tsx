// S8: вкладка «План» — карточки сцен по порядку текста, правки (приём, убрать/вернуть, идея,
// границы), добавление сцены выделением, скорость чтения, пропуски, проблемы, разнообразие,
// «Утвердить и сгенерировать N сцен» (blocking — недоступна).
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { t } from "../../src/i18n/index.js";
import { PlanTab } from "../../src/pages/script/PlanTab.js";
import { formatDuration, techniqueLabel } from "../../src/script/format.js";
import { type Call, fakeFetch, on, renderQ } from "../helpers.js";
import { F30, planDoc, scriptDoc, state } from "./plan-fixtures.js";

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

const opsCalls = (calls: Call[]) => calls.filter((c) => c.method === "POST" && c.url === "/api/projects/p1/script/plan/ops");
const cards = () => screen.getAllByTestId("scene-card");
const okOps = () => on("POST", "/api/projects/p1/script/plan/ops", { plan_id: "pln_1", doc: state().plan!.doc, approval: { state: "missing" } });

/** Выделение символов [start, end) в тексте блока (смещения — в тексте блока). */
function selectInBlock(blockId: string, start: number, end: number) {
  const el = document.querySelector(`[data-block-id="${blockId}"]`)!;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const points: [Node, number][] = [];
  let pos = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const len = n.textContent!.length;
    if (points.length === 0 && start <= pos + len) points.push([n, start - pos]);
    if (points.length === 1 && end <= pos + len) { points.push([n, end - pos]); break; }
    pos += len;
  }
  const r = document.createRange();
  r.setStart(...points[0]!);
  r.setEnd(...points[1]!);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(r);
  fireEvent.mouseUp(el);
}

it("план из 4 сцен → 4 карточки по порядку: номер, цитата, приём по-русски, длительность, предупреждения", () => {
  fakeFetch();
  renderQ(<PlanTab state={state()} onGenerated={() => {}} />);
  const list = cards();
  expect(list.map((c) => c.getAttribute("data-item"))).toEqual(["ss_001", "ss_002", "ss_003", "ss_004"]);
  const doc = state().plan!.doc;
  const first = within(list[0]!);
  expect(first.getByText(t("scriptPlan.scene.n", { n: 1 }))).toBeTruthy();
  expect(list[0]!.textContent).toContain(`«${doc.items[0]!.quote}»`);
  expect(list[0]!.textContent).toContain(formatDuration(doc.items[0]!.frames, F30));
  expect(list[0]!.textContent).toMatch(/речь \d+(,\d)? с \+ запас 1,5 с = \d+(,\d)? с/);
  expect((first.getByLabelText(t("scriptPlan.scene.technique")) as HTMLSelectElement).selectedOptions[0]!.textContent).toContain(techniqueLabel("hero-number"));
  expect(list[0]!.textContent).toContain(t("pattern.quantities"));
  expect(list[0]!.textContent).toContain("Go 1.24"); // число сцены с цитатой
  // предупреждения на карточке: value_unverified у ss_001, scene_long у ss_004
  expect(list[0]!.textContent).toContain(t("scriptPlan.issue.value_unverified"));
  expect(list[3]!.textContent).toContain(t("scriptPlan.issue.scene_long"));
  expect(list[3]!.textContent).toContain(t("scriptPlan.scene.byUser"));
  // пропуски с причинами, разнообразие, без сырых кодов и undefined
  expect(screen.getByTestId("plan-skipped").textContent).toContain("Повтор мысли предыдущей сцены");
  expect(screen.getByTestId("diversity").textContent).toContain(techniqueLabel("race"));
  const all = document.body.textContent!;
  expect(all).not.toMatch(/undefined|NaN|\bnull\b/);
  for (const code of ["hero-number", "value_unverified", "scene_long", "coverage_low", "structure-build"]) expect(all).not.toContain(code);
});

it("сообщения проверок без кодов: id сцен → «сцена N», приёмы и формы — по-русски", () => {
  fakeFetch();
  const s = state();
  s.plan!.doc.issues.push({ item_id: "ss_003", code: "adjacent_structure_repeat", severity: "warning", message: "ss_002 и ss_003: build-strike, race" });
  renderQ(<PlanTab state={s} onGenerated={() => {}} />);
  const li = screen.getByTestId("plan-issues").querySelector('[data-code="adjacent_structure_repeat"]')!;
  expect(li.textContent).toContain("сцена 2 и сцена 3: «сборка по шагам», «Гонка скоростей»");
});

it("F9: смысловой повтор — warning с подсказкой по-русски и номерами сцен", () => {
  fakeFetch();
  const s = state();
  s.plan!.doc.issues.push({ item_id: "ss_003", code: "meaning_repeat", severity: "warning", message: "ss_001 и ss_003 показывают одно и то же (общее: «оба массива») — покажите другой аспект или объедините сцены" });
  renderQ(<PlanTab state={s} onGenerated={() => {}} />);
  const li = screen.getByTestId("plan-issues").querySelector('[data-code="meaning_repeat"]')!;
  expect(li.textContent).toContain(t("scriptPlan.issue.meaning_repeat"));
  expect(li.textContent).toContain("сцена 1 и сцена 3 показывают одно и то же");
  expect(li.textContent).toContain("объедините сцены");
});

it("смена приёма → usePlanOps modify; «Убрать» → set_status rejected; «Вернуть» → accepted", async () => {
  const { calls } = fakeFetch([okOps()]);
  const s = state();
  s.plan!.doc.items[2]!.status = "rejected";
  renderQ(<PlanTab state={s} onGenerated={() => {}} />);
  fireEvent.change(within(cards()[1]!).getByLabelText(t("scriptPlan.scene.technique")), { target: { value: "flow-graph" } });
  await waitFor(() => expect(opsCalls(calls)).toHaveLength(1));
  expect(opsCalls(calls)[0]!.body).toEqual({ base_revision: 3, ops: [{ op: "modify", item_id: "ss_002", patch: { technique: "flow-graph" } }] });

  fireEvent.click(within(cards()[0]!).getByRole("button", { name: t("scriptPlan.scene.remove") }));
  await waitFor(() => expect(opsCalls(calls)).toHaveLength(2));
  expect(opsCalls(calls)[1]!.body).toEqual({ base_revision: 3, ops: [{ op: "set_status", item_id: "ss_001", status: "rejected" }] });

  // убранная сцена: без номера, кнопка «Вернуть»
  expect(cards()[2]!.textContent).toContain(t("scriptPlan.scene.rejected"));
  fireEvent.click(within(cards()[2]!).getByRole("button", { name: t("scriptPlan.scene.restore") }));
  await waitFor(() => expect(opsCalls(calls)).toHaveLength(3));
  expect(opsCalls(calls)[2]!.body).toEqual({ base_revision: 3, ops: [{ op: "set_status", item_id: "ss_003", status: "accepted" }] });
  // нумерация — только принятые: ss_004 — сцена 3
  expect(within(cards()[3]!).getByText(t("scriptPlan.scene.n", { n: 3 }))).toBeTruthy();
});

it("S16a F2/F3: сцена ждёт дозаполнения — подсказка в карточке, blocking «Сцена не заполнена», генерация недоступна", () => {
  fakeFetch();
  const s = state();
  s.plan!.doc.items[1] = { ...s.plan!.doc.items[1]!, idea: "", fill: "pending" };
  s.plan!.doc.issues.push({ item_id: "ss_002", code: "scene_unfilled", severity: "blocking", message: "ss_002: идею, назначение и числа дописывает Director" });
  renderQ(<PlanTab state={s} onGenerated={() => {}} />);
  expect(within(cards()[1]!).getByTestId("scene-fill").textContent).toBe(t("scriptPlan.scene.filling"));
  expect(within(cards()[0]!).queryByTestId("scene-fill")).toBeNull();
  const li = screen.getByTestId("plan-issues").querySelector('[data-code="scene_unfilled"]')!;
  expect(li.textContent).toContain(t("scriptPlan.issue.scene_unfilled"));
  expect(li.textContent).toContain("сцена 2: идею, назначение и числа дописывает Director");
});

it("правка идеи и назначения → modify с patch", async () => {
  const { calls } = fakeFetch([okOps()]);
  renderQ(<PlanTab state={state()} onGenerated={() => {}} />);
  const c = within(cards()[0]!);
  fireEvent.change(c.getByLabelText(t("scriptPlan.scene.idea")), { target: { value: "Число 1.24 вырастает в центре" } });
  fireEvent.click(c.getByRole("button", { name: t("scriptPlan.scene.saveText") }));
  await waitFor(() => expect(opsCalls(calls)).toHaveLength(1));
  expect(opsCalls(calls)[0]!.body).toEqual({ base_revision: 3, ops: [{ op: "modify", item_id: "ss_001", patch: { idea: "Число 1.24 вырастает в центре" } }] });
});

it("выделение в тексте → «Добавить сцену» → usePlanOps add с id слов", async () => {
  const { calls } = fakeFetch([okOps()]);
  const s = state();
  s.plan!.doc.items = s.plan!.doc.items.slice(0, 3); // блок 2 свободен
  renderQ(<PlanTab state={s} onGenerated={() => {}} />);
  // «Поиск сначала сравнивает» — символы 0..24 блока b2
  selectInBlock("b2", 0, 24);
  const bar = screen.getByTestId("selection-bar");
  expect(bar.textContent).toContain("«Поиск сначала сравнивает»");
  fireEvent.change(within(bar).getByLabelText(t("scriptPlan.selection.technique")), { target: { value: "process-steps" } });
  fireEvent.click(within(bar).getByRole("button", { name: t("scriptPlan.selection.add") }));
  await waitFor(() => expect(opsCalls(calls)).toHaveLength(1));
  expect(opsCalls(calls)[0]!.body).toEqual({ base_revision: 3, ops: [{ op: "add", start_word_id: "w_000019", end_word_id: "w_000021", technique: "process-steps" }] });
});

it("выделение без приёма → add без technique; выделение через два блока — подсказка, кнопки нет", async () => {
  const { calls } = fakeFetch([okOps()]);
  const s = state();
  s.plan!.doc.items = [];
  renderQ(<PlanTab state={s} onGenerated={() => {}} />);
  selectInBlock("b1", 2, 9);
  fireEvent.click(within(screen.getByTestId("selection-bar")).getByRole("button", { name: t("scriptPlan.selection.add") }));
  await waitFor(() => expect(opsCalls(calls)).toHaveLength(1));
  expect(opsCalls(calls)[0]!.body).toEqual({ base_revision: 3, ops: [{ op: "add", start_word_id: "w_000002", end_word_id: "w_000003" }] });

  const r = document.createRange();
  const b1 = document.querySelector('[data-block-id="b1"]')!;
  const b2 = document.querySelector('[data-block-id="b2"]')!;
  r.setStart(b1.firstChild!.firstChild ?? b1.firstChild!, 0);
  r.setEnd(b2.firstChild!.firstChild ?? b2.firstChild!, 3);
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(r);
  fireEvent.mouseUp(b2);
  expect(screen.getByText(t("scriptPlan.selection.cross"))).toBeTruthy();
  expect(screen.queryByRole("button", { name: t("scriptPlan.selection.add") })).toBeNull();
});

it("границы сцены по выделению → modify start/end", async () => {
  const { calls } = fakeFetch([okOps()]);
  renderQ(<PlanTab state={state()} onGenerated={() => {}} />);
  selectInBlock("b1", 2, 9); // «Go 1.24»
  fireEvent.click(within(cards()[0]!).getByRole("button", { name: t("scriptPlan.scene.useSelection") }));
  await waitFor(() => expect(opsCalls(calls)).toHaveLength(1));
  expect(opsCalls(calls)[0]!.body).toEqual({ base_revision: 3, ops: [{ op: "modify", item_id: "ss_001", patch: { start_word_id: "w_000002", end_word_id: "w_000003" } }] });
});

it("смена скорости чтения → set_reading", async () => {
  const { calls } = fakeFetch([okOps()]);
  renderQ(<PlanTab state={state()} onGenerated={() => {}} />);
  fireEvent.change(screen.getByLabelText(t("scriptPlan.reading.wps")), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: t("scriptPlan.reading.apply") }));
  await waitFor(() => expect(opsCalls(calls)).toHaveLength(1));
  expect(opsCalls(calls)[0]!.body).toEqual({ base_revision: 3, ops: [{ op: "set_reading", reading: { wps: 2, lead_s: 0.5, tail_s: 1 } }] });
});

it("скорость с запятой, округление до 0,01; поле текстовое с десятичной клавиатурой", async () => {
  const { calls } = fakeFetch([okOps()]);
  renderQ(<PlanTab state={state()} onGenerated={() => {}} />);
  const wps = screen.getByLabelText(t("scriptPlan.reading.wps")) as HTMLInputElement;
  expect(wps.type).toBe("text");
  expect(wps.inputMode).toBe("decimal");
  expect(wps.value).toBe("2,5");
  fireEvent.change(wps, { target: { value: "2,5" } });
  expect((screen.getByRole("button", { name: t("scriptPlan.reading.apply") }) as HTMLButtonElement).disabled).toBe(true); // не изменилось
  fireEvent.change(wps, { target: { value: "2,754" } });
  fireEvent.change(screen.getByLabelText(t("scriptPlan.reading.tail")), { target: { value: "1,5" } });
  fireEvent.click(screen.getByRole("button", { name: t("scriptPlan.reading.apply") }));
  await waitFor(() => expect(opsCalls(calls)).toHaveLength(1));
  expect(opsCalls(calls)[0]!.body).toEqual({ base_revision: 3, ops: [{ op: "set_reading", reading: { wps: 2.75, lead_s: 0.5, tail_s: 1.5 } }] });
});

it("скорость вне границ — подсказка, применить нельзя", () => {
  fakeFetch();
  renderQ(<PlanTab state={state()} onGenerated={() => {}} />);
  fireEvent.change(screen.getByLabelText(t("scriptPlan.reading.wps")), { target: { value: "9" } });
  expect(screen.getByText(t("scriptPlan.reading.invalid"))).toBeTruthy();
  expect((screen.getByRole("button", { name: t("scriptPlan.reading.apply") }) as HTMLButtonElement).disabled).toBe(true);
});

it("«Утвердить и сгенерировать 4 сцены» → generate с ревизией; затем onGenerated", async () => {
  const batch = { id: "sb_1", aspect: "16:9", plan_revision: 3, items: [], counts: { total: 4, pending: 4, running: 0, ready: 0, failed: 0, cancelled: 0, blocked: 0 } };
  const { calls } = fakeFetch([on("POST", "/api/projects/p1/script/generate", batch, 202)]);
  const onGenerated = vi.fn();
  renderQ(<PlanTab state={state()} onGenerated={onGenerated} />);
  const btn = screen.getByRole("button", { name: /Утвердить и сгенерировать 4 сцены/ }) as HTMLButtonElement;
  expect(btn.textContent).toMatch(/≈ \d+ мин, справочно \$\d/);
  fireEvent.click(btn);
  await waitFor(() => expect(onGenerated).toHaveBeenCalled());
  const post = calls.find((c) => c.url === "/api/projects/p1/script/generate")!;
  expect(post.body).toEqual({ revision: 3 });
  expect(post.headers["idempotency-key"]).toBeTruthy();
});

it("blocking issue → кнопка генерации недоступна, подсказка; проблема — красным с номером сцены", () => {
  fakeFetch();
  const s = state();
  s.plan!.doc.issues.push({ item_id: "ss_002", code: "adjacent_technique_repeat", severity: "blocking", message: "ss_001 и ss_002: hero-number" });
  renderQ(<PlanTab state={s} onGenerated={() => {}} />);
  const btn = screen.getByRole("button", { name: /Утвердить и сгенерировать/ }) as HTMLButtonElement;
  expect(btn.disabled).toBe(true);
  expect(screen.getByText(t("scriptPlan.generate.blocked", { n: 1 }))).toBeTruthy();
  const issues = screen.getByTestId("plan-issues");
  const blocking = issues.querySelector(".severity-blocking")!;
  expect(blocking.textContent).toContain(t("scriptPlan.issue.adjacent_technique_repeat"));
  expect(blocking.textContent).toContain(t("scriptPlan.scene.n", { n: 2 }));
  expect(issues.querySelector("li")).toBe(blocking.closest("li")); // blocking — первым
});

it("план устарел (текст новее) → генерация недоступна, текст без подсветки, выделение не создаёт сцен", () => {
  fakeFetch();
  renderQ(<PlanTab state={state({ plan_outdated: true })} onGenerated={() => {}} />);
  expect(screen.getByText(t("scriptPlan.outdated"))).toBeTruthy();
  expect(screen.getByRole("button", { name: t("scriptPlan.rebuild") })).toBeTruthy();
  expect((screen.getByRole("button", { name: /Утвердить и сгенерировать/ }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryAllByTestId("scene-fragment")).toHaveLength(0);
  selectInBlock("b2", 0, 24);
  expect(screen.queryByTestId("selection-bar")).toBeNull();
  expect(screen.queryByRole("button", { name: t("scriptPlan.scene.useSelection") })).toBeNull();
});

it("стиля проекта нет → генерация недоступна с причиной", () => {
  fakeFetch();
  renderQ(<PlanTab state={state({ style: null })} onGenerated={() => {}} />);
  expect((screen.getByRole("button", { name: /Утвердить и сгенерировать/ }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(t("scriptPlan.generate.noStyle"))).toBeTruthy();
});

it("422 blocking_issues от сервера — список проблем из ответа", async () => {
  fakeFetch([on("POST", "/api/projects/p1/script/generate", {
    error: "blocking_issues", message: "есть blocking",
    issues: [{ item_id: "ss_002", code: "scene_too_long", severity: "blocking", message: "речь 21 с" }],
  }, 422)]);
  renderQ(<PlanTab state={state()} onGenerated={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /Утвердить и сгенерировать/ }));
  const box = await screen.findByTestId("generate-error");
  expect(box.textContent).toContain(t("errors.blocking_issues"));
  expect(box.textContent).toContain(t("scriptPlan.issue.scene_too_long"));
  expect(box.textContent).toContain(t("scriptPlan.scene.n", { n: 2 }));
});

it("клик вне текста сбрасывает выделение; фрагмент выбирается с клавиатуры", () => {
  fakeFetch();
  const s = state();
  s.plan!.doc.items = s.plan!.doc.items.slice(0, 3);
  renderQ(<PlanTab state={s} onGenerated={() => {}} />);
  selectInBlock("b2", 0, 24);
  expect(screen.getByTestId("selection-bar")).toBeTruthy();
  fireEvent.mouseDown(screen.getByTestId("diversity"));
  expect(screen.queryByTestId("selection-bar")).toBeNull();
  const frag = screen.getAllByTestId("scene-fragment")[1]!;
  expect(frag.getAttribute("role")).toBe("button");
  expect(frag.getAttribute("tabindex")).toBe("0");
  fireEvent.keyDown(frag, { key: "Enter" });
  expect(cards()[1]!.className).toContain("selected");
});

it("ключ генерации устойчив к перемонтированию: план + ревизия + стиль", async () => {
  const batch = { id: "sb_1", aspect: "16:9", plan_revision: 3, items: [], counts: { total: 4, pending: 4, running: 0, ready: 0, failed: 0, cancelled: 0, blocked: 0 } };
  const { calls } = fakeFetch([on("POST", "/api/projects/p1/script/generate", batch, 202)]);
  const a = renderQ(<PlanTab state={state()} onGenerated={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /Утвердить и сгенерировать/ }));
  await waitFor(() => expect(calls.filter((c) => c.url.endsWith("/generate"))).toHaveLength(1));
  a.unmount();
  renderQ(<PlanTab state={state()} onGenerated={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /Утвердить и сгенерировать/ }));
  await waitFor(() => expect(calls.filter((c) => c.url.endsWith("/generate"))).toHaveLength(2));
  const keys = calls.filter((c) => c.url.endsWith("/generate")).map((c) => c.headers["idempotency-key"]);
  expect(keys[0]).toBe(keys[1]);
  expect(keys[0]).toContain("pln_1@r3");
});

it("пустые состояния: нет текста; нет плана; план без агента и без сцен", () => {
  fakeFetch();
  const { unmount } = renderQ(<PlanTab state={state({ script: null, plan: null })} onGenerated={() => {}} />);
  expect(screen.getByText(t("scriptPlan.plan.noScript"))).toBeTruthy();
  unmount();
  const r2 = renderQ(<PlanTab state={state({ plan: null })} onGenerated={() => {}} />);
  expect(screen.getByText(t("scriptPlan.plan.empty"))).toBeTruthy();
  expect(screen.getByRole("button", { name: t("scriptPlan.build") })).toBeTruthy();
  r2.unmount();
  const doc = scriptDoc();
  const s = state();
  s.plan!.doc = { ...planDoc(doc), items: [], issues: [], skipped: [], agent: "skipped", diversity: { techniques: {}, adjacent_repeats: 0, kinetic_share: 0 } };
  renderQ(<PlanTab state={s} onGenerated={() => {}} />);
  expect(screen.getByText(t("scriptPlan.plan.agentSkipped"))).toBeTruthy();
  expect(screen.getByText(t("scriptPlan.plan.noScenes"))).toBeTruthy();
  expect(screen.getByText(t("scriptPlan.generate.none"))).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/undefined|NaN/);
});

it("ошибка правки (409 revision_conflict) — текст из словаря", async () => {
  fakeFetch([on("POST", "/api/projects/p1/script/plan/ops", { error: "revision_conflict", message: "r4" }, 409)]);
  renderQ(<PlanTab state={state()} onGenerated={() => {}} />);
  fireEvent.click(within(cards()[0]!).getByRole("button", { name: t("scriptPlan.scene.remove") }));
  expect(await screen.findByText(t("errors.revision_conflict"))).toBeTruthy();
});
