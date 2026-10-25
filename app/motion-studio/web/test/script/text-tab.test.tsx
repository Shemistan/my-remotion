// S8: вкладка «Текст» — блоки, счётчик слов и время чтения, сохранение (PUT), ошибки по
// словарю, «Построить план» (задача script.plan) и подсветка фрагментов плана.
import { DEFAULT_READING } from "@ms/contracts";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { ApiError } from "../../src/api/client.js";
import { errorText, t } from "../../src/i18n/index.js";
import { TextTab } from "../../src/pages/script/TextTab.js";
import { fakeFetch, job, on, renderQ } from "../helpers.js";
import { BLOCKS, emptyState, state } from "./plan-fixtures.js";

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

const bodyText = () => document.body.textContent ?? "";

it("пустой проект: ввод двух блоков → «Сохранить» → PUT с blocks; счётчик слов и времени", async () => {
  const { calls } = fakeFetch([on("PUT", "/api/projects/p1/script", { script: state().script, reading: DEFAULT_READING })]);
  renderQ(<TextTab state={emptyState()} onPlan={() => {}} />);
  expect(screen.getByText(t("scriptPlan.text.empty"))).toBeTruthy();
  const save = screen.getByRole("button", { name: t("scriptPlan.text.save") });
  expect((save as HTMLButtonElement).disabled).toBe(true); // пустой блок не сохраняется

  fireEvent.change(screen.getByLabelText(t("scriptPlan.block.title", { n: 1 })), { target: { value: "Начало" } });
  fireEvent.change(screen.getByLabelText(t("scriptPlan.block.text", { n: 1 })), { target: { value: "слово ".repeat(205).trim() } });
  expect(bodyText()).toContain("205 слов · 1:22");
  fireEvent.click(screen.getByRole("button", { name: t("scriptPlan.block.add") }));
  fireEvent.change(screen.getByLabelText(t("scriptPlan.block.text", { n: 2 })), { target: { value: "Ещё три слова" } });
  expect(bodyText()).toContain("3 слова · 0:02");
  expect(bodyText()).toContain(t("scriptPlan.text.total", { summary: "208 слов · 1:24" }));

  fireEvent.click(save);
  await waitFor(() => expect(calls.find((c) => c.method === "PUT")).toBeTruthy());
  expect(calls.find((c) => c.method === "PUT")!.body).toEqual({
    blocks: [{ title: "Начало", text: "слово ".repeat(205).trim() }, { title: "", text: "Ещё три слова" }],
  });
  expect(bodyText()).not.toMatch(/undefined|NaN/);
});

it("правка сохранённого текста → PUT с base_revision; 409 → текст ошибки revision_conflict", async () => {
  const { calls } = fakeFetch([on("PUT", "/api/projects/p1/script", { error: "revision_conflict", message: "ревизия 2" }, 409)]);
  renderQ(<TextTab state={state()} onPlan={() => {}} />);
  const area = screen.getByLabelText(t("scriptPlan.block.text", { n: 2 }));
  expect((area as HTMLTextAreaElement).value).toBe(BLOCKS[1]!.text);
  fireEvent.change(area, { target: { value: `${BLOCKS[1]!.text} Конец.` } });
  expect(screen.getByText(t("scriptPlan.text.unsaved"))).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: t("scriptPlan.text.save") }));
  const msg = errorText(new ApiError(409, "revision_conflict", "ревизия 2"));
  expect(await screen.findByText(msg)).toBeTruthy();
  expect(msg).toBe(t("errors.revision_conflict"));
  expect(calls.find((c) => c.method === "PUT")!.body).toMatchObject({ base_revision: 1 });
});

