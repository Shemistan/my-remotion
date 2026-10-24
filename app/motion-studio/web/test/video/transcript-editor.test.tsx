// TranscriptEditor: слова — спаны (клик → seek), текущее слово подсвечено, интерполированные —
// с подсказкой, вырезанные зачёркнуты; правка сегмента → replace_span от текущей ревизии;
// 409 → сообщение и перезагрузка транскрипта.
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TranscriptEditor } from "../../src/components/video/TranscriptEditor.js";
import { t } from "../../src/i18n/index.js";
import { fakeFetch, on, renderQ } from "../helpers.js";
import { edlDto, transcriptDto } from "./fixtures.js";

afterEach(() => vi.unstubAllGlobals());

const props = (over: Record<string, unknown> = {}) => ({
  transcript: transcriptDto(),
  wordMap: edlDto().word_map,
  currentUs: 600_000,
  onSeek: vi.fn(),
  onCut: vi.fn(),
  ...over,
});

it("слова: клик → seek в начало слова; текущее подсвечено; интерполированное — пунктир с подсказкой", () => {
  fakeFetch();
  const p = props();
  renderQ(<TranscriptEditor {...p} />);
  fireEvent.click(screen.getByText("как"));
  expect(p.onSeek).toHaveBeenCalledWith(3_000_000);
  expect(screen.getByText("мир.").className).toContain("current");
  expect(screen.getByText("дела").className).toContain("interpolated");
  expect(screen.getByText("дела").getAttribute("title")).toBe(t("transcript.interpolated"));
});

it("вырезанное слово зачёркнуто (word_map: removed)", () => {
  fakeFetch();
  const map = { ...edlDto().word_map, w_000003: { state: "removed" as const } };
  renderQ(<TranscriptEditor {...props({ wordMap: map })} />);
  expect(screen.getByText("эээ").className).toContain("removed");
});

it("правка сегмента «Привет большой мир» → POST revisions: replace_span по словам сегмента, base_revision текущей", async () => {
  const { calls } = fakeFetch([on("POST", "/api/transcripts/trn_1/revisions", transcriptDto({ revision: 2 }), 201)]);
  const onSaved = vi.fn();
  renderQ(<TranscriptEditor {...props({ onSaved })} />);
  fireEvent.click(screen.getAllByRole("button", { name: t("transcript.edit") })[0]!);
  fireEvent.change(screen.getByRole("textbox", { name: t("transcript.segmentText") }), { target: { value: "Привет большой мир" } });
  fireEvent.click(screen.getByRole("button", { name: t("transcript.save") }));
  await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
  const post = calls.find((c) => c.method === "POST")!;
  expect(post.body).toEqual({ base_revision: 1, ops: [{ op: "replace_span", start_word_id: "w_000001", end_word_id: "w_000002", text: "Привет большой мир" }] });
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
});

it("409 revision_conflict → сообщение t(transcript.conflict) и перезагрузка", async () => {
  fakeFetch([on("POST", "/api/transcripts/trn_1/revisions", { error: "revision_conflict", message: "r1 → r2", base: 1, current: 2 }, 409)]);
  const onConflict = vi.fn();
  renderQ(<TranscriptEditor {...props({ onConflict })} />);
  fireEvent.click(screen.getAllByRole("button", { name: t("transcript.edit") })[0]!);
  fireEvent.change(screen.getByRole("textbox", { name: t("transcript.segmentText") }), { target: { value: "Привет мир" } });
  fireEvent.click(screen.getByRole("button", { name: t("transcript.save") }));
  expect(await screen.findByText(t("transcript.conflict"))).toBeTruthy();
  expect(onConflict).toHaveBeenCalled();
});

it("выделение: клик и shift+клик → «Вырезать выделенное» с первым и последним словом", () => {
  fakeFetch();
  const p = props();
  renderQ(<TranscriptEditor {...p} />);
  fireEvent.click(screen.getByText("мир."));
  fireEvent.click(screen.getByText("как"), { shiftKey: true });
  fireEvent.click(screen.getByRole("button", { name: t("transcript.cutSelection", { n: 3 }) }));
  expect(p.onCut).toHaveBeenCalledWith("w_000002", "w_000004");
});
