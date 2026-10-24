// StyleBible проекта (Task 33, V6): пресет, палитра (свотчи, контраст текста к фону), шрифт
// заголовков с образцом кириллицы, интенсивность, глубина, обоснование Art Director. Правка —
// черновик в форме; «Сохранить» — новая ревизия (PUT с `base_revision`). Если B утверждён —
// предупреждение, что он станет устаревшим. 400 `style_contrast` — нечитаемые пары цветов.
import { IntensitySchema, type ProjectStyleBase, type ProjectStyleDto, StylePresetSchema } from "@ms/contracts";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { ApiError, api } from "../../api/client.js";
import { errorText, t } from "../../i18n/index.js";
import { contrast } from "../../video/contrast.js";

const EDITABLE = ["bg", "surface", "text", "muted", "positive", "negative"] as const;
type ColorKey = (typeof EDITABLE)[number];
const CHECKED: Record<"text" | "muted", { min: number; good: number }> = { text: { min: 4.5, good: 7 }, muted: { min: 3, good: 4.5 } };

export interface StyleBiblePanelProps {
  projectId: string;
  style: ProjectStyleDto;
  /** Approval B сейчас валиден — сохранение сделает его устаревшим. */
  bValid: boolean;
  onSaved: (dto: ProjectStyleDto) => void;
}

const fmt = (x: number) => x.toFixed(2).replace(".", ",");

