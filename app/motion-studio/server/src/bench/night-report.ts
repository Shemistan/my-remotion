// Утренний отчёт ночи `tmp/night/<дата>/REPORT.md` (по-русски): окно и бюджет, базовая линия,
// итерации с цифрами до/после по обоим наборам и по критериям рубрики, коммиты, блоки прав,
// ролики, что делать утром. Пересобирается после каждого шага ночи.
import { existsSync, readFileSync } from "node:fs";
import { CRITERIA } from "./metrics.js";
import type { BenchScores } from "./night-accept.js";
import type { NightState } from "./night.js";

const sg = (x: number, d = 2) => `${x >= 0 ? "+" : ""}${x.toFixed(d)}`;
const f2 = (x: number | null | undefined) => (x === null || x === undefined ? "—" : x.toFixed(2));
const min = (ms: number | null | undefined) => (ms === null || ms === undefined ? "—" : (ms / 60_000).toFixed(1));
/** Время ISO → местное «ГГГГ-ММ-ДД ЧЧ:ММ» (человек читает отчёт в своём поясе, L5). */
const loc = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16).replace("T", " ");
};

function meanOf(path: string): string {
  if (!existsSync(path)) return "—";
  const s = JSON.parse(readFileSync(path, "utf8")) as BenchScores;
  const xs = s.rows.filter((r) => r.judge).map((r) => r.judge!.overall);
  return xs.length ? `${(xs.reduce((a, x) => a + x, 0) / xs.length).toFixed(2)} (${xs.length} сцен)` : "—";
}

