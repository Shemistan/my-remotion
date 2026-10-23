// Chat: сообщения пользователя, ассистента и системы (как текст), отправка правки с
// Idempotency-Key; уточняющие вопросы Concept — ответ или «Пропустить».
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Chat } from "../src/components/Chat.js";
import { ClarifyQuestions } from "../src/components/ClarifyQuestions.js";
import { t } from "../src/i18n/index.js";
import { TS, fakeFetch, job, on, renderQ } from "./helpers.js";

afterEach(() => vi.unstubAllGlobals());

const msg = (id: string, role: string, text: string) => ({ id, scene_id: "s1", role, text, created_at: TS });

it("сообщения трёх ролей; текст данных не разбирается как HTML", async () => {
  fakeFetch([on("GET", "/api/scenes/s1/messages", [
    msg("m1", "user", "сделай фиолетовым"),
    msg("m2", "assistant", "Готово: v2.\nТемп не сохранён: сцена зашила кадры"),
    msg("m3", "system", "<b>жирный</b>"),
  ])]);
  renderQ(<Chat sceneId="s1" />);
  expect(await screen.findByText("сделай фиолетовым")).toBeTruthy();
  expect(screen.getByText(/Темп не сохранён/)).toBeTruthy();
  expect(screen.getByText("<b>жирный</b>")).toBeTruthy();
  expect(document.querySelector("b")).toBeNull();
  expect(screen.getAllByText(t("chat.role.assistant")).length).toBe(1);
  expect(screen.getAllByText(t("chat.role.system")).length).toBe(1);
  // предупреждения в ответе ассистента выделены
  expect(screen.getByText(/Темп не сохранён/).closest("[data-warning]")).toBeTruthy();
});

it("scrollIntoView, вернувший Promise (новые Chrome), не ломает размонтирование чата", async () => {
  const proto = Element.prototype as unknown as { scrollIntoView?: unknown };
  const prev = proto.scrollIntoView;
  proto.scrollIntoView = () => Promise.resolve();
  const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    fakeFetch([on("GET", "/api/scenes/s1/messages", [msg("m1", "user", "привет")])]);
    const view = renderQ(<Chat sceneId="s1" />);
    expect(await screen.findByText("привет")).toBeTruthy();
    expect(() => view.unmount()).not.toThrow();
    expect(errors.mock.calls.flat().join(" ")).not.toMatch(/effect/i);
  } finally {
    errors.mockRestore();
    proto.scrollIntoView = prev;
  }
});

it("отправка → POST /messages с Idempotency-Key и текстом; поле очищается", async () => {
  const { calls } = fakeFetch([
    on("GET", "/api/scenes/s1/messages", []),
    on("POST", "/api/scenes/s1/messages", { message: msg("m9", "user", "медленнее на 25 %"), job: job({ type: "playground.edit" }) }, 202),
  ]);
  renderQ(<Chat sceneId="s1" baseVersionId="v2" />);
  const box = await screen.findByLabelText(t("chat.input"));
  fireEvent.change(box, { target: { value: "медленнее на 25 %" } });
  fireEvent.click(screen.getByRole("button", { name: t("chat.send") }));
  await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
  const post = calls.find((c) => c.method === "POST")!;
  expect(post.url).toBe("/api/scenes/s1/messages");
  expect(post.headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
  expect(post.body).toEqual({ text: "медленнее на 25 %", baseVersionId: "v2" });
  await waitFor(() => expect((box as HTMLTextAreaElement).value).toBe(""));
});

it("пустое сообщение не отправляется; отказ сервера показан", async () => {
  const { calls } = fakeFetch([
    on("GET", "/api/scenes/s1/messages", []),
    on("POST", "/api/scenes/s1/messages", { error: "no_versions", message: "нет версий" }, 409),
  ]);
  renderQ(<Chat sceneId="s1" />);
  const send = await screen.findByRole("button", { name: t("chat.send") });
  expect((send as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText(t("chat.input")), { target: { value: "правка" } });
  fireEvent.click(send);
  expect(await screen.findByText(t("errors.no_versions"))).toBeTruthy();
  expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
});

it("вопросы Concept: ответы по тексту вопроса → POST /jobs/:id/input; «Пропустить» → skip", async () => {
  const { calls } = fakeFetch([on("POST", "/api/jobs/job_1/input", job({ status: "pending" }))]);
  const questions = [{ question: "Сколько узлов?", default_if_skipped: "пять" }, { question: "Какая палитра?", default_if_skipped: "по пресету" }];
  renderQ(<ClarifyQuestions jobId="job_1" questions={questions} />);
  expect(screen.getByText("Сколько узлов?")).toBeTruthy();
  expect(screen.getByText(t("clarify.default", { value: "пять" }))).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Сколько узлов?"), { target: { value: "три" } });
  fireEvent.click(screen.getByRole("button", { name: t("clarify.answer") }));
  await waitFor(() => expect(calls).toHaveLength(1));
  // ключ — текст вопроса; пропущенный вопрос сервер дополнит default_if_skipped
  expect(calls[0]!.body).toEqual({ answers: { "Сколько узлов?": "три" } });
  fireEvent.click(screen.getByRole("button", { name: t("clarify.skip") }));
  await waitFor(() => expect(calls).toHaveLength(2));
  expect(calls[1]!.body).toEqual({ skip: true });
});
