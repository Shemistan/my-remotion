// Калибровочный набор судьи: оценки дизайнера из motion-review-1 (сцены коммита 955657f)
// и motion-review-2 (коммит d35c69f). Превью и spec лежат в git:
// `docs/evidence/phase-1/pipeline/<scene>/` на этих коммитах.
// `anchor` — короткая выжимка ревью: якорь шкалы в промпте судьи. Leave-one-scene-out:
// судья сцены X не видит ни одного якоря сцены X (ни R1, ни R2).
//
// Разбиение train/holdout — по сценам (обе версии сцены в одной части); holdout — пара
// R1→R2 gen-cache и отложенные held-mobile, held-queue. Правила рубрики
// пишутся только по ошибкам на train; holdout — проверка, его промахи рубрику не правят.
// Рубрика v1–v4 писалась до разбиения и видела все 12 оценок, поэтому согласие на holdout
// пока тоже оптимистично (HOLDOUT_SEEN_BY_RUBRIC). Новые оценки дизайнера (ревью 3 и
// дальше) идут в holdout по умолчанию — это и будет чистая проверка.

import type { Split } from "./metrics.js";

export interface ReferenceGrade {
  /** `r1-test1` — id в таблицах. */
  id: string;
  /** Имя сцены (совпадает с id запроса набора eval). */
  scene: string;
  review: "R1" | "R2";
  commit: string;
  grade: number;
  split: Split;
  anchor: string;
}

export const R1_COMMIT = "955657f";
export const R2_COMMIT = "d35c69f";

/** Рубрика (до v4 включительно) настраивалась, видя и оценки holdout. */
export const HOLDOUT_SEEN_BY_RUBRIC = true;

