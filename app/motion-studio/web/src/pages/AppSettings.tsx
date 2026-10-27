// Настройки приложения: модели ролей, лимиты, параметры сцены по умолчанию. Сервер принимает
// только эти поля (`PUT /settings`, F2); бюджеты, таймауты ролей и бюджет сцены показаны
// только для чтения. Новые значения действуют после перезапуска сервера.
import type { AppSettingsDto, Settings } from "@ms/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { api } from "../api/client.js";
import { useAppSettings } from "../api/queries.js";
import { SettingsForm } from "../components/SettingsForm.js";
import { DisabledReason } from "../components/ui/DisabledReason.js";
import { Skeleton } from "../components/ui/Skeleton.js";
import { errorText, t, tk } from "../i18n/index.js";
import { formatNumber } from "../lib/player-math.js";
import { useUnsavedGuard } from "../ui/unsaved.js";

type Limits = AppSettingsDto["limits"];
const LIMIT_KEYS = ["maxRunning", "agentCalls", "renders"] as const;

function Form({ data }: { data: AppSettingsDto }) {
  const id = useId();
  const client = useQueryClient();
  const [models, setModels] = useState<Record<string, string>>(Object.fromEntries(Object.entries(data.agents).map(([r, a]) => [r, a.model])));
  const [limits, setLimits] = useState<Limits>(data.limits);
  const [defaults, setDefaults] = useState<Settings>(data.defaults);
  const dirty = JSON.stringify({ models, limits, defaults }) !== JSON.stringify({
    models: Object.fromEntries(Object.entries(data.agents).map(([r, a]) => [r, a.model])),
    limits: data.limits,
    defaults: data.defaults,
  });
  useUnsavedGuard(dirty);
  const save = useMutation({
    mutationFn: () => api.putSettings({
      agents: Object.fromEntries(Object.entries(models).map(([r, m]) => [r, { model: m.trim() }])),
      limits,
      defaults,
    }),
    onSuccess: (r) => client.setQueryData(["settings"], r),
  });
  const valid = Object.values(models).every((m) => m.trim()) && LIMIT_KEYS.every((k) => Number.isInteger(limits[k]) && limits[k] >= 1 && limits[k] <= 16)
    && limits.exportTimeoutMs >= 10_000 && limits.exportTimeoutMs <= 4 * 3_600_000;

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (valid) save.mutate(); }}>
      <div className="grid-2">
        <section className="panel">
          <h2>{t("appSettings.models")}</h2>
          <table className="kv">
            <thead><tr><th>{t("appSettings.role")}</th><th>{t("appSettings.model")}</th><th>{t("appSettings.timeout")}</th><th>{t("appSettings.budget")}</th></tr></thead>
            <tbody>
              {Object.entries(data.agents).map(([role, a]) => (
                <tr key={role}>
                  <td><label htmlFor={`${id}-${role}`}>{tk(`role.${role}`, role)}</label></td>
                  <td><input id={`${id}-${role}`} value={models[role] ?? ""} onChange={(e) => setModels({ ...models, [role]: e.target.value })} /></td>
                  <td className="muted">{t("appSettings.minutes", { n: formatNumber(a.timeoutMs / 60_000, 0) })}</td>
                  <td className="muted">{`$${formatNumber(a.maxBudgetUsd, 2)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint">{t("appSettings.readOnlyHint")}</p>
          <h2>{t("appSettings.limits")}</h2>
          {LIMIT_KEYS.map((k) => (
            <div key={k} className="form-row">
              <label htmlFor={`${id}-${k}`}>{t(`appSettings.limit.${k}`)}</label>
              <input id={`${id}-${k}`} type="number" min={1} max={16} value={limits[k]} onChange={(e) => setLimits({ ...limits, [k]: Number(e.target.value) })} />
            </div>
          ))}
          <div className="form-row">
            <label htmlFor={`${id}-export`}>{t("appSettings.limit.exportTimeout")}</label>
            <input id={`${id}-export`} type="number" min={1} max={240} value={Math.round(limits.exportTimeoutMs / 60_000)} onChange={(e) => setLimits({ ...limits, exportTimeoutMs: Number(e.target.value) * 60_000 })} />
          </div>
          <h2>{t("appSettings.scene")}</h2>
          <p className="muted">{t("appSettings.sceneBudget", { usd: formatNumber(data.scene.maxCostUsd, 2), fixes: data.scene.maxAutoFixes })}</p>
        </section>
        <section className="panel">
          <h2>{t("appSettings.defaults")}</h2>
          <SettingsForm value={defaults} onChange={setDefaults} />
        </section>
      </div>
      <div className="row end sticky-actions">
        {save.isError ? <span className="error">{errorText(save.error)}</span> : null}
        {save.isSuccess ? <span className="ok">{t("appSettings.saved")}</span> : null}
        {!valid ? <span className="error">{t("appSettings.invalid")}</span> : null}
        <DisabledReason reasonKey={!dirty ? "ux.disabled.noChanges" : !valid ? "ux.disabled.invalidForm" : save.isPending ? "ux.disabled.requestRunning" : null}>
          <button type="submit" className="primary" disabled={!dirty || !valid || save.isPending}>{t("common.save")}</button>
        </DisabledReason>
      </div>
    </form>
  );
}

export function AppSettings() {
  const q = useAppSettings();
  return (
    <div className="page app-settings">
      <h1>{t("appSettings.title")}</h1>
      <p className="hint">{t("appSettings.restartHint")}</p>
      {q.isError ? <p className="error">{errorText(q.error)}</p> : null}
      {q.data ? <Form data={q.data} /> : <Skeleton lines={7} />}
    </div>
  );
}