it("удаление блока; пустой блок — подсказка и сохранение недоступно", () => {
  fakeFetch();
  renderQ(<TextTab state={state()} onPlan={() => {}} />);
  fireEvent.change(screen.getByLabelText(t("scriptPlan.block.text", { n: 1 })), { target: { value: "  " } });
  expect(screen.getByText(t("scriptPlan.block.emptyHint"))).toBeTruthy();
  expect((screen.getByRole("button", { name: t("scriptPlan.text.save") }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getAllByRole("button", { name: t("scriptPlan.block.remove") })[0]!);
  expect(screen.queryByLabelText(t("scriptPlan.block.text", { n: 2 }))).toBeNull();
  expect((screen.getByLabelText(t("scriptPlan.block.text", { n: 1 })) as HTMLTextAreaElement).value).toBe(BLOCKS[1]!.text);
});

it("«Построить план» без плана: задача script.plan со скоростью чтения; завершилась → onPlan", async () => {
  const s = state({ plan: null });
  const done = job({ id: "job_p", type: "script.plan", scene_id: null, status: "completed", progress: 1, stage: null });
  const { calls } = fakeFetch([
    on("POST", "/api/projects/p1/script/plan", { job: job({ id: "job_p", type: "script.plan", scene_id: null, status: "pending" }) }, 202),
    on("GET", "/api/jobs/job_p", { job: done, events: [], processes: [] }),
  ]);
  const onPlan = vi.fn();
  renderQ(<TextTab state={s} onPlan={onPlan} />);
  // скорость меняется до плана — уходит в запрос
  fireEvent.change(screen.getByLabelText(t("scriptPlan.reading.wps")), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: t("scriptPlan.reading.apply") }));
  fireEvent.click(screen.getByRole("button", { name: t("scriptPlan.build") }));
  await waitFor(() => expect(onPlan).toHaveBeenCalled());
  const post = calls.find((c) => c.method === "POST")!;
  expect(post.body).toEqual({ useAgent: true, reading: { ...DEFAULT_READING, wps: 3 } });
  expect(post.headers["idempotency-key"]).toBeTruthy();
});

it("есть план: «Перестроить план» спрашивает подтверждение; текст новее плана — предупреждение; фрагменты плана в тексте", async () => {
  const { calls } = fakeFetch([on("POST", "/api/projects/p1/script/plan", { job: job({ id: "job_p", type: "script.plan", status: "pending" }) }, 202)]);
  renderQ(<TextTab state={state({ plan_outdated: true })} onPlan={() => {}} />);
  expect(screen.getByText(t("scriptPlan.outdated"))).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: t("scriptPlan.rebuild") }));
  expect(screen.getByText(t("scriptPlan.rebuild.warning"))).toBeTruthy();
  expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: t("scriptPlan.rebuild.confirm") }));
  await waitFor(() => expect(calls.filter((c) => c.method === "POST")).toHaveLength(1));
  // план по прежнему тексту: id слов чужой ревизии — без подсветки
  expect(within(screen.getByTestId("script-text")).queryAllByTestId("scene-fragment")).toHaveLength(0);
});

it("S16a: идущее дозаполнение сцены (script.plan с fill) — не построение плана: кнопка доступна, статуса задачи нет", async () => {
  const fill = job({ id: "job_f", type: "script.plan", scene_id: null, status: "running", input: { projectId: "p1", fill: { plan_id: "pln_1", revision: 3 } } });
  const { calls } = fakeFetch([on("GET", "/api/jobs?status=running", [fill]), on("GET", "/api/jobs?status=pending", [])]);
  renderQ(<TextTab state={state()} onPlan={() => {}} />);
  await waitFor(() => expect(calls.some((c) => c.url === "/api/jobs?status=running")).toBe(true));
  await new Promise((r) => setTimeout(r, 20));
  expect((screen.getByRole("button", { name: t("scriptPlan.rebuild") }) as HTMLButtonElement).disabled).toBe(false);
  expect(calls.some((c) => c.url === "/api/jobs/job_f")).toBe(false);
});

it("план актуален — фрагменты плана подсвечены с номерами сцен", () => {
  fakeFetch();
  renderQ(<TextTab state={state()} onPlan={() => {}} />);
  const text = screen.getByTestId("script-text");
  expect(within(text).getAllByTestId("scene-fragment").map((x) => x.getAttribute("data-n"))).toEqual(["1", "2", "3", "4"]);
});

