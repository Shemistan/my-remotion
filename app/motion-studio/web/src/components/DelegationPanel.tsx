// Runtime агентов: Claude / hybrid / Codex only. В hybrid — ползунок доли,
// предохранители и автопаузы; Codex only явно работает без fallback в Claude.
// Всё применяется сразу (`PUT /settings` → маршрутизатор), без перезапуска.
import type { AppSettingsDto, DelegationDto } from "@ms/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { api } from "../api/client.js";
import { useDelegation } from "../api/queries.js";
import { Skeleton } from "./ui/Skeleton.js";
import { errorText, t, tk } from "../i18n/index.js";
import { formatNumber } from "../lib/player-math.js";

type Policy = AppSettingsDto["delegation"];
type Mode = DelegationDto["mode"];
type RoleRow = DelegationDto["roles"][number];

const pct = (x: number, digits = 1) => formatNumber(x, digits);
const clean = (s: { n: number; clean: number }) => (s.n === 0 ? t("delegation.noStats") : `${Math.round((s.clean / s.n) * 100)} % (${s.n})`);

function statusText(r: RoleRow): string {
  if (r.status === "paused") return t("delegation.status.paused", { why: r.pause?.reason ?? "" });
  return t(`delegation.status.${r.status}`);
}

function Panel({ data }: { data: DelegationDto }) {
  const id = useId();
  const client = useQueryClient();
  const [policy, setPolicy] = useState<Policy>(data.policy);
  const [mode, setMode] = useState<Mode>(data.mode);
  const nextPolicy = { ...policy, enabled: mode === "hybrid" };
  const max = policy.allowUnverified ? data.maxLevelUnverified : data.maxLevel;
  const shown = Math.min(policy.level, max);
  const dirty = mode !== data.mode || JSON.stringify(nextPolicy) !== JSON.stringify(data.policy);
  const refresh = () => client.invalidateQueries({ queryKey: ["delegation"] });

  const save = useMutation({
    mutationFn: () => api.putSettings({
      agentRuntime: mode,
      delegation: { ...nextPolicy, level: Math.round(Math.min(nextPolicy.level, max) * 100) / 100 },
    }),
    onSuccess: (r) => {
      client.setQueryData(["settings"], r);
      void refresh();
    },
  });
  const resume = useMutation({
    mutationFn: (role: string) => api.resumeDelegation(role),
    onSuccess: (d) => client.setQueryData(["delegation"], d),
  });

  return (
    <section className="panel delegation">
      <h2>{t("delegation.title")}</h2>
      <p className="hint">{t("delegation.hint")}</p>
      <p className={data.codex.status === "ok" ? "muted" : "error"}>
        {data.codex.status === "ok" ? t("delegation.codexOk", { v: data.codex.detail ?? "" }) : t("delegation.codexMissing", { why: data.codex.detail ?? "" })}
      </p>
      <div className="form-row">
        <label htmlFor={`${id}-mode`}>{t("delegation.mode")}</label>
        <select id={`${id}-mode`} value={mode} onChange={(e) => {
          const next = e.target.value as Mode;
          setMode(next);
          if (next === "hybrid" && policy.level <= 0) setPolicy({ ...policy, level: data.minLevel });
        }}>
          <option value="claude-code">{t("delegation.mode.claude")}</option>
          <option value="hybrid">{t("delegation.mode.hybrid")}</option>
          <option value="codex-only" disabled={data.codex.status !== "ok"}>{t("delegation.mode.codex")}</option>
        </select>
      </div>
      <p className="hint">{t(`delegation.modeHint.${mode}`)}</p>
      <fieldset disabled={mode !== "hybrid"}>
        <div className="form-row">
          <label htmlFor={`${id}-level`}>{t("delegation.level")}</label>
          <input id={`${id}-level`} type="range" min={0} max={max} step={0.1} value={shown} onChange={(e) => setPolicy({ ...policy, level: Number(e.target.value) })} />
          <span className="hint">{t("delegation.levelValue", { n: pct(shown) })}</span>
        </div>
        <div className="row">
          <button type="button" onClick={() => setPolicy({ ...policy, level: data.minLevel })}>{t("delegation.min", { n: pct(data.minLevel, 2) })}</button>
          <button type="button" onClick={() => setPolicy({ ...policy, level: max })}>{t("delegation.max", { n: pct(max) })}</button>
        </div>
        <div className="form-row">
          <label htmlFor={`${id}-unv`}>{t("delegation.allowUnverified", { n: pct(data.maxLevelUnverified - data.maxLevel) })}</label>
          <input id={`${id}-unv`} type="checkbox" checked={policy.allowUnverified} onChange={(e) => setPolicy({ ...policy, allowUnverified: e.target.checked })} />
        </div>
      </fieldset>
      {mode === "hybrid" ? <p className="hint">{t("delegation.guards")}</p> : null}
      <div className="row end">
        {save.isError ? <span className="error">{errorText(save.error)}</span> : null}
        {save.isSuccess && !dirty ? <span className="ok">{t("delegation.saved")}</span> : null}
        <button type="button" className="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{t("delegation.save")}</button>
      </div>
      <table className="kv">
        <thead>
          <tr>
            <th>{t("delegation.col.role")}</th>
            <th>{t("delegation.col.weight")}</th>
            <th>{t("delegation.col.share")}</th>
            <th>{t("delegation.col.clean")}</th>
            <th>{t("delegation.col.status")}</th>
          </tr>
        </thead>
        <tbody>
          {data.roles.map((r) => (
            <tr key={r.role}>
              <td>{tk(`diagnostics.role.${r.role}`, r.role)}</td>
              <td className="muted">{`${pct(r.weight * 100)} %`}</td>
              <td>{`${pct(r.share * 100, 0)} %`}</td>
              <td className="muted">{t("delegation.cleanValue", { codex: clean(r.stats.codex), claude: clean(r.stats.claude) })}</td>
              <td>
                {statusText(r)}
                {r.status === "paused" ? (
                  <button type="button" disabled={resume.isPending} onClick={() => resume.mutate(r.role)}>{t("delegation.resume")}</button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {resume.isError ? <p className="error">{errorText(resume.error)}</p> : null}
    </section>
  );
}

export function DelegationPanel() {
  const q = useDelegation();
  if (q.isError) return <p className="error">{errorText(q.error)}</p>;
  // ключ: после «Применить» форма берёт новую политику сервера
  return q.data ? <Panel key={JSON.stringify([q.data.mode, q.data.policy])} data={q.data} /> : <Skeleton lines={5} />;
}
