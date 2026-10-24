// EvidenceQuote (Task 33): цитата, таймкоды после монтажа и исходника, кадры; клик — проиграть
// фрагмент (edited-диапазон цитаты: начало и пауза на конце).
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { EvidenceQuote } from "../../src/components/video/EvidenceQuote.js";
import { t } from "../../src/i18n/index.js";
import { dec, edlDto } from "./fixtures.js";

// таймлайн: принятая вырезка 1,0–2,5 с — edited 1,5 с = source 3,0 с
const tl = edlDto([dec("pau_r1_1", { status: "accepted" })]).timeline;

it("подписи: цитата, после монтажа, исходник, кадры; клик — onPlay(edited-диапазон)", () => {
  const onPlay = vi.fn();
  const ev = { quote: "как дела", start_word_id: "w_000004", end_word_id: "w_000005", edited: { start_us: 1_500_000, end_us: 2_400_000 } };
  render(<EvidenceQuote evidence={ev} timeline={tl} onPlay={onPlay} />);
  const text = screen.getByTestId("evidence").textContent ?? "";
  expect(text).toContain("«как дела»");
  expect(text).toContain(t("evidence.edited", { from: "00:00:01.50", to: "00:00:02.40" }));
  expect(text).toContain(t("evidence.source", { from: "00:00:03.00", to: "00:00:03.90" }));
  expect(text).toContain(t("evidence.frames", { from: 45, to: 72 }));
  fireEvent.click(screen.getByRole("button", { name: t("evidence.play") }));
  expect(onPlay).toHaveBeenCalledWith({ start_us: 1_500_000, end_us: 2_400_000 });
});

it("цитата нулевой длины (вставленное слово) — фрагмент не пустой: до конца кадра", () => {
  const onPlay = vi.fn();
  render(<EvidenceQuote evidence={{ quote: "мир", start_word_id: "w_000002", end_word_id: "w_000002", edited: { start_us: 600_000, end_us: 600_000 } }} timeline={tl} onPlay={onPlay} />);
  fireEvent.click(screen.getByRole("button", { name: t("evidence.play") }));
  expect(onPlay).toHaveBeenCalledWith({ start_us: 600_000, end_us: 633_334 });
});
