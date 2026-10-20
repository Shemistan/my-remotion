// Фейковые адаптеры для юнит-тестов логики пайплайна: хранилище в tmp/, KB в памяти,
// агенты и рендер без процессов. Реальные модели и рендер — только в slice.e2e.test.ts.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type DirectorOutput, type EngineerReport, defaultSettings } from "@ms/contracts";
import { type StorageStatus, type VolumeProbe, initStore, readMarker } from "@ms/core";
import type { RenderRequest, RenderResult } from "@ms/render";
import type { AgentResult, AgentRuntimeAdapter, AgentTask } from "../../src/agents/runtime.js";
import { loadConfig } from "../../src/config.js";
import type { CapabilityView } from "../../src/knowledge/types.js";
import type { GenerateDeps } from "../../src/pipeline/generate.js";
import type { KnowledgeSource } from "../../src/pipeline/refs.js";
import { SKILL_FILES } from "../../src/pipeline/refs.js";
import { checkSceneDir } from "../../src/scenes/static-check.js";

const REPO_TMP = fileURLToPath(new URL("../../../../../tmp/", import.meta.url));

const probe: VolumeProbe = {
  volumeUuid: async () => "VOL-A",
  deviceId: async () => 2,
  systemDeviceId: async () => 1,
  freeBytes: async () => 100 * 1024 ** 3,
};

export async function makeTmp(): Promise<string> {
  await mkdir(REPO_TMP, { recursive: true });
  return mkdtemp(join(REPO_TMP, "ms-pipeline-test-"));
}
export const removeTmp = (dir: string) => rm(dir, { recursive: true, force: true, maxRetries: 2 }).catch(async () => {
  // опубликованные версии read-only: вернуть права и удалить
  const { execFile } = await import("node:child_process");
  await new Promise((r) => execFile("/bin/chmod", ["-R", "u+w", dir], r));
  await rm(dir, { recursive: true, force: true });
});

export async function makeStore(tmp: string): Promise<string> {
  const root = join(tmp, "store");
  await initStore(root, probe, {});
  return root;
}

export async function okStatus(root: string): Promise<StorageStatus> {
  return { ok: true, root, marker: await readMarker(root), freeBytes: 1 };
}
export const OFFLINE: StorageStatus = { ok: false, reason: "not_found", detail: "SSD отключён" };

/** official skills в tmp: те 6 файлов, что копирует prepareRefs. */
export async function makeSkills(tmp: string): Promise<string> {
  const root = join(tmp, "skills");
  await mkdir(join(root, "remotion-markup"), { recursive: true });
  for (const f of SKILL_FILES) await writeFile(join(root, "remotion-markup", f), `# ${f}\n`);
  return root;
}

export function view(over: Partial<CapabilityView> = {}): CapabilityView {
  return {
    id: "fake/line-chart",
    name: "LineChart",
    kind: "template",
    category: "charts",
    visualizes: "Линейный график с дорисовкой линии",
    use_when: "рост показателя",
    inputs: "points",
    adaptations: "кадры вместо CSS",
    patterns: ["growth-decline", "quantities"],
    compat_flags: [],
    repository: "fake-repo",
    repository_url: "https://example.org/fake-repo",
    commit: "abc1234",
    license: "MIT",
    license_class: "permissive",
    source_paths: ["templates/fake/LineChart.tsx"],
    documentation_paths: [],
    compatibility_status: "adaptable",
    tested_status: "untested",
    confidence: "medium",
    card_path: "components/fake/line-chart.md",
    ...over,
  };
}

/** KB в памяти: search отдаёт все записи; copyRefs пишет файл и CARD.md. */
export function fakeKb(views: CapabilityView[] = [view()]): KnowledgeSource & { searches: unknown[] } {
  const searches: unknown[] = [];
  return {
    searches,
    search(query, filters, limit) {
      searches.push({ query, filters, limit });
      return views.filter((v) => !filters?.kinds || filters.kinds.includes(v.kind)).slice(0, limit).map((v) => ({ view: v, score: 1, matched: [] }));
    },
    getCapability: (id) => views.find((v) => v.id === id),
    getVisualPatterns: async (slug) => `# ${slug}\nкурируемый текст`,
    async copyRefs(ids, destDir) {
      const out = [];
      for (const id of ids) {
        const dir = join(destDir, ...id.split("/"));
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, "CARD.md"), `# ${id}\n`);
        out.push({ id, copied: ["CARD.md"], missing: [] });
      }
      return out;
    },
  };
}

export const GOOD_SCENE = `import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
export const Scene = () => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity: o, background: "#000" }} />;
};
`;
export const BAD_SCENE = `import { AbsoluteFill } from "remotion";
export const Scene = () => <AbsoluteFill style={{ opacity: Math.random() }} />;
`;

