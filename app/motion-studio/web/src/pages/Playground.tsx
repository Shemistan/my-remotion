// Motion Playground (ТЗ §6.2): слева — чат, уточнения, задача, история версий, компоненты,
// параметры; справа — плеер превью (или ошибка рендера с журналом, без подмены превью),
// фон и тема, «Рендер» (изменённые параметры) и «Экспорт», QA; снизу — таймлайн сцены.
import type { Job, Settings, VersionDto } from "@ms/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, newKey, urls } from "../api/client.js";
import { useJob, useScene, useVersion } from "../api/queries.js";
import { Chat } from "../components/Chat.js";
import { ClarifyQuestions } from "../components/ClarifyQuestions.js";
import { ComponentsPanel } from "../components/ComponentsPanel.js";
import { ExportDialog } from "../components/ExportDialog.js";
import { JobStatus, stageText } from "../components/JobStatus.js";
import { Link } from "../components/Link.js";
import { Player, type PlayerHandle } from "../components/Player.js";
import { QAPanel } from "../components/QAPanel.js";
import { SceneTimeline, beatsOf } from "../components/SceneTimeline.js";
import { SettingsForm } from "../components/SettingsForm.js";
import { SpecView } from "../components/SpecView.js";
import { VersionHistory } from "../components/VersionHistory.js";
import { errorText, t, tk } from "../i18n/index.js";
import { formatNumber } from "../lib/player-math.js";
import { navigate } from "../router.js";

const PRESETS = ["dark-premium", "light-clean", "tech-neon"] as const;

/** Изменённые поля настроек (для `settings_patch` кнопки «Рендер»). */
export function settingsPatch(base: Settings, next: Settings): Partial<Settings> {
  const out: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(next)]) as Set<keyof Settings>;
  for (const k of keys) {
    if (JSON.stringify(base[k]) !== JSON.stringify(next[k])) out[k] = next[k];
  }
  return out as Partial<Settings>;
}

function Generation({ dto }: { dto: VersionDto }) {
  const g = dto.generation;
  if (!g || (g.wall_ms === null && g.cost_usd === null)) return null;
  return (
    <span className="muted small" data-testid="generation">
      {[
        g.wall_ms !== null ? t("version.genTime", { minutes: formatNumber(g.wall_ms / 60_000, 1) }) : null,
        g.cost_usd !== null ? t("version.genCost", { usd: formatNumber(g.cost_usd, 2) }) : null,
      ].filter(Boolean).join(" · ")}
    </span>
  );
}

function RenderFailure({ dto }: { dto: VersionDto }) {
  const f = dto.manifest.failure;
  const jobId = dto.manifest.job?.id;
  return (
    <div className="render-failure" role="alert">
      <h2>{t("version.failedTitle", { n: dto.manifest.number })}</h2>
      <p>{f ? t("version.failedAt", { stage: tk(`stage.${f.stage}`, f.stage) }) : t("version.failedUnknown")}</p>
      <p className="hint">{t("version.noPreview")}</p>
      {f ? (
        <>
          <h3>{t("version.logs")}</h3>
          <pre className="log" data-testid="failure-log">{f.message}</pre>
        </>
      ) : null}
      {jobId ? <JobStatus jobId={jobId} /> : null}
    </div>
  );
}