export function StyleBiblePanel({ projectId, style, bValid, onSaved }: StyleBiblePanelProps) {
  const ids = { preset: useId(), intensity: useId(), depth: useId(), font: useId() };
  const cur = style.current;
  const [draft, setDraft] = useState<ProjectStyleBase>(cur.base);
  const baseKey = JSON.stringify(cur.base);
  useEffect(() => setDraft(JSON.parse(baseKey) as ProjectStyleBase), [cur.style_id, cur.revision, baseKey]);
  const dirty = JSON.stringify(draft) !== baseKey;
  const presetChanged = draft.preset !== cur.base.preset;
  // палитра: разрешённая сервером + несохранённые правки (для нового пресета — после сохранения)
  const palette: Record<ColorKey, string> = { ...cur.resolved.palette, ...(presetChanged ? {} : draft.palette_overrides) } as Record<ColorKey, string>;
  const font = draft.font ?? (presetChanged ? undefined : cur.resolved.typography.display.family);
  const limits = Object.fromEntries(style.contrast.map((c) => [c.key, { min: c.min, good: c.good }])) as Partial<typeof CHECKED>;

  const save = useMutation({
    mutationFn: () => api.saveProjectStyle(projectId, draft, cur.revision),
    onSuccess: (dto) => onSaved(dto),
  });
  const setColor = (k: ColorKey, v: string) => setDraft({ ...draft, palette_overrides: { ...draft.palette_overrides, [k]: v } });
  const pairs = save.error instanceof ApiError && save.error.code === "style_contrast"
    ? ((save.error.body as { pairs?: { key: "text" | "muted"; color: string; bg: string; ratio: number }[] } | null)?.pairs ?? [])
    : [];

  const swatch = (k: ColorKey) => {
    const c = palette[k];
    const check = k === "text" || k === "muted" ? { ...CHECKED[k], ...limits[k] } : undefined;
    const r = check ? contrast(c, palette.bg) : undefined;
    const status = r === undefined || !check ? undefined : r < check.min ? "bad" : r < check.good ? "low" : "ok";
    return (
      <li key={k} className={`palette-swatch ${status ? `contrast-${status}` : ""}`} data-testid={`swatch-${k}`}>
        <label className="swatch-color" style={{ background: c }}>
          <input type="color" aria-label={t(`style.color.${k}`)} value={/^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : "#000000"} disabled={presetChanged} onChange={(e) => setColor(k, e.target.value)} />
        </label>
        <span className="swatch-text">
          <span>{t(`style.color.${k}`)}</span>
          <span className="mono small">{c}</span>
          {check && r !== undefined ? (
            <span className="small">
              {t("style.contrast", { key: t(`style.color.${k}`), ratio: fmt(r), min: fmt(check.min) })}{" "}
              <span className={`badge contrast-${status}`}>{t(status === "bad" ? "style.contrastBad" : status === "low" ? "style.contrastLow" : "style.contrastOk")}</span>
            </span>
          ) : null}
        </span>
      </li>
    );
  };

  return (
    <section className="panel style-bible" data-testid="style-bible" aria-label={t("style.title")}>
      <h2 className="row wrap">
        <span>{t("style.title")}</span>
        <span className="badge">{t("style.revision", { n: cur.revision, who: t(`style.author.${cur.author}`) })}</span>
      </h2>
      <div className="style-grid">
        <label htmlFor={ids.preset}>{t("style.preset")}</label>
        <select id={ids.preset} value={draft.preset} onChange={(e) => setDraft({ preset: e.target.value as ProjectStyleBase["preset"], intensity: draft.intensity, depth: draft.depth })}>
          {StylePresetSchema.options.map((p) => <option key={p} value={p}>{t(`settings.preset.${p}`)}</option>)}
        </select>
        <label htmlFor={ids.intensity}>{t("style.intensity")}</label>
        <select id={ids.intensity} value={draft.intensity} onChange={(e) => setDraft({ ...draft, intensity: e.target.value as ProjectStyleBase["intensity"] })}>
          {IntensitySchema.options.map((i) => <option key={i} value={i}>{t(`settings.intensity.${i}`)}</option>)}
        </select>
        <label htmlFor={ids.depth}>{t("style.depth")}</label>
        <select id={ids.depth} value={draft.depth} onChange={(e) => setDraft({ ...draft, depth: Number(e.target.value) })}>
          {[0, 1, 2, 3].map((d) => <option key={d} value={d}>{t("style.depthValue", { n: d })}</option>)}
        </select>
        <label htmlFor={ids.font}>{t("style.font")}</label>
        <select id={ids.font} value={draft.font ?? ""} onChange={(e) => {
          const next: ProjectStyleBase = { ...draft };
          if (e.target.value) next.font = e.target.value;
          else delete next.font;
          setDraft(next);
        }}>
          <option value="">{t("style.fontDefault")}</option>
          {style.fonts.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>
      <p className="font-sample" data-testid="font-sample" style={{ fontFamily: font ? `"${font}", system-ui, sans-serif` : undefined, color: palette.text, background: palette.bg }}>
        {t("style.sample")}
      </p>
      <h3>{t("style.palette")}</h3>
      <ul className="swatches">
        {EDITABLE.map(swatch)}
        {(presetChanged ? [] : cur.resolved.palette.accent).map((a, i) => (
          <li key={`accent-${i}`} className="palette-swatch" data-testid={`swatch-accent-${i}`}>
            <span className="swatch-color" style={{ background: a }} />
            <span className="swatch-text"><span>{t("style.color.accent", { n: i + 1 })}</span><span className="mono small">{a}</span></span>
          </li>
        ))}
      </ul>
      {presetChanged ? <p className="hint">{t("style.presetChanged")}</p> : null}
      <h3>{t("style.rationale")}</h3>
      <p className={cur.rationale ? "" : "muted"}>{cur.rationale || t("style.noRationale")}</p>
      <p className="muted small">{t("style.history", { list: style.history.map((h) => `r${h.revision} (${t(`style.author.${h.author === "user" ? "user" : "agent"}`)})`).join(", ") })}</p>
      {dirty && bValid ? <p className="msg-warning" role="note">{t("style.staleWarning")}</p> : null}
      {save.isError ? (
        <p className="error" data-testid="style-error">
          {pairs.length > 0
            ? t("style.pairs", { list: pairs.map((p) => `${t(`style.color.${p.key}`)} ${p.color} / ${p.bg} — ${fmt(p.ratio)}`).join("; ") })
            : errorText(save.error)}
        </p>
      ) : null}
      <div className="row wrap actions">
        <button type="button" className="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{t("style.save")}</button>
        <button type="button" disabled={!dirty || save.isPending} onClick={() => setDraft(cur.base)}>{t("style.reset")}</button>
      </div>
    </section>
  );
}
