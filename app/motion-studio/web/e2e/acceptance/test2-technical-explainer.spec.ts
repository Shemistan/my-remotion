// Test 2 — Technical Explainer (`09` §3) через UI: в проекте «Приёмка» промпт Test 2 дословно →
// completed; проверки [A]: ≥ 5 узлов с ролями, порядок потоков (запрос → оркестратор →
// инструменты → обратно), импульсы (PulseAlongPath / animated-beam) и их движение между
// соседними кадрами в области ребра, KB из паттерна system-structure, нет перекрытий.
// Evidence — docs/evidence/phase-1/test2/.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { KnowledgeRef, MotionSpec, QAReport, Settings } from "@ms/contracts";
import { KnowledgeAdapter } from "../../../server/src/knowledge/adapter.js";
import { type Img, frameDelta, loadPng } from "../../../server/src/qa/image.js";
import type { LayoutFrame, LayoutItem } from "../../../server/src/qa/layout.js";
import { specChecks } from "../../../server/src/qa/spec-checks.js";
import {
  Checks, EVIDENCE, REPO, TEST2, collect, generateViaUi, jobCost, plays, renderFrames, saveState, shot, state, version, versionDir, writeEvidence,
} from "./helpers.js";

const readJson = <T>(p: string) => JSON.parse(readFileSync(p, "utf8")) as T;

interface Node { id: string; label?: string }
interface Edge { id: string; from: string; to: string }
interface Flow { edge: string; direction?: "forward" | "back"; beat?: string; travel?: number }
interface Graph { nodes?: Node[]; edges?: Edge[]; flows?: Flow[] }

const USER = /польз|user|client|клиент/i;
const ORCH = /оркестр|orchestr|агент|agent|llm|planner|планир/i;

/** Роли узлов: пользователь, оркестратор, остальные — инструменты. */
export function roles(nodes: Node[]): { user?: Node; orch?: Node; tools: Node[] } {
  const text = (n: Node) => `${n.id} ${n.label ?? ""}`;
  const user = nodes.find((n) => USER.test(text(n)));
  const orch = nodes.find((n) => n !== user && ORCH.test(text(n)));
  return { user, orch, tools: nodes.filter((n) => n !== user && n !== orch) };
}

/** Кадр начала бита по id (spec.beats, затем props.timing.beats). */
function beatStart(spec: MotionSpec, timing: { beats?: { id: string; start_frame: number; end_frame: number }[] } | undefined, id?: string) {
  if (!id) return undefined;
  return spec.beats.find((b) => b.id === id) ?? timing?.beats?.find((b) => b.id === id);
}

/** Потоки как «откуда → куда, начало»: back на ребре a→b — это b→a. */
function directed(g: Graph, spec: MotionSpec, timing: Parameters<typeof beatStart>[1]) {
  return (g.flows ?? []).map((f, i) => {
    const e = g.edges?.find((x) => x.id === f.edge);
    const b = beatStart(spec, timing, f.beat);
    const [from, to] = f.direction === "back" ? [e?.to, e?.from] : [e?.from, e?.to];
    return { from, to, start: b?.start_frame ?? i, end: b?.end_frame, travel: f.travel, beat: f.beat, resolved: !!b };
  });
}

/** Средняя разница в прямоугольнике (кадры одного размера). */
function roiDelta(a: Img, b: Img, r: { x: number; y: number; w: number; h: number }): number {
  const x0 = Math.max(0, Math.floor(r.x));
  const y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(a.width, Math.ceil(r.x + r.w));
  const y1 = Math.min(a.height, Math.ceil(r.y + r.h));
  let sum = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * a.width + x) * 4;
      sum += Math.abs(a.data[i]! - b.data[i]!) + Math.abs(a.data[i + 1]! - b.data[i + 1]!) + Math.abs(a.data[i + 2]! - b.data[i + 2]!);
      n++;
    }
  }
  return n === 0 ? 0 : sum / (n * 3 * 255);
}

