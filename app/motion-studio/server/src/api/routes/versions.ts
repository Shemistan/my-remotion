// Версии: manifest и файлы версии с provenance KB и признаком другого окружения рендера;
// превью и кадры — только по id из БД и списку файлов manifest (путь клиента не принимается);
// сравнение двух версий; экспорт (`scene.export`).
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CreatedJobDtoSchema,
  ExportRequestSchema,
  type KnowledgeRef,
  KnowledgeRefSchema,
  QAReportSchema,
  type VersionDto,
  type VersionManifest,
  VersionDiffSchema,
  VersionDtoSchema,
  VersionManifestSchema,
} from "@ms/contracts";
import { z } from "zod";
import * as scenes from "../../db/repos/scenes.js";
import * as versions from "../../db/repos/versions.js";
import { tx } from "../../db/tx.js";
import { enqueue } from "../../jobs/queue.js";
import { renderEnv } from "../../pipeline/render-env.js";
import { readKnowledgeRefs } from "../../scenes/repo.js";
import { type ApiContext, IdParams, type ZApp, idempotencyKey, replay } from "../context.js";
import { ApiError, notFound } from "../errors.js";
import { memoOnSuccess } from "../memo.js";
import { sendFile } from "../range.js";
import { publicJob } from "../job-dto.js";

const FRAME_RE = /^(0|[1-9]\d{0,6})\.png$/;
const KIT_IMPORT_RE = /import\s+(type\s+)?\{([^}]*)\}\s*from\s*["']@ms\/motion-kit["']/g;

/** Компоненты (имена с заглавной) из `import { A, B as C } from "@ms/motion-kit"`; хуки и токены (`useStyle`, `accent`) и `import type` — нет. */
export function kitImports(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(KIT_IMPORT_RE)) {
    if (m[1]) continue;
    for (const part of m[2]!.split(",")) {
      const name = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]!.trim();
      if (/^[A-Z][\w$]*$/.test(name) && !/^type\s/.test(part.trim())) out.push(name);
    }
  }
  return out;
}

