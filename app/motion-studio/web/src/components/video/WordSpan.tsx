// Слово транскрипта: текущее (по времени плеера) подсвечено, интерполированное — пунктир с
// подсказкой «время оценено», вырезанное — зачёркнуто, задетое вырезкой — частично. С клавиатуры —
// кнопка: Enter/Space как клик, остальные клавиши (стрелки, Home/End) — `onNav` транскрипта
// (roving tabindex: в порядке Tab одно слово, ревью Task 29 M6/N4).
import type { TranscriptWord, WordMapping } from "@ms/contracts";
import type { KeyboardEvent } from "react";
import { t } from "../../i18n/index.js";

export interface WordSpanProps {
  word: TranscriptWord;
  mapping?: WordMapping;
  current: boolean;
  selected: boolean;
  /** Слово — остановка Tab транскрипта. */
  tabStop: boolean;
  onClick: (word: TranscriptWord, e: { shiftKey: boolean }) => void;
  onNav: (word: TranscriptWord, key: string) => boolean;
  onFocus: (word: TranscriptWord) => void;
}

export function WordSpan({ word, mapping, current, selected, tabStop, onClick, onNav, onFocus }: WordSpanProps) {
  const cls = ["word"];
  if (current) cls.push("current");
  if (selected) cls.push("selected");
  if (word.timing === "interpolated") cls.push("interpolated");
  if (mapping?.state === "removed") cls.push("removed");
  if (mapping?.state === "clipped") cls.push("clipped");
  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick(word, e);
    } else if (onNav(word, e.key)) {
      e.preventDefault();
    }
  };
  return (
    <span
      className={cls.join(" ")}
      data-word-id={word.id}
      title={word.timing === "interpolated" ? t("transcript.interpolated") : undefined}
      role="button"
      tabIndex={tabStop ? 0 : -1}
      onClick={(e) => onClick(word, e)}
      onKeyDown={onKeyDown}
      onFocus={() => onFocus(word)}
    >
      {word.text.trim()}
    </span>
  );
}
