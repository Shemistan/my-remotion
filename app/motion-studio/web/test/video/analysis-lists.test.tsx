// Вкладка «Анализ» (Task 33): шоты (позиция автора, движение, лицо, неуверенность, миниатюра
// ключевого кадра), главы с переходом по клику, якоря с бейджем claim_type, спорные места отдельно.
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AnchorList } from "../../src/components/video/AnchorList.js";
import { ChaptersPanel } from "../../src/components/video/ChaptersPanel.js";
import { ShotList } from "../../src/components/video/ShotList.js";
import { t } from "../../src/i18n/index.js";
import { WORDS } from "./fixtures.js";
import { semantic, shot } from "./plan-fixtures.js";

it("AnchorList: claim_type assumption — бейдж «предположение»; вид якоря; числа; спорные места отдельным списком; клик — переход", () => {
  const onSeek = vi.fn();
  render(<AnchorList semantic={semantic()} words={WORDS} onSeek={onSeek} />);
  const a1 = screen.getByTestId("anchor-a1");
  expect(a1.textContent).toContain(t("semantic.claim.assumption"));
  expect(a1.textContent).toContain(t("semantic.kind.thesis"));
  expect(a1.textContent).toContain("Привет мир.");
  expect(screen.getByTestId("anchor-a2").textContent).toContain(t("semantic.claim.opinion"));
  expect(screen.getByTestId("disputed").textContent).toContain("неясно, о ком речь");
  expect(screen.getByTestId("numbers").textContent).toContain("5 %");
  fireEvent.click(a1.querySelector("button")!);
  expect(onSeek).toHaveBeenCalledWith(0);
});

it("ChaptersPanel: главы по порядку, клик — переход к первому слову главы (source)", () => {
  const onSeek = vi.fn();
  render(<ChaptersPanel semantic={semantic()} words={WORDS} onSeek={onSeek} />);
  fireEvent.click(screen.getByRole("button", { name: /Вопрос/ }));
  expect(onSeek).toHaveBeenCalledWith(3_000_000);
  expect(screen.getByTestId("chapters").textContent).toContain("автор здоровается");
});

it("ShotList: подписи шота по-русски, миниатюра ключевого кадра, клик — переход", () => {
  const onSeek = vi.fn();
  render(<ShotList footageId="ftg_1" shots={[shot({ uncertainty: ["лицо частично вне кадра"] }), shot({ id: "shot_002", source_start_us: 10_000_000, source_end_us: 12_000_000, face: { detected_ratio: 0, source: "vision" }, author_position: "absent" })]} currentUs={10_500_000} onSeek={onSeek} />);
  const s1 = screen.getByTestId("shot-shot_001");
  expect(s1.textContent).toContain(t("analysis.author.right"));
  expect(s1.textContent).toContain(t("analysis.motion.static"));
  expect(s1.textContent).toContain(t("analysis.faceFound", { pct: 100 }));
  expect(s1.textContent).toContain(t("analysis.uncertainty", { text: "лицо частично вне кадра" }));
  expect(s1.querySelector("img")!.getAttribute("src")).toBe("/api/footage/ftg_1/frames/500000.png");
  const s2 = screen.getByTestId("shot-shot_002");
  expect(s2.textContent).toContain(t("analysis.noFace"));
  expect(s2.className).toContain("current");
  fireEvent.click(s2.querySelector("button")!);
  expect(onSeek).toHaveBeenCalledWith(10_000_000);
});