export function directorOutput(): DirectorOutput {
  return {
    spec: {
      title: "Рост пользователей",
      purpose: "показать рост",
      duration_frames: 180,
      fps: { num: 30, den: 1 },
      style_preset: "dark-premium",
      elements: [
        { id: "title", kind: "text", role: "заголовок", entrance: "rise", content: { text: "Рост" } },
        { id: "chart", kind: "chart", role: "график", entrance: "draw", content: {} },
      ],
      beats: [
        { id: "b1", start_frame: 0, end_frame: 40, action: "title-entrance", description: "", element_ids: ["title"] },
        { id: "b2", start_frame: 30, end_frame: 150, action: "chart-growth", description: "", element_ids: ["chart"] },
        { id: "b3", start_frame: 150, end_frame: 180, action: "emphasis", description: "", element_ids: ["chart"] },
      ],
    },
    selection: { items: [{ kb_id: "fake/line-chart", strategy: "adapt", why: "график", files_to_copy: [] }] },
    rationale: "тест",
  };
}

export interface EngineerCall {
  input: string;
  workdir: string;
}

type EngineerFn = (task: AgentTask<unknown>, n: number) => Promise<Partial<AgentResult<EngineerReport>> & { files?: Record<string, string> }>;

/** Агенты-фейки: Director возвращает directorOutput(), Engineer пишет файлы по `engineer`. */
export function fakeAgents(opts: {
  costUsd?: number;
  director?: () => Promise<Partial<AgentResult<DirectorOutput>>>;
  engineer?: EngineerFn;
}): AgentRuntimeAdapter & { engineerCalls: EngineerCall[]; tasks: AgentTask<unknown>[] } {
  const engineerCalls: EngineerCall[] = [];
  const tasks: AgentTask<unknown>[] = [];
  const base = (cost: number) => ({
    status: "completed" as const,
    usage: { model: "fake", inputTokens: 1, outputTokens: 1, costUsd: cost },
    permissionDenials: [],
    stdoutPath: "",
    stderrPath: "",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  });
  return {
    engineerCalls,
    tasks,
    capabilities: async () => ({ available: true }),
    async run<I, O>(task: AgentTask<I>): Promise<AgentResult<O>> {
      tasks.push(task as AgentTask<unknown>);
      const cost = opts.costUsd ?? 0.1;
      if (task.role === "motion_director") {
        const over = opts.director ? await opts.director() : {};
        return { ...base(cost), output: directorOutput(), ...over } as AgentResult<O>;
      }
      engineerCalls.push({ input: String(task.input), workdir: task.workdir });
      const fn: EngineerFn = opts.engineer ?? (async () => ({ files: { "src/Scene.tsx": GOOD_SCENE } }));
      const { files = {}, ...over } = await fn(task as AgentTask<unknown>, engineerCalls.length);
      for (const [rel, text] of Object.entries(files)) {
        await mkdir(dirname(join(task.workdir, rel)), { recursive: true });
        await writeFile(join(task.workdir, rel), text);
      }
      if (!("props.json" in files)) await writeFile(join(task.workdir, "props.json"), "{}\n");
      const report: EngineerReport = { files_written: [...Object.keys(files), "props.json"], kit_components_used: [], kb_ids_used: [], notes: "" };
      return { ...base(cost), output: report, ...over } as AgentResult<O>;
    },
  };
}

/** Рендер-фейк: кадры и превью — файлы-заглушки, probe совпадает с настройками (масштаб 0.5). */
export function fakeRender(opts: { fail?: RenderResult["error"]; onCall?: (req: RenderRequest, signal?: AbortSignal) => Promise<RenderResult | void> } = {}) {
  const calls: RenderRequest[] = [];
  const render = async (req: RenderRequest, signal?: AbortSignal): Promise<RenderResult> => {
    calls.push(req);
    const custom = await opts.onCall?.(req, signal);
    if (custom) return custom;
    if (opts.fail) return { ok: false, stills: [], browserLogs: [], error: opts.fail };
    await mkdir(join(req.versionDir, "frames"), { recursive: true });
    const stills = [];
    for (const f of req.stills) {
      const p = join(req.versionDir, "frames", `${f}.png`);
      await writeFile(p, `png ${f}`);
      stills.push(p);
    }
    const previewPath = join(req.versionDir, "preview.mp4");
    await writeFile(previewPath, "mp4");
    const s = req.settings;
    return {
      ok: true,
      stills,
      previewPath,
      browserLogs: [],
      probe: {
        durationMs: (s.duration_frames * 1000 * s.fps.den) / s.fps.num,
        width: Math.round(s.width * req.preview.scale),
        height: Math.round(s.height * req.preview.scale),
        fps: s.fps,
        codec: "h264",
      },
    };
  };
  return { render: render as unknown as GenerateDeps["render"], calls };
}

export async function makeDeps(root: string, skillsRoot: string, over: Partial<GenerateDeps> = {}): Promise<GenerateDeps> {
  const config = loadConfig({ MS_DATA_DIR: root }, {});
  return {
    storage: () => okStatus(root),
    kb: fakeKb(),
    agents: fakeAgents({}),
    render: fakeRender().render,
    check: checkSceneDir,
    typecheck: async () => [],
    config,
    skillsRoot,
    ...over,
  };
}

export const settings = () => defaultSettings();
