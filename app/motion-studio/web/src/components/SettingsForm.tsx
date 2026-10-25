// Параметры сцены (ТЗ §6.4): соотношение и разрешение, FPS, длительность, стиль, палитра,
// шрифт, интенсивность анимации, фон, прозрачный экспорт, безопасная зона. Наверх уходят
// только корректные значения; неверный ввод остаётся в поле с сообщением об ошибке.
import { type Settings, SettingsSchema } from "@ms/contracts";
import { type ReactNode, useId, useState } from "react";
import { type TKey, t } from "../i18n/index.js";
import { formatNumber } from "../lib/player-math.js";

export interface SettingsFormProps {
  value: Settings;
  onChange: (next: Settings) => void;
  disabled?: boolean;
  /** Длительность задана снаружи (сцена видеопроекта — планом): поле только для чтения, текст — подсказка. */
  durationLocked?: string;
}

type Field = "fps" | "duration" | "palette" | "safeX" | "safeY" | "background" | "font";

const ASPECTS = ["16:9", "9:16", "1:1"] as const;
const RESOLUTIONS = [720, 1080, 1440, 2160];
const PRESETS = ["dark-premium", "light-clean", "tech-neon"] as const;
const INTENSITIES = ["calm", "balanced", "energetic"] as const;
const COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
/** Дробные FPS вещания: 23,976 / 29,97 / 59,94. */
const NTSC: Record<string, { num: number; den: number }> = {
  "23.976": { num: 24000, den: 1001 },
  "29.97": { num: 30000, den: 1001 },
  "59.94": { num: 60000, den: 1001 },
};

/** Размер кадра по соотношению и короткой стороне. */
export function sizeFor(aspect: Settings["aspect_ratio"], short: number): { width: number; height: number } {
  if (aspect === "1:1") return { width: short, height: short };
  const long = Math.round((short * 16) / 9);
  return aspect === "16:9" ? { width: long, height: short } : { width: short, height: long };
}

const fpsText = (f: Settings["fps"]) => (f.den === 1 ? String(f.num) : (f.num / f.den).toFixed(f.num % 1000 === 0 ? 3 : 2).replace(/0+$/, ""));
const seconds = (s: Settings) => (s.duration_frames * s.fps.den) / s.fps.num;
const pct = (x: number) => String(Math.round(x * 1000) / 10);

/** Настройки без необязательного поля (пустое значение — «из стиля»). */
function omit(s: Settings, key: "color_palette" | "font"): Settings {
  const out = { ...s };
  delete out[key];
  return out;
}

function parseFps(raw: string): Settings["fps"] | null {
  const v = raw.trim().replace(",", ".");
  if (NTSC[v]) return NTSC[v]!;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 120 ? { num: n, den: 1 } : null;
}

