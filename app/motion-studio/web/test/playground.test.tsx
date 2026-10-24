// Playground: база правки и «Рендера» (ruling 2026-10-23). По умолчанию — текущая версия;
// открытая нетекущая версия даёт явный переключатель «от текущей / от открытой», «Рендер»
// шлёт base_version_id той версии, от настроек которой посчитан патч. Неудачная последняя
// правка видна и после перезагрузки (баннер со ссылкой на версию).
import { defaultSettings } from "@ms/contracts";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Playground } from "../src/pages/Playground.js";
import { t } from "../src/i18n/index.js";
import { type Call, TS, fakeFetch, job, on, renderQ } from "./helpers.js";
import { historyEntry, versionDto } from "./fixtures.js";

afterEach(() => vi.unstubAllGlobals());

const v1Settings = { ...defaultSettings(), style_preset: "dark-premium" as const };
const v2Settings = { ...defaultSettings(), style_preset: "tech-neon" as const };

function routes(over: { current?: string; extra?: ReturnType<typeof historyEntry>[]; v1?: typeof v1Settings } = {}) {
  const versions = [historyEntry("v1", 1), historyEntry("v2", 2, { parent_version_id: "v1" }), ...(over.extra ?? [])];
  return fakeFetch([
    on("GET", "/api/scenes/s1", {
      scene: { id: "s1", project_id: "p1", title: "Сцена", current_version_id: over.current ?? "v2", approved_version_id: null, created_at: TS },
      versions,
      active_job: null,
    }),
    on("GET", "/api/versions/v1", versionDto("v1", 1, { settings: over.v1 ?? v1Settings })),
    on("GET", "/api/versions/v2", versionDto("v2", 2, { settings: v2Settings })),
    on("GET", "/api/versions/v3", versionDto("v3", 3, { settings: v2Settings, manifest: { ...versionDto("v3", 3).manifest, status: "failed", preview: null, failure: { stage: "engineer", message: "сломалось" } } })),
    on("GET", "/api/scenes/s1/messages", []),
    on("POST", "/api/scenes/s1/messages", { message: { id: "m1", scene_id: "s1", role: "user", text: "x", version_id: null, job_id: "job_1", created_at: TS }, job: job({ type: "playground.edit" }) }, 202),
    on("POST", "/api/scenes/s1/render", { job: job({ type: "playground.edit" }) }, 202),
    on("GET", /\/api\/jobs\//, { job: job({ type: "playground.edit" }), events: [], processes: [] }),
  ]);
}

const posts = (calls: Call[], url: string) => calls.filter((c) => c.method === "POST" && c.url === url);

async function sendChat(text: string) {
  fireEvent.change(await screen.findByLabelText(t("chat.input")), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: t("chat.send") }));
}

async function changeTheme(value: string) {
  const select = await screen.findByLabelText(t("playground.theme"));
  fireEvent.change(select, { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: t("playground.render") }));
}

it("открыта текущая версия: переключателя базы нет; правка без baseVersionId, «Рендер» — base_version_id текущей", async () => {
  const { calls } = routes();
  renderQ(<Playground id="s1" />);
  await screen.findByRole("heading", { name: t("versions.label", { n: 2 }) });
  expect(screen.queryByRole("radiogroup", { name: t("base.title") })).toBeNull();
  await sendChat("медленнее");
  await waitFor(() => expect(posts(calls, "/api/scenes/s1/messages")).toHaveLength(1));
  expect(posts(calls, "/api/scenes/s1/messages")[0]!.body).toEqual({ text: "медленнее" });
  await changeTheme("light-clean");
  await waitFor(() => expect(posts(calls, "/api/scenes/s1/render")).toHaveLength(1));
  expect(posts(calls, "/api/scenes/s1/render")[0]!.body).toEqual({ settings_patch: { style_preset: "light-clean" }, base_version_id: "v2" });
});

it("открыта v1, текущая v2: по умолчанию база — текущая (форма с настройками v2), выбор «от открытой» помечен и уходит на сервер", async () => {
  const { calls } = routes();
  renderQ(<Playground id="s1" version="v1" />);
  const group = await screen.findByRole("radiogroup", { name: t("base.title") });
  expect(group.textContent).toContain(t("base.current", { n: 2 }));
  const select = (await screen.findByLabelText(t("playground.theme"))) as HTMLSelectElement;
  await waitFor(() => expect(select.value).toBe("tech-neon"));
  expect(screen.getByTestId("settings-base").textContent).toBe(t("settings.ofBase", { n: 2 }));
  // от текущей: чат без базы, «Рендер» — патч относительно v2 и base_version_id v2
  await sendChat("ярче");
  await waitFor(() => expect(posts(calls, "/api/scenes/s1/messages")).toHaveLength(1));
  expect(posts(calls, "/api/scenes/s1/messages")[0]!.body).toEqual({ text: "ярче" });
  await changeTheme("dark-premium");
  await waitFor(() => expect(posts(calls, "/api/scenes/s1/render")).toHaveLength(1));
  expect(posts(calls, "/api/scenes/s1/render")[0]!.body).toEqual({ settings_patch: { style_preset: "dark-premium" }, base_version_id: "v2" });

  // явный выбор открытой версии: пометка у чата, форма — настройки v1
  fireEvent.click(screen.getByRole("radio", { name: t("base.open", { n: 1 }) }));
  expect(await screen.findByText(t("base.editFrom", { n: 1 }))).toBeTruthy();
  await waitFor(() => expect(((screen.getByLabelText(t("playground.theme"))) as HTMLSelectElement).value).toBe("dark-premium"));
  await sendChat("верни цвета");
  await waitFor(() => expect(posts(calls, "/api/scenes/s1/messages")).toHaveLength(2));
  expect(posts(calls, "/api/scenes/s1/messages")[1]!.body).toEqual({ text: "верни цвета", baseVersionId: "v1" });
  await changeTheme("tech-neon");
  await waitFor(() => expect(posts(calls, "/api/scenes/s1/render")).toHaveLength(2));
  expect(posts(calls, "/api/scenes/s1/render")[1]!.body).toEqual({ settings_patch: { style_preset: "tech-neon" }, base_version_id: "v1" });
});