it("черновик и скорость до плана переживают смену вкладки (перемонтирование)", () => {
  fakeFetch();
  const s = state({ plan: null });
  const first = renderQ(<TextTab state={s} onPlan={() => {}} />);
  fireEvent.change(screen.getByLabelText(t("scriptPlan.block.text", { n: 1 })), { target: { value: "Черновик" } });
  fireEvent.change(screen.getByLabelText(t("scriptPlan.reading.wps")), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: t("scriptPlan.reading.apply") }));
  first.unmount();
  renderQ(<TextTab state={s} onPlan={() => {}} />);
  expect((screen.getByLabelText(t("scriptPlan.block.text", { n: 1 })) as HTMLTextAreaElement).value).toBe("Черновик");
  expect(screen.getByText(t("scriptPlan.text.unsaved"))).toBeTruthy();
  expect((screen.getByLabelText(t("scriptPlan.reading.wps")) as HTMLInputElement).value).toBe("3");
});

it("на сервере новая ревизия при грязном черновике: черновик не затирается, выбор «взять серверную» / «сохранить свою»", async () => {
  const { calls } = fakeFetch([on("PUT", "/api/projects/p1/script", { script: state().script, reading: DEFAULT_READING })]);
  const v1 = state();
  const r = renderQ(<TextTab state={v1} onPlan={() => {}} />);
  fireEvent.change(screen.getByLabelText(t("scriptPlan.block.text", { n: 1 })), { target: { value: "Моя правка" } });
  // пришла ревизия 2 (правка в другой вкладке или ответ 409 и перечитывание)
  const v2 = state({ script: { ...v1.script!, revision: 2 } });
  r.rerender(<QueryClientProvider client={r.client}><TextTab state={v2} onPlan={() => {}} /></QueryClientProvider>);
  expect((screen.getByLabelText(t("scriptPlan.block.text", { n: 1 })) as HTMLTextAreaElement).value).toBe("Моя правка");
  expect(screen.getByText(t("scriptPlan.text.conflict", { n: 2 }))).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: t("scriptPlan.text.keepMine") }));
  await waitFor(() => expect(calls.find((c) => c.method === "PUT")).toBeTruthy());
  expect(calls.find((c) => c.method === "PUT")!.body).toMatchObject({ base_revision: 2 });
});

it("конфликт: «Взять серверную» — черновик заменяется текстом сервера", () => {
  fakeFetch();
  const v1 = state();
  const r = renderQ(<TextTab state={v1} onPlan={() => {}} />);
  fireEvent.change(screen.getByLabelText(t("scriptPlan.block.text", { n: 1 })), { target: { value: "Моя правка" } });
  r.rerender(<QueryClientProvider client={r.client}><TextTab state={state({ script: { ...v1.script!, revision: 2 } })} onPlan={() => {}} /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: t("scriptPlan.text.takeServer") }));
  expect((screen.getByLabelText(t("scriptPlan.block.text", { n: 1 })) as HTMLTextAreaElement).value).toBe(BLOCKS[0]!.text);
  expect(screen.queryByText(t("scriptPlan.text.conflict", { n: 2 }))).toBeNull();
});

it("сохранённый текст без правок — «Построить план» доступна; есть несохранённые правки — нет", () => {
  fakeFetch();
  renderQ(<TextTab state={state({ plan: null })} onPlan={() => {}} />);
  const build = screen.getByRole("button", { name: t("scriptPlan.build") }) as HTMLButtonElement;
  expect(build.disabled).toBe(false);
  fireEvent.change(screen.getByLabelText(t("scriptPlan.block.text", { n: 1 })), { target: { value: "Другой текст" } });
  expect(build.disabled).toBe(true);
  expect(screen.getByText(t("scriptPlan.build.needSave"))).toBeTruthy();
});
