// Слово транскрипта: текущее (по времени плеера) подсвечено, интерполированное — пунктир с
// подсказкой «время оценено», вырезанное — зачёркнуто, задетое вырезкой — частично. С клавиатуры —
// кнопка в порядке Tab: Enter/Space как клик (ревью Task 29 M6).
import type { TranscriptWord, WordMapping } from "@ms/contracts";
import type { KeyboardEvent } from "react";
import { t } from "../../i18n/index.js";

export interface WordSpanProps {
  word: TranscriptWord;
  mapping?: WordMapping;
  current: boolean;
  selected: boolean;
  onClick: (word: TranscriptWord, e: { shiftKey: boolean }) => void;
}

export function WordSpan({ word, mapping, current, selected, onClick }: WordSpanProps) {
  const cls = ["word"];
  if (current) cls.push("current");
  if (selected) cls.push("selected");
  if (word.timing === "interpolated") cls.push("interpolated");
  if (mapping?.state === "removed") cls.push("removed");
  if (mapping?.state === "clipped") cls.push("clipped");
  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    onClick(word, e);
  };
  return (
    <span
      className={cls.join(" ")}
      data-word-id={word.id}
      title={word.timing === "interpolated" ? t("transcript.interpolated") : undefined}
      role="button"
      tabIndex={0}
      onClick={(e) => onClick(word, e)}
      onKeyDown={onKeyDown}
    >
      {word.text}
    </span>
  );
}