it("смена базы и сразу правка темы (до эффектов): форма уже от новой базы, патч — только тема", async () => {
  // e2e versions.spec: выбор «от открытой» и сразу «Тема» — обработчик темы видел черновик
  // прежней базы (эффект сброса ещё не применился), и в патч попадала длительность прежней базы
  const v1Long = { ...v1Settings, duration_frames: v2Settings.duration_frames + 30 };
  const { calls: c2 } = routes({ v1: v1Long });
  renderQ(<Playground id="s1" version="v1" />);
  const select = (await screen.findByLabelText(t("playground.theme"))) as HTMLSelectElement;
  await waitFor(() => expect(select.value).toBe("tech-neon"));
  act(() => {
    fireEvent.click(screen.getByRole("radio", { name: t("base.open", { n: 1 }) }));
    fireEvent.change(screen.getByLabelText(t("playground.theme")), { target: { value: "light-clean" } });
  });
  fireEvent.click(screen.getByRole("button", { name: t("playground.render") }));
  await waitFor(() => expect(posts(c2, "/api/scenes/s1/render")).toHaveLength(1));
  expect(posts(c2, "/api/scenes/s1/render")[0]!.body).toEqual({ settings_patch: { style_preset: "light-clean" }, base_version_id: "v1" });
});

it("смена базы сбрасывает черновик: возврат к прежней базе показывает её настройки, а не старую правку", async () => {
  routes();
  renderQ(<Playground id="s1" version="v1" />);
  const theme = () => screen.getByLabelText(t("playground.theme")) as HTMLSelectElement;
  await waitFor(() => expect(theme().value).toBe("tech-neon"));
  fireEvent.change(theme(), { target: { value: "light-clean" } });
  expect(theme().value).toBe("light-clean");
  fireEvent.click(screen.getByRole("radio", { name: t("base.open", { n: 1 }) }));
  await waitFor(() => expect(theme().value).toBe("dark-premium"));
  fireEvent.click(screen.getByRole("radio", { name: t("base.current", { n: 2 }) }));
  await waitFor(() => expect(theme().value).toBe("tech-neon"));
  expect((screen.getByRole("button", { name: t("playground.render") }) as HTMLButtonElement).disabled).toBe(true);
});

it("вкладка «Spec и данные» одной версии: spec, props, settings — JSON текстом; нечитаемые файлы помечены", async () => {
  routes();
  vi.unstubAllGlobals();
  fakeFetch([
    on("GET", "/api/scenes/s1", {
      scene: { id: "s1", project_id: "p1", title: "Сцена", current_version_id: "v2", approved_version_id: null, created_at: TS },
      versions: [historyEntry("v2", 2)],
      active_job: null,
    }),
    on("GET", "/api/versions/v2", versionDto("v2", 2, { settings: v2Settings, props: { title: "<b>Рост</b>" }, unreadable_files: ["src/Broken.tsx"] })),
    on("GET", "/api/scenes/s1/messages", []),
  ]);
  renderQ(<Playground id="s1" />);
  const panel = await screen.findByRole("region", { name: t("specView.title") });
  expect(panel.querySelector("pre")!.textContent).toContain('"start_frame": 60');
  fireEvent.click(screen.getByRole("tab", { name: t("specView.tab.props") }));
  expect(panel.querySelector("pre")!.textContent).toContain("<b>Рост</b>");
  expect(panel.querySelector("pre b")).toBeNull();
  fireEvent.click(screen.getByRole("tab", { name: t("specView.tab.settings") }));
  expect(panel.querySelector("pre")!.textContent).toContain('"style_preset": "tech-neon"');
  expect(screen.getByTestId("unreadable").textContent).toContain("src/Broken.tsx");
});

it("последняя версия не удалась (новее текущей): баннер виден без состояния страницы, «Открыть» ведёт на неё", async () => {
  routes({ extra: [historyEntry("v3", 3, { parent_version_id: "v2", status: "failed", qa: null })] });
  renderQ(<Playground id="s1" />);
  const banner = await screen.findByRole("alert", { name: t("playground.lastFailed", { n: 3 }) });
  expect(banner.textContent).toContain(t("playground.lastFailed", { n: 3 }));
  expect(banner.querySelector("button")).toBeTruthy();
});