export function versionRoutes(app: ZApp, { core }: ApiContext): void {
  // окружение рендера сервера не меняется без перезапуска (lockfile, motion-kit); отказ не кэшируется
  const currentLock = memoOnSuccess(() => renderEnv().then((e) => e.render_lock_sha256));

  const versionOr404 = (id: string) => {
    const v = versions.get(core.db, id);
    if (!v) throw notFound(`версия ${id}`);
    if (v.broken_reason) throw new ApiError(410, "version_broken", `версия ${id} недоступна: ${v.broken_reason}`);
    return v;
  };
  const manifestOf = async (dir: string): Promise<VersionManifest> => VersionManifestSchema.parse(JSON.parse(await readFile(join(dir, "manifest.json"), "utf8")));
  const json = async (dir: string, m: VersionManifest, name: string): Promise<unknown> =>
    m.files.some((f) => f.path === name) ? JSON.parse(await readFile(join(dir, name), "utf8")) : null;

  /** Полные ссылки KB: из knowledge-refs.json; у старых версий (только manifest) — дополнены из KB. */
  const fullRefs = async (dir: string, m: VersionManifest): Promise<KnowledgeRef[]> =>
    (await readKnowledgeRefs(dir, m)).map((r) => {
      const full = KnowledgeRefSchema.safeParse(r);
      if (full.success) return full.data;
      const view = core.kb.getCapability(r.kb_id);
      return {
        kb_id: r.kb_id,
        repository: view?.repository || "unknown",
        repository_url: view?.repository_url || "unknown",
        commit: r.commit,
        license: r.license,
        license_class: view?.license_class ?? "unknown",
        strategy: r.strategy,
        source_paths: view?.source_paths ?? [],
      };
    });

  /**
   * Примитивы motion-kit из импортов `src/**` версии (файлы — из manifest). Нечитаемый файл не
   * роняет карточку версии: он пропускается и попадает в `unreadable`.
   */
  const kitComponents = async (dir: string, m: VersionManifest, unreadable: string[]): Promise<string[]> => {
    const names = new Set<string>();
    for (const f of m.files) {
      if (!/^src\/.+\.(tsx|ts|jsx|js)$/.test(f.path)) continue;
      const text = await readFile(join(dir, f.path), "utf8").catch(() => null);
      if (text === null) {
        unreadable.push(f.path);
        continue;
      }
      for (const name of kitImports(text)) names.add(name);
    }
    return [...names].sort();
  };

  /** Время и стоимость генерации из `pipeline-log.json` (S5: `stage_wall_ms.total`). */
  const generation = async (dir: string, m: VersionManifest): Promise<VersionDto["generation"]> => {
    const log = (await json(dir, m, "pipeline-log.json").catch(() => null)) as { cost_usd?: unknown; stage_wall_ms?: { total?: unknown } } | null;
    if (!log || typeof log !== "object") return null;
    const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null);
    return { cost_usd: num(log.cost_usd), wall_ms: num(log.stage_wall_ms?.total) };
  };

  app.get("/api/versions/:id", { schema: { params: IdParams, response: { 200: VersionDtoSchema } } }, async (req) => {
    const v = versionOr404(req.params.id);
    const dir = join(core.root, v.path);
    const manifest = await manifestOf(dir);
    const qa = QAReportSchema.safeParse(await json(dir, manifest, "qa.json"));
    const unreadable: string[] = [];
    return {
      manifest,
      spec: await json(dir, manifest, "spec.json"),
      props: await json(dir, manifest, "props.json"),
      settings: manifest.settings,
      qa: qa.success ? qa.data : null,
      knowledge_refs: await fullRefs(dir, manifest),
      render_env_mismatch: manifest.render_env.render_lock_sha256 !== (await currentLock()),
      kit_components: await kitComponents(dir, manifest, unreadable),
      unreadable_files: unreadable,
      generation: await generation(dir, manifest),
    };
  });

  /** Файл версии по имени из manifest (не путь клиента). */
  const sendVersionFile = async (id: string, name: string, contentType: string, req: Parameters<typeof sendFile>[0], reply: Parameters<typeof sendFile>[1]) => {
    const v = versionOr404(id);
    const dir = join(core.root, v.path);
    const manifest = await manifestOf(dir);
    if (!manifest.files.some((f) => f.path === name)) throw notFound(`${name} версии ${id}`);
    return sendFile(req, reply, join(dir, name), { contentType });
  };

  app.get("/api/versions/:id/preview.mp4", { schema: { params: IdParams } }, async (req, reply) => {
    const v = versionOr404(req.params.id);
    const m = await manifestOf(join(core.root, v.path));
    if (!m.preview) throw notFound(`превью версии ${req.params.id}`);
    return sendVersionFile(req.params.id, m.preview.path, "video/mp4", req, reply);
  });

  app.get("/api/versions/:id/frames/:file", {
    schema: { params: z.object({ id: IdParams.shape.id, file: z.string() }).strict() },
  }, async (req, reply) => {
    if (!FRAME_RE.test(req.params.file)) throw notFound(`кадр ${req.params.file}`);
    return sendVersionFile(req.params.id, `frames/${req.params.file}`, "image/png", req, reply);
  });

  app.get("/api/versions/:a/diff/:b", {
    schema: { params: z.object({ a: IdParams.shape.id, b: IdParams.shape.id }).strict(), response: { 200: VersionDiffSchema } },
  }, async (req) => {
    versionOr404(req.params.a);
    versionOr404(req.params.b);
    return core.repo.diff(req.params.a, req.params.b);
  });

  app.post("/api/versions/:id/exports", {
    schema: { params: IdParams, body: ExportRequestSchema, response: { 200: CreatedJobDtoSchema, 202: CreatedJobDtoSchema } },
  }, async (req, reply) => {
    const key = idempotencyKey(req);
    const db = core.db;
    const input = { versionId: req.params.id, request: req.body };
    const out = tx(db, () => {
      const prev = replay(db, key, "scene.export", () => input);
      if (prev) return { status: 200 as const, job: prev };
      const v = versionOr404(req.params.id);
      if (v.status !== "ready") throw new ApiError(409, "export_not_ready", `экспортировать можно только ready-версию (v${v.number} — ${v.status})`);
      const scene = scenes.get(db, v.scene_id)!;
      return { status: 202 as const, job: enqueue(db, { type: "scene.export", projectId: scene.project_id, versionId: v.id, input, idempotencyKey: key }).job };
    });
    return reply.status(out.status).send({ job: publicJob(out.job, core.root) });
  });
}
