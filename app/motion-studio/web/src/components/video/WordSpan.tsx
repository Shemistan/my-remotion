// Слово транскрипта: текущее (по времени плеера) подсвечено, интерполированное — пунктир с
// подсказкой «время оценено», вырезанное — зачёркнуто, задетое вырезкой — частично.
import type { TranscriptWord, WordMapping } from "@ms/contracts";
import type { MouseEvent } from "react";
import { t } from "../../i18n/index.js";

export interface WordSpanProps {
  word: TranscriptWord;
  mapping?: WordMapping;
  current: boolean;
  selected: boolean;
  onClick: (word: TranscriptWord, e: MouseEvent<HTMLSpanElement>) => void;
}

export function WordSpan({ word, mapping, current, selected, onClick }: WordSpanProps) {
  const cls = ["word"];
  if (current) cls.push("current");
  if (selected) cls.push("selected");
  if (word.timing === "interpolated") cls.push("interpolated");
  if (mapping?.state === "removed") cls.push("removed");
  if (mapping?.state === "clipped") cls.push("clipped");
  return (
    <span
      className={cls.join(" ")}
      data-word-id={word.id}
      title={word.timing === "interpolated" ? t("transcript.interpolated") : undefined}
      onClick={(e) => onClick(word, e)}
    >
      {word.text}
    </span>
  );
}