export const REFERENCE: readonly ReferenceGrade[] = [
  {
    id: "r1-test1", scene: "test1", review: "R1", commit: R1_COMMIT, grade: 6, split: "train",
    anchor: "Growth chart 10K→1M. Counter bound to the line head (good sync). Defects: glyph debris and half-sliced headline mask at frames 6–20; empty black frames 0–6; hero number small (~60 px at 540p), right-aligned, lost the ×100 statement; dead band under the title; hold greys out 70 % of the frame; emphasis pill blinks on/off.",
  },
  {
    id: "r1-test2", scene: "test2", review: "R1", commit: R1_COMMIT, grade: 4.5, split: "train",
    anchor: "AI-agent architecture. Clean build order and colour-coded pulses, but generic labels «Инструмент 1/2/3», no request text, the answer is never shown as content; orchestrator not visibly larger (no hierarchy); bottom 30 % empty; three tool calls fire in the same frame (mechanical); hold reads as paused. Competent wiring with no content.",
  },
  {
    id: "r1-gen-compare", scene: "gen-compare", review: "R1", commit: R1_COMMIT, grade: 5, split: "train",
    anchor: "Monolith vs microservices. Good non-template idea (one heavy pulse vs three light lanes) and a live hold (micro lanes keep flowing). Defects: counter not bound to arrivals; climax order inverted (loser ticks after the hero strike); loser is the brightest object; right 38 % empty; 1–3 px lanes and caption-size labels illegible; blinking pill; title does not state the comparison.",
  },
  {
    id: "r1-gen-timeline", scene: "gen-timeline", review: "R1", commit: R1_COMMIT, grade: 6.5, split: "train",
    anchor: "Timeline 2015–2025, five milestones. Most finished scene: axis head draws, nodes born on arrival, alternating labels without collisions, motivated slow camera push, clear 2025 hero; on-meaning live hold (ripple + halo). Defects: title mask debris at 24; frames 0–10 only a typing cursor; payoff label late (~1.5 s); awkward auto wraps; empty bottom 15 % and top-right; filler content.",
  },
  {
    id: "r1-gen-cache", scene: "gen-cache", review: "R1", commit: R1_COMMIT, grade: 5, split: "holdout",
    anchor: "Caching (request/miss/write/hit). All four phases in order with direction-coded pulses, cache is the hero, source dims after the hit. But the reason for caching (speed) is missing — miss and hit look identical, no latency numbers; no data object written; state chips accumulate as a legend; chips float unanchored; hit rushed; display-size pill detached; empty quadrants.",
  },
  {
    id: "r2-test1", scene: "test1", review: "R2", commit: R2_COMMIT, grade: 6.5, split: "train",
    anchor: "Growth chart 10 000→1 000 000. Counter bound to the line head, «×100 за три года» on screen near the endpoint, accent lives in the data (endpoint halo), typewriter kicker instead of a title strip, exponential easing, slow push in the hold. Defects: frame 0 black with one letter; hero arrives blurred; chart takes left 62 % with an empty lower-right quadrant; final number modest (~45 px cap at 540p); kicker drifts out of safe area; 7–8 px axis labels; hold barely alive.",
  },
  {
    id: "r2-test2", scene: "test2", review: "R2", commit: R2_COMMIT, grade: 6, split: "train",
    anchor: "AI-agent architecture with real specifics: typed request, named tools, data returns as content, answer docks in the user card, status swaps in place, statement takeaway. Defects: ghost-text trails on moving tokens (2–3 translucent copies); tokens collide with node labels; raw data tokens remain stacked after ГОТОВО; frame 0 grid only; calls fire sequentially; frozen hold.",
  },
  {
    id: "r2-gen-compare", scene: "gen-compare", review: "R2", commit: R2_COMMIT, grade: 5.5, split: "train",
    anchor: "Monolith vs microservices with stage lanes and a month axis; climax order fixed; counter steps with arrivals. Defects: group total «12 релизов» sits on one lane (misleading); monolith token hangs off its lane with ghost copies; hold is dead (micro lanes stop); right 38 % empty; meaningless light band; 1 px lanes and ~6 px suffixes illegible; ring around ×12 blinks; label title.",
  },
  {
    id: "r2-gen-timeline", scene: "gen-timeline", review: "R2", commit: R2_COMMIT, grade: 6, split: "train",
    anchor: "Timeline 2015–2025 with concrete milestones forming an arc and a good conclusion sentence; head draws the axis, nodes born on arrival; 2025 hero; no title strip. Defects: frames 0–16 read as loading; top-heavy for 4 s (bottom 45 % empty); hero card breaks the label system and arrives late; 7–8 px notes; word-rise baseline wobble; weak hold (166 ≈ 179).",
  },
  {
    id: "r2-gen-cache", scene: "gen-cache", review: "R2", commit: R2_COMMIT, grade: 6, split: "holdout",
    anchor: "Caching with the why on screen: live ms counter 120 ms vs 2 ms, «В 60 раз быстрее»; key/value are real objects written into the cache; status swaps in one anchor with colour as meaning; DB dims after write; live hold (system keeps operating). Defects: ghost-text trails and overprinted tokens; tokens cover node labels; status chip vanishes at 160; unlabeled looping pulse in the hold; empty frame 0; same card kit as other schemes.",
  },
  {
    id: "r2-held-mobile", scene: "held-mobile", review: "R2", commit: R2_COMMIT, grade: 5, split: "holdout",
    anchor: "Mobile share 35 % → 68 %. Counter bound to the line, integrated title with a professional subline «×1,9 · +33 п. п.». But it is a clone of the user-growth chart (same aurora, line, counter placement, push); four intermediate data points fabricated; wrong primitive for a share (a line instead of part-of-whole); empty band; hero far from its endpoint; black frame 0; mask-sliced title; marginal hold.",
  },
  {
    id: "r2-held-queue", scene: "held-queue", review: "R2", commit: R2_COMMIT, grade: 6, split: "holdout",
    anchor: "Message queue orders → warehouse with real semantics: named topic, concrete messages, producer gets «ПРИНЯТО ✓» immediately, FIFO consumption with in-place status, queue drains, right takeaway sentence. Defects: ghost-text trails on every moving message; chips leave the edge path; the queue is a generic card, not a buffer; key point (producer does not wait) under-played; small takeaway with wobble; same grid and card kit; frozen hold.",
  },
];

/** Якоря шкалы для сцены `scene`: все, кроме её собственных (leave-one-scene-out). */
export function anchorsFor(scene: string, ref: readonly ReferenceGrade[] = REFERENCE): ReferenceGrade[] {
  return ref.filter((r) => r.scene !== scene);
}