export function nightReport(st: NightState, o: { examplesDir: string }): string {
  const agentUsd = st.iterations.reduce((a, i) => a + (i.agent?.cost_usd ?? 0), 0);
  const benchUsd = Object.values(st.bench_cost).reduce((a, b) => a + b, 0);
  const L: string[] = [
    `# Ночь ${st.date}${st.smoke ? " (smoke: 2 + 2 сцены)" : ""}`,
    "",
    `Источник: \`${st.source.branch}\` @ \`${st.source.commit.slice(0, 7)}\`. Принятое: \`${st.branch}\` @ \`${st.accepted_commit.slice(0, 7)}\`. Worktree: \`${st.worktree}\`.`,
    `Окно до ${loc(st.until)} (местное), бюджет $${st.budget_usd}, потрачено **$${st.spent_usd.toFixed(2)}** (агенты $${agentUsd.toFixed(2)}, bench $${benchUsd.toFixed(2)}).`,
    st.stop ? `Ночь остановлена ${loc(st.stop.at)}: **${st.stop.reason}**.` : "Ночь идёт.",
    "",
    "## Базовая линия",
    "",
  ];
  const b = st.baseline;
  if (!b) L.push("Не снята.");
  else {
    L.push(
      `${b.done ? "" : "(снимается) "}Источник: ${b.source}, коммит \`${b.commit.slice(0, 7)}\`; прогоны \`${b.runs.explainer}\`, \`${b.runs.user}\`.`,
      `Среднее судьи: explainer ${meanOf(b.scores.explainer)}, user ${meanOf(b.scores.user)}.`,
      ...(b.single_run ? ["Внимание: базовая линия — один прогон принятой итерации (подтверждающий не уместился в бюджет или окно), её среднее может быть завышено удачей."] : []),
    );
  }
  L.push("", "## Итерации", "");
  if (!st.iterations.length) L.push("Не было.");
  else {
    const h = ["#", "Пункт", "Ветка", "Итог", "explainer", "user", "failed", "p90 $", "медиана explainer, мин", "агент $ / мин", "bench, мин"];
    L.push(`| ${h.join(" | ")} |`, `|${h.map(() => "---").join("|")}|`);
    for (const it of st.iterations) {
      const m = it.verdict?.metrics;
      L.push(`| ${it.n} | ${it.item.id} — ${it.item.title} | \`${it.branch}\` | ${it.outcome ?? `идёт (${it.phase})`} | ${m?.explainer ? `${f2(m.explainer.before)} → ${f2(m.explainer.after)} (${sg(m.explainer.delta)})` : "—"} | ${m?.user ? `${f2(m.user.before)} → ${f2(m.user.after)} (${sg(m.user.delta)})` : "—"} | ${m ? `${m.failed.before} → ${m.failed.after}` : "—"} | ${f2(m?.p90_cost_usd)} | ${m ? `${min(m.median_gen_ms.before)} → ${min(m.median_gen_ms.after)}` : "—"} | ${it.agent ? `${it.agent.cost_usd.toFixed(2)} / ${min(it.agent.wall_ms)}` : "—"} | ${min(it.bench?.wall_ms)} |`);
    }
    for (const it of st.iterations) {
      L.push("", `### Итерация ${it.n}: ${it.item.id} — ${it.item.title}`, "");
      L.push(`- итог: **${it.outcome ?? `идёт (${it.phase})`}**${it.item.acceptance === "без регрессии" ? " (пункт «без регрессии»: рост не требовался)" : ""}${it.note ? `; ${it.note}` : ""}`);
      if (it.failure) L.push(`- род сбоя: \`${it.failure.kind}\`${it.failure.infra ? " — сбой окружения, пункт остался «открыт»" : ""}`);
      if (it.forbidden?.length) L.push(`- запрещённые пути (итерация отклонена до ./check и bench): ${it.forbidden.map((f) => `\`${f}\``).join(", ")}`);
      if (it.verdict?.reasons.length) L.push(`- причины: ${it.verdict.reasons.join("; ")}`);
      const m = it.verdict?.metrics;
      if (m?.explainer) {
        L.push(`- парный тест по сценам: explainer ${sg(m.explainer.delta)} (SE ${f2(m.explainer.se)}, нижняя граница ${f2(m.explainer.lower)})${m.user ? `; user ${sg(m.user.delta)} (SE ${f2(m.user.se)}, верхняя граница ${f2(m.user.upper)})` : ""}${it.verdict?.borderline ? "; у порога" : ""}`);
        L.push(`- критерии explainer (средняя дельта по сценам): ${CRITERIA.map((c) => `${c} ${sg(m.explainer_criteria[c] ?? 0)}`).join(", ")}`);
      }
      const fm = it.first_verdict?.metrics;
      if (it.confirm) L.push(`- подтверждающий прогон: \`tmp/bench/${it.confirm.runs.explainer}\`, \`tmp/bench/${it.confirm.runs.user}\`; решение — по среднему двух прогонов${fm?.explainer ? ` (первый прогон: explainer ${sg(fm.explainer.delta)}${fm.user ? `, user ${sg(fm.user.delta)}` : ""})` : ""}${it.confirm.error ? `; ошибка: ${it.confirm.error}` : ""}`);
      L.push(`- ветка \`${it.branch}\` от \`${it.start_commit.slice(0, 7)}\`${it.head_commit ? `, голова \`${it.head_commit.slice(0, 7)}\`` : ""}; коммиты агента: ${it.commits?.length ? "" : "нет"}`);
      for (const c of it.commits ?? []) L.push(`  - ${c}`);
      if (it.bench) L.push(`- bench: \`tmp/bench/${it.bench.runs.explainer}\`, \`tmp/bench/${it.bench.runs.user}\` (в worktree ночи)${it.bench.error ? `; ошибка: ${it.bench.error}` : ""}`);
      if (it.agent) {
        const a = it.agent;
        L.push(`- агент: ${a.status}, $${a.cost_usd.toFixed(2)}, ${min(a.wall_ms)} мин${a.turns ? `, ходов ${a.turns}` : ""}${a.session_id ? `, сессия \`${a.session_id}\`` : ""}${it.limits ? ` (лимит ${min(it.limits.agent_ms)} мин, $${it.limits.agent_usd})` : ""}`);
        L.push(`- блоки прав (guard/песочница/режим dontAsk): ${a.denials.length ? "" : "нет"}`);
        for (const d of a.denials.slice(0, 20)) L.push(`  - ${d}`);
        if (a.summary) L.push("- отчёт агента:", "", ...a.summary.slice(0, 2500).split("\n").map((l) => `  > ${l}`));
      }
      // состояние ночей до перехода на патч (smoke 2026-10-23): там sha записи stash
      if (typeof it.leftover === "string") L.push(`- незакоммиченные правки агента — в stash: \`${it.leftover as string}\` (смотреть \`git stash show -p <sha>\`, не pop)`);
      else if (it.leftover) L.push(`- незакоммиченные правки агента: ${it.leftover.patch ? `\`${it.leftover.dir}/wip.patch\` (применить: \`git apply --index <патч>\`)` : "патча нет"}${it.leftover.untracked.length ? `; неотслеживаемые файлы (${it.leftover.untracked.length}) — копии в \`${it.leftover.dir}/wip-untracked/\`` : ""}`);
      if (it.cleanup?.length) L.push(`- после агента погашено: ${it.cleanup.join("; ")}`);
      if (it.push_error) L.push(`- push в origin не удался: ${it.push_error.slice(0, 300)}`);
      if (it.videos) L.push(`- ролики: \`${it.videos}\``);
      L.push(`- журналы: \`tmp/night/${st.date}/${it.n}/\` (бриф, ответ агента, ./check, bench)`);
    }
  }
  const accepted = st.iterations.filter((i) => i.outcome === "принято");
  L.push(
    "",
    "## Утром",
    "",
    accepted.length
      ? `- Принято итераций: ${accepted.length} (${accepted.map((i) => i.item.id).join(", ")}). Ролики — \`${o.examplesDir}/night-${st.date}-<n>/\`.`
      : "- Принятых итераций нет.",
    `- Разбор: \`git log --oneline ${st.source.commit.slice(0, 7)}..${st.branch}\`; не принятые — ветки \`${st.branch}-<n>\` (не удалены).`,
    `- Влить после ревью: в ветке задачи \`${st.source.branch}\` — \`git merge --ff-only ${st.branch}\` (если ветка задачи ушла вперёд — обычный merge).`,
    `- Продолжить эту ночь: \`./night --resume --date ${st.date}\`.`,
    "",
  );
  return L.join("\n");
}