export function SettingsForm({ value, onChange, disabled, durationLocked }: SettingsFormProps) {
  const id = useId();
  const [drafts, setDrafts] = useState<Partial<Record<Field, string>>>({});
  const [errors, setErrors] = useState<Partial<Record<Field, TKey>>>({});

  const emit = (next: Settings) => {
    // межпольная проверка схемы (соотношение ↔ размер) — последней
    if (SettingsSchema.safeParse(next).success) onChange(next);
  };
  const accept = (f: Field, next: Settings | null, raw: string, error: TKey) => {
    if (next) {
      setDrafts((d) => ({ ...d, [f]: undefined }));
      setErrors((e) => ({ ...e, [f]: undefined }));
      emit(next);
    } else {
      setDrafts((d) => ({ ...d, [f]: raw }));
      setErrors((e) => ({ ...e, [f]: error }));
    }
  };
  const shown = (f: Field, fallback: string) => drafts[f] ?? fallback;

  const short = Math.min(value.width, value.height);
  const row = (label: TKey, control: (cid: string) => ReactNode, field?: Field, hint?: string) => {
    const cid = `${id}-${label}`;
    const err = field ? errors[field] : undefined;
    return (
      <div className="form-row">
        <label htmlFor={cid}>{t(label)}</label>
        {control(cid)}
        {hint && !err ? <span className="hint">{hint}</span> : null}
        {err ? <span className="field-error" role="status">{t(err)}</span> : null}
      </div>
    );
  };

  return (
    <fieldset className="settings-form" disabled={disabled}>
      {row("settings.aspect_ratio", (cid) => (
        <select id={cid} value={value.aspect_ratio} onChange={(e) => {
          const aspect = e.target.value as Settings["aspect_ratio"];
          emit({ ...value, aspect_ratio: aspect, ...sizeFor(aspect, short) });
        }}>
          {ASPECTS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      ))}
      {row("settings.resolution", (cid) => (
        <select id={cid} value={String(short)} onChange={(e) => emit({ ...value, ...sizeFor(value.aspect_ratio, Number(e.target.value)) })}>
          {[...new Set([...RESOLUTIONS, short])].sort((a, b) => a - b).map((r) => (
            <option key={r} value={r}>{t("settings.resolutionOption", { size: `${sizeFor(value.aspect_ratio, r).width}×${sizeFor(value.aspect_ratio, r).height}`, short: r })}</option>
          ))}
        </select>
      ))}
      {row("settings.fps", (cid) => (
        <input id={cid} inputMode="decimal" value={shown("fps", fpsText(value.fps))} onChange={(e) => {
          const fps = parseFps(e.target.value);
          const dur = fps ? Math.max(1, Math.round((seconds(value) * fps.num) / fps.den)) : 0;
          accept("fps", fps ? { ...value, fps, duration_frames: dur } : null, e.target.value, "settings.errors.fps");
        }} />
      ), "fps")}
      {row("settings.duration", (cid) => (
        <input id={cid} type="number" min={0.1} step={0.1} readOnly={durationLocked !== undefined} value={shown("duration", String(Math.round(seconds(value) * 100) / 100))} onChange={(e) => {
          const s = Number(e.target.value.replace(",", "."));
          const frames = Math.round((s * value.fps.num) / value.fps.den);
          accept("duration", Number.isFinite(s) && frames >= 1 && s <= 600 ? { ...value, duration_frames: frames } : null, e.target.value, "settings.errors.duration");
        }} />
      ), "duration", durationLocked ?? t("settings.durationFrames", { frames: value.duration_frames }))}
      {row("settings.style_preset", (cid) => (
        <select id={cid} value={value.style_preset} onChange={(e) => emit({ ...value, style_preset: e.target.value as Settings["style_preset"] })}>
          {PRESETS.map((p) => <option key={p} value={p}>{t(`settings.preset.${p}`)}</option>)}
        </select>
      ))}
      {row("settings.color_palette", (cid) => (
        <input id={cid} placeholder={t("settings.palettePlaceholder")} value={shown("palette", (value.color_palette ?? []).join(", "))} onChange={(e) => {
          const raw = e.target.value;
          const colors = raw.split(",").map((c) => c.trim()).filter(Boolean);
          const rest = omit(value, "color_palette");
          if (colors.length === 0) accept("palette", rest, raw, "settings.errors.palette");
          else accept("palette", colors.every((c) => COLOR.test(c)) ? { ...rest, color_palette: colors } : null, raw, "settings.errors.palette");
        }} />
      ), "palette")}
      {row("settings.font", (cid) => (
        <input id={cid} placeholder={t("settings.fontPlaceholder")} value={shown("font", value.font ?? "")} onChange={(e) => {
          const rest = omit(value, "font");
          const f = e.target.value.trim();
          accept("font", f ? { ...rest, font: f } : rest, e.target.value, "settings.errors.font");
        }} />
      ), "font")}
      {row("settings.animation_intensity", (cid) => (
        <select id={cid} value={value.animation_intensity} onChange={(e) => emit({ ...value, animation_intensity: e.target.value as Settings["animation_intensity"] })}>
          {INTENSITIES.map((i) => <option key={i} value={i}>{t(`settings.intensity.${i}`)}</option>)}
        </select>
      ))}
      {row("settings.background", (cid) => (
        <span className="color-field">
          <span className="swatch" style={{ background: COLOR.test(value.background) ? value.background : "transparent" }} />
          <input id={cid} value={shown("background", value.background)} onChange={(e) => {
            const b = e.target.value.trim();
            accept("background", b ? { ...value, background: b } : null, e.target.value, "settings.errors.background");
          }} />
        </span>
      ), "background")}
      {row("settings.transparent_export", (cid) => (
        <input id={cid} type="checkbox" checked={value.transparent_export} onChange={(e) => emit({ ...value, transparent_export: e.target.checked })} />
      ), undefined, t("settings.transparentHint"))}
      {row("settings.safe_area_x", (cid) => (
        <input id={cid} type="number" min={0} max={49} step={0.5} value={shown("safeX", pct(value.safe_area.x))} onChange={(e) => {
          const x = Number(e.target.value) / 100;
          accept("safeX", e.target.value !== "" && x >= 0 && x < 0.5 ? { ...value, safe_area: { ...value.safe_area, x } } : null, e.target.value, "settings.errors.safe_area");
        }} />
      ), "safeX")}
      {row("settings.safe_area_y", (cid) => (
        <input id={cid} type="number" min={0} max={49} step={0.5} value={shown("safeY", pct(value.safe_area.y))} onChange={(e) => {
          const y = Number(e.target.value) / 100;
          accept("safeY", e.target.value !== "" && y >= 0 && y < 0.5 ? { ...value, safe_area: { ...value.safe_area, y } } : null, e.target.value, "settings.errors.safe_area");
        }} />
      ), "safeY", t("settings.safeAreaHint", { x: formatNumber(value.safe_area.x * 100, 1), y: formatNumber(value.safe_area.y * 100, 1) }))}
    </fieldset>
  );
}
