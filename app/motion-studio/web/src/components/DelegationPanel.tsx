// Делегирование в Codex (спека 2026-11-04-codex-delegation-design.md §3): переключатель, ползунок
// доли от минимума до безопасного максимума, роли без проверки качества, таблица ролей со
// статистикой и паузами. Применяется сразу (`PUT /settings` → маршрутизатор), без перезапуска.
import type { AppSettingsDto, DelegationDto } from "@ms/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { api } from "../api/client.js";
import { useDelegation } from "../api/queries.js";
import { Skeleton } from "./ui/Skeleton.js";
import { errorText, t, tk } from "../i18n/index.js";
import { formatNumber } from "../lib/player-math.js";

type Policy = AppSettingsDto["delegation"];
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
  const max = policy.allowUnverified ? data.maxLevelUnverified : data.maxLevel;
  const shown = Math.min(policy.level, max);
  const dirty = JSON.stringify(policy) !== JSON.stringify(data.policy);
  const refresh = () => client.invalidateQueries({ queryKey: ["delegation"] });

  const save = useMutation({
    mutationFn: () => api.putSettings({ delegation: { ...policy, level: Math.round(Math.min(policy.level, max) * 100) / 100 } }),
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
        <label htmlFor={`${id}-on`}>{t("delegation.enabled")}</label>
        <input id={`${id}-on`} type="checkbox" checked={policy.enabled} onChange={(e) => setPolicy({ ...policy, enabled: e.target.checked })} />
      </div>
      <fieldset disabled={!policy.enabled}>
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
      <p className="hint">{t("delegation.guards")}</p>
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
              <td>{tk(`role.${r.role}`, r.role)}</td>
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
  return q.data ? <Panel key={JSON.stringify(q.data.policy)} data={q.data} /> : <Skeleton lines={5} />;
}