function ExportJob({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const q = useJob(jobId);
  const exportId = (q.data?.job.output_refs as { export_id?: unknown } | null)?.export_id;
  return (
    <div className="export-job">
      <JobStatus jobId={jobId} compact />
      {q.data?.job.status === "completed" && typeof exportId === "string" ? (
        <a className="button primary" href={urls.exportFile(exportId)} download>{t("export.download")}</a>
      ) : null}
      <button type="button" className="link" onClick={onClose}>{t("common.hide")}</button>
    </div>
  );
}

export function Playground({ id, version }: { id: string; version?: string }) {
  const client = useQueryClient();
  const scene = useScene(id);
  const versions = scene.data?.versions ?? [];
  const latest = [...versions].sort((a, b) => b.number - a.number)[0];
  const currentId = scene.data?.scene.current_version_id ?? undefined;
  const openId = version ?? currentId ?? latest?.version_id;
  const dto = useVersion(openId);
  // База правки и «Рендера» (ruling 2026-10-23): по умолчанию текущая версия; открытая
  // нетекущая — только явным выбором. Форма параметров показывает настройки базы: патч
  // считается от той же версии, от которой сервер строит план.
  const notCurrent = openId !== undefined && currentId !== undefined && openId !== currentId;
  const [fromOpen, setFromOpen] = useState(false);
  const baseId = notCurrent && fromOpen ? openId : (currentId ?? openId);
  const baseDto = useVersion(baseId);
  const player = useRef<PlayerHandle>(null);
  const [frame, setFrame] = useState(0);
  // черновик настроек привязан к базе: при смене базы форма сразу показывает её настройки
  // (без эффекта сброса — иначе правка, пришедшая до эффекта, шла от черновика прежней базы)
  const [edit, setEdit] = useState<{ base: string; value: Settings } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportJob, setExportJob] = useState<string | null>(null);
  const [lastJob, setLastJob] = useState<string | null>(null);

  useEffect(() => {
    setFromOpen(false);
    setFrame(0);
  }, [openId]);
  const settings = baseDto.data?.settings;
  const draft = settings ? (edit && edit.base === baseId ? edit.value : settings) : null;
  const setDraft = (value: Settings) => {
    if (baseId) setEdit({ base: baseId, value });
  };

  const patch = useMemo(() => (settings && draft ? settingsPatch(settings, draft) : {}), [settings, draft]);
  const dirty = Object.keys(patch).length > 0;
  const render = useMutation({
    mutationFn: () => api.render(id, patch, baseId!, newKey()),
    onSuccess: (r) => {
      setLastJob(r.job.id);
      void client.invalidateQueries({ queryKey: ["scene", id] });
    },
  });

  if (scene.isError) return <div className="page"><p className="error">{errorText(scene.error)}</p></div>;
  if (!scene.data) return <div className="page"><p className="muted">{t("common.loading")}</p></div>;
  const { scene: s, active_job } = scene.data;
  const questions = active_job?.status === "awaiting_input"
    ? ((active_job.output_refs as { questions?: { question: string; default_if_skipped: string }[] } | null)?.questions ?? [])
    : [];
  const jobToShow = active_job?.id ?? lastJob;
  const open = (vid: string) => navigate({ name: "scene", id, version: vid });
  const seek = (f: number) => player.current?.seek(f);
  const m = dto.data?.manifest;
  const ready = m?.status === "ready" && m.preview;
  const onJob = (j: Job) => setLastJob(j.id);
  const num = (vid: string | undefined) => versions.find((v) => v.version_id === vid)?.number;
  const baseReady = baseDto.data?.manifest.status === "ready";
  // последняя версия новее текущей и не удалась: видно и после перезагрузки страницы
  const currentNumber = num(s.current_version_id ?? undefined) ?? 0;
  const lastFailed = latest && latest.status === "failed" && latest.number > currentNumber && latest.version_id !== openId ? latest : undefined;

  return (
    <div className="page playground">
      <nav className="crumbs">
        <Link to={{ name: "project", id: s.project_id }}>{t("nav.project")}</Link>
        <span className="muted">{s.title}</span>
      </nav>
      <div className="playground-grid">
        <aside className="left">
          {notCurrent ? (
            <section className="panel edit-base">
              <h2 id="edit-base-title">{t("base.title")}</h2>
              <p className="hint">{t("base.hint", { open: num(openId) ?? "?", current: num(currentId) ?? "?" })}</p>
              <div role="radiogroup" aria-labelledby="edit-base-title" className="row wrap">
                <label className="inline">
                  <input type="radio" name="edit-base" checked={!fromOpen} onChange={() => setFromOpen(false)} />
                  <span>{t("base.current", { n: num(currentId) ?? "?" })}</span>
                </label>
                <label className="inline">
                  <input type="radio" name="edit-base" checked={fromOpen} onChange={() => setFromOpen(true)} />
                  <span>{t("base.open", { n: num(openId) ?? "?" })}</span>
                </label>
              </div>
            </section>
          ) : null}
          <Chat
            sceneId={id}
            {...(notCurrent && fromOpen && openId ? { baseVersionId: openId, baseNote: t("base.editFrom", { n: num(openId) ?? "?" }) } : {})}
            versions={versions}
            onOpenVersion={open}
          />
          {active_job && questions.length > 0 ? <ClarifyQuestions jobId={active_job.id} questions={questions} /> : null}
          {jobToShow ? (
            <section className="panel">
              <h2>{t("job.title")}</h2>
              <JobStatus jobId={jobToShow} />
            </section>
          ) : null}
          <VersionHistory
            sceneId={id}
            versions={versions}
            openId={openId}
            currentId={s.current_version_id}
            onOpen={open}
            onCompare={(a, b) => navigate({ name: "compare", sceneId: id, a, b })}
            onJob={onJob}
          />
          {dto.data ? <ComponentsPanel refs={dto.data.knowledge_refs} kitComponents={dto.data.kit_components ?? []} /> : null}
          {draft ? (
            <section className="panel">
              <h2>{t("settings.title")}</h2>
              {baseId !== openId ? <p className="hint" data-testid="settings-base">{t("settings.ofBase", { n: num(baseId) ?? "?" })}</p> : null}
              <SettingsForm value={draft} onChange={setDraft} />
            </section>
          ) : null}
        </aside>
        <main className="right">
          {lastFailed ? (
            <div className="banner-fail" role="alert" aria-label={t("playground.lastFailed", { n: lastFailed.number })}>
              <strong>{t("playground.lastFailed", { n: lastFailed.number })}</strong>
              <span className="muted">{t("playground.lastFailedHint")}</span>
              <button type="button" onClick={() => open(lastFailed.version_id)}>{t("versions.open")}</button>
            </div>
          ) : null}
          {dto.data && dto.data.unreadable_files.length > 0 ? (
            <div className="banner banner-warn" role="status" data-testid="unreadable">{t("version.unreadable", { files: dto.data.unreadable_files.join(", ") })}</div>
          ) : null}
          {dto.data?.render_env_mismatch ? <div className="banner banner-warn" role="status">{t("version.envMismatch")}</div> : null}
          <div className="version-head row wrap">
            {m ? <h1>{t("versions.label", { n: m.number })}</h1> : <h1>{s.title}</h1>}
            {dto.data ? <Generation dto={dto.data} /> : null}
            {m?.prompt ? <p className="muted prompt-line" title={m.prompt}>{m.prompt}</p> : null}
          </div>
          {!openId ? (
            <div className="empty-player">
              <p>{active_job ? t("playground.generating", { stage: stageText(active_job.stage) }) : t("playground.noVersions")}</p>
            </div>
          ) : dto.isError ? (
            <p className="error">{errorText(dto.error)}</p>
          ) : !dto.data ? (
            <p className="muted">{t("common.loading")}</p>
          ) : ready ? (
            <Player
              ref={player}
              key={openId}
              src={urls.preview(openId)}
              fps={dto.data.settings.fps}
              durationFrames={dto.data.settings.duration_frames}
              width={dto.data.settings.width}
              height={dto.data.settings.height}
              aspectRatio={dto.data.settings.aspect_ratio}
              onFrame={setFrame}
            />
          ) : (
            <RenderFailure dto={dto.data} />
          )}
          {draft && settings ? (
            <div className="toolbar row wrap">
              <label className="inline">
                <span>{t("settings.background")}</span>
                <span className="swatch" style={{ background: draft.background }} />
                <input className="short" value={draft.background} aria-label={t("settings.background")} onChange={(e) => e.target.value.trim() && setDraft({ ...draft, background: e.target.value.trim() })} />
              </label>
              <label className="inline">
                <span>{t("playground.theme")}</span>
                <select value={draft.style_preset} onChange={(e) => setDraft({ ...draft, style_preset: e.target.value as Settings["style_preset"] })}>
                  {PRESETS.map((p) => <option key={p} value={p}>{t(`settings.preset.${p}`)}</option>)}
                </select>
              </label>
              <span className="spacer" />
              {dirty ? <button type="button" onClick={() => setDraft(settings)}>{t("playground.resetSettings")}</button> : null}
              <button type="button" className="primary" disabled={!dirty || render.isPending || !baseId || !baseReady} title={dirty ? t("playground.renderHint", { n: num(baseId) ?? "?" }) : t("playground.renderNoChanges")} onClick={() => render.mutate()}>
                {t("playground.render")}
              </button>
              <button type="button" disabled={!ready} onClick={() => setExportOpen(true)}>{t("playground.export")}</button>
            </div>
          ) : null}
          {render.isError ? <p className="error">{errorText(render.error)}</p> : null}
          {dirty ? <p className="hint">{t("playground.dirty", { fields: Object.keys(patch).map((k) => tk(`settings.${k}`, k)).join(", "), n: num(baseId) ?? "?" })}</p> : null}
          {baseDto.data && !baseReady ? <p className="hint">{t("base.notReady", { n: baseDto.data.manifest.number })}</p> : null}
          {exportJob ? <ExportJob jobId={exportJob} onClose={() => setExportJob(null)} /> : null}
          {dto.data && openId ? (
            <QAPanel versionId={openId} gate={dto.data.manifest.qa ?? null} report={dto.data.qa} qaFrames={dto.data.manifest.qa_frames} onSeek={seek} />
          ) : null}
          {dto.data ? <SpecView dto={dto.data} /> : null}
        </main>
      </div>
      {dto.data ? (
        <SceneTimeline
          durationFrames={dto.data.settings.duration_frames}
          frame={frame}
          beats={beatsOf(dto.data.spec).length > 0 ? beatsOf(dto.data.spec) : beatsOf((dto.data.props as { timing?: unknown } | null)?.timing)}
          qaFrames={dto.data.manifest.qa_frames}
          versions={versions}
          openId={openId}
          onSeek={seek}
          onOpen={open}
        />
      ) : null}
      {exportOpen && dto.data && openId ? (
        <ExportDialog
          versionId={openId}
          settings={dto.data.settings}
          onClose={() => setExportOpen(false)}
          onCreated={(j) => { setExportOpen(false); setExportJob(j.id); }}
        />
      ) : null}
    </div>
  );
}