const labelItem = (f: LayoutFrame | undefined, n: Node | undefined): LayoutItem | undefined =>
  n?.label ? f?.items.find((i) => i.text.trim() === n.label!.trim() || i.text.includes(n.label!)) : undefined;

export default function test2(): void {
  test("Test 2 — Technical Explainer: генерация через UI, проверки 09 §3", async ({ page }) => {
    test.setTimeout(75 * 60_000);
    const c = new Checks("test2");
    const { projectId } = state();
    expect(projectId, "проект «Приёмка» создаёт Test 1").toBeTruthy();
    await page.goto(`/projects/${projectId}`);
    await expect(page.getByRole("heading", { name: "Приёмка", level: 1 })).toBeVisible();

    const g = await generateViaUi(page, TEST2);
    saveState({ test2: g });
    c.check("job", "задача playground.generate completed, версия есть", g.status === "completed" && g.versionId !== null, g);
    expect(g.versionId, `генерация Test 2: ${JSON.stringify(g)}`).not.toBeNull();
    const vid = g.versionId!;

    await page.goto(`/scenes/${g.sceneId}`);
    await expect(page.getByRole("heading", { name: "v1", level: 1 })).toBeVisible();
    const t = await plays(page);
    c.check("ui.player", "плеер играет", t > 0.5, `currentTime ${t.toFixed(2)} с`);
    await shot(page, "test2", "01-playground");

    const dir = versionDir(vid);
    const spec = readJson<MotionSpec>(join(dir, "spec.json"));
    const props = readJson<{ timing?: { beats?: { id: string; start_frame: number; end_frame: number }[] }; content?: Graph }>(join(dir, "props.json"));
    const settings = readJson<Settings>(join(dir, "settings.json"));
    const qa = readJson<QAReport>(join(dir, "qa.json"));
    const refs = readJson<KnowledgeRef[]>(join(dir, "knowledge-refs.json"));
    const dto = await version(page.request, vid);
    const graph: Graph = props.content ?? {};
    const nodes: Node[] = graph.nodes ?? spec.elements.filter((e) => e.kind === "card" || e.role.startsWith("node")).map((e) => ({ id: e.id, label: e.role }));
    const r = roles(nodes);
    c.check("t2.nodes", "≥ 5 узлов: пользователь, оркестратор, ≥ 3 инструмента", nodes.length >= 5 && !!r.user && !!r.orch && r.tools.length >= 3,
      { nodes: nodes.map((n) => `${n.id}:${n.label ?? ""}`), user: r.user?.id, orch: r.orch?.id, tools: r.tools.map((n) => n.id) }, "A+H");

    // порядок потоков: запрос → оркестратор → инструменты → обратно
    const flows = directed(graph, spec, props.timing);
    const isUser = (id?: string) => id === r.user?.id;
    const isOrch = (id?: string) => id === r.orch?.id;
    const isTool = (id?: string) => r.tools.some((n) => n.id === id);
    const req = flows.filter((f) => isUser(f.from) && isOrch(f.to));
    const fan = flows.filter((f) => isOrch(f.from) && isTool(f.to));
    const ret = flows.filter((f) => isTool(f.from) && isOrch(f.to));
    const ans = flows.filter((f) => isOrch(f.from) && isUser(f.to));
    const minS = (xs: typeof flows) => Math.min(...xs.map((f) => f.start));
    const maxS = (xs: typeof flows) => Math.max(...xs.map((f) => f.start));
    const ordered = req.length > 0 && fan.length >= 3 && ret.length > 0 && ans.length > 0 &&
      minS(req) < minS(fan) && fan.every((f) => ret.filter((x) => x.from === f.to).every((x) => x.start > f.start)) && minS(ans) > maxS(ret);
    c.check("t2.order", "потоки упорядочены: запрос → оркестратор → 3 инструмента → обратно → ответ", ordered,
      { flows: flows.map((f) => `${f.from}→${f.to}@${f.start}${f.resolved ? "" : "(порядок)"}`) }, "A+H");

    // импульсы: PulseAlongPath (FlowGraph рисует потоки через него) или magicui/animated-beam
    const pulseKit = dto.kit_components.includes("PulseAlongPath") || (dto.kit_components.includes("FlowGraph") && (graph.flows?.length ?? 0) > 0);
    const beam = refs.some((x) => x.kb_id === "magicui/animated-beam");
    c.check("t2.pulse-source", "PulseAlongPath в компонентах или magicui/animated-beam в knowledge-refs", pulseKit || beam, { kit: dto.kit_components, refs: refs.map((x) => x.kb_id) });

    // движение импульса: два соседних кадра середины потока запроса, разница в области ребра
    const f0 = req[0] ?? flows[0];
    const mid = f0?.end !== undefined ? Math.floor((f0.start + Math.min(f0.end, f0.start + (f0.travel ?? 16))) / 2) : Math.floor(spec.duration_frames * 0.3);
    const dur = spec.duration_frames;
    const pr = await renderFrames(vid, [mid, mid + 1, dur - 1], "t2-pulse");
    const [a, b] = [await loadPng(join(pr.out, "frames", `${mid}.png`)), await loadPng(join(pr.out, "frames", `${mid + 1}.png`))];
    const lay = pr.layout.find((f) => f.frame === mid);
    const la = labelItem(lay, nodes.find((n) => n.id === f0?.from));
    const lb = labelItem(lay, nodes.find((n) => n.id === f0?.to));
    const pad = 60;
    const roi = la && lb
      ? (() => {
          const cx = [la.rect.x + la.rect.w / 2, lb.rect.x + lb.rect.w / 2];
          const cy = [la.rect.y + la.rect.h / 2, lb.rect.y + lb.rect.h / 2];
          return { x: Math.min(...cx) - pad, y: Math.min(...cy) - pad, w: Math.abs(cx[0]! - cx[1]!) + 2 * pad, h: Math.abs(cy[0]! - cy[1]!) + 2 * pad };
        })()
      : { x: 0, y: 0, w: a.width, h: a.height };
    const d = roiDelta(a, b, roi);
    c.check("t2.pulse-moves", "импульс движется: frameDelta соседних кадров в области ребра > 0,002", d > 0.002,
      { frames: [mid, mid + 1], flow: f0 ? `${f0.from}→${f0.to}` : null, roi: la && lb ? roi : "весь кадр (подписи узлов не найдены)", delta: Number(d.toFixed(5)), whole: Number(frameDelta(a, b).toFixed(5)) });

    // подписи узлов видны на кадре hold
    const hold = pr.layout.find((f) => f.frame === dur - 1);
    const shown = nodes.filter((n) => { const it = labelItem(hold, n); return it && it.opacity > 0.5; }).map((n) => n.id);
    c.check("t2.labels", "подписи всех узлов видны на последнем кадре", shown.length === nodes.length, { shown, all: nodes.map((n) => n.id) }, "A+H");

    // KB: запись паттерна system-structure с commit и лицензией
    const kb = await KnowledgeAdapter.load({ kbRoot: join(REPO, "knowledge"), sourceRoot: REPO.split("/.claude/worktrees/")[0]! });
    const sys = refs.filter((x) => kb.getCapability(x.kb_id)?.patterns.includes("system-structure"));
    c.check("t2.kb", "knowledge-refs: ≥ 1 запись паттерна system-structure с commit и лицензией", sys.some((x) => x.commit && x.license), sys.map((x) => `${x.kb_id}@${x.commit} ${x.license}`));

    const overlap = specChecks(spec, settings).filter((i) => i.code === "overlap");
    const qaOverlap = qa.issues.filter((i) => /overlap/.test(i.code) && i.severity === "blocking");
    c.check("t2.overlap", "нет перекрытий: spec-раскладка без overlap, QA без blocking overlap", overlap.length === 0 && qaOverlap.length === 0, { overlap, qaOverlap }, "A+H");
    writeEvidence("test2", "flows.json", { roles: r, flows, pulse: { frames: [mid, mid + 1], roi, delta: d } });

    collect(vid, join(EVIDENCE, "test2/v1"));
    writeEvidence("test2", "summary.json", { ...g, cost_usd: jobCost(g.jobId) });
  });
}
