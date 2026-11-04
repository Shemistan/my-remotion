import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, DelegationState, PAUSE_MIN_N, SETTLE_MS, hash32, normalizeWeights, pauseReason, pickCodex, planShares } from "../../src/agents/delegation.js";
import { ROLES } from "../../src/agents/runtime.js";
import { makeTmp, removeTmp } from "./helpers.js";

const W = normalizeWeights(DEFAULT_WEIGHTS);
const on = (level: number, allowUnverified = false) => ({ enabled: true, level, allowUnverified });

it("weights: normalized to 1; empty history falls back to the built-in shares", () => {
  const sum = (w: Record<string, number>) => Object.values(w).reduce((a, b) => a + b, 0);
  expect(sum(W)).toBeCloseTo(1, 9);
  expect(normalizeWeights({})).toEqual(W);
  const h = normalizeWeights({ engineer: 3, concept: 1 });
  expect(h.engineer).toBeCloseTo(0.75);
  expect(h.motion_director).toBe(0);
});

it("plan: disabled or 0 → nothing goes to Codex", () => {
  expect(Object.values(planShares(W, { enabled: false, level: 50, allowUnverified: false }).shares).every((s) => s === 0)).toBe(true);
  expect(planShares(W, on(0)).level).toBe(0);
});

it("plan: fills structural roles first, then engineer partially; QA and director stay on Claude", () => {
  const p = planShares(W, on(30));
  expect(p.shares.fragment_fit).toBe(1);
  expect(p.shares.concept).toBe(1);
  expect(p.shares.engineer).toBeGreaterThan(0.4);
  expect(p.shares.engineer).toBeLessThan(0.5);
  expect(p.shares.motion_director).toBe(0);
  expect(p.shares.visual_qa).toBe(0);
  expect(p.level).toBeCloseTo(30, 0);
});

it("plan: min and safe max; unverified roles only with allowUnverified; never visual_qa", () => {
  const p = planShares(W, on(100));
  expect(p.maxLevel).toBeGreaterThan(60);
  expect(p.maxLevel).toBeLessThan(65);
  expect(p.level).toBe(p.maxLevel);
  expect(p.minLevel).toBeGreaterThan(0);
  expect(p.minLevel).toBeLessThan(1);
  const u = planShares(W, on(100, true));
  expect(u.maxLevel).toBeGreaterThan(89);
  expect(u.shares.motion_director).toBe(1);
  expect(u.shares.visual_qa).toBe(0);
});

it("plan: paused role is skipped and its share moves to the next role", () => {
  const p = planShares(W, on(63), new Set(["engineer"]));
  expect(p.shares.engineer).toBe(0);
  expect(p.maxLevel).toBeLessThan(2);
});

it("pick: deterministic per key, close to the share over many keys", () => {
  expect(hash32("a")).toBe(hash32("a"));
  expect(pickCodex("k", 0)).toBe(false);
  expect(pickCodex("k", 1)).toBe(true);
  let n = 0;
  for (let i = 0; i < 10_000; i++) if (pickCodex(`run${i}|engineer|1`, 0.3)) n++;
  expect(n / 10_000).toBeGreaterThan(0.27);
  expect(n / 10_000).toBeLessThan(0.33);
});

it("pause: needs PAUSE_MIN_N codex outcomes and a gap above 15 pp", () => {
  const s = (cn: number, cc: number, ln: number, lc: number) => ({ codex: { n: cn, clean: cc }, claude: { n: ln, clean: lc } });
  expect(pauseReason(s(PAUSE_MIN_N - 1, 0, 20, 20))).toBeUndefined();
  expect(pauseReason(s(10, 8, 20, 18))).toBeUndefined();
  expect(pauseReason(s(10, 6, 20, 18))).toMatch(/Codex: 60 %/);
  // нет базы Claude — порог 85 %
  expect(pauseReason(s(10, 6, 0, 0))).toBeDefined();
});

let tmp: string;
beforeEach(async () => {
  tmp = await makeTmp();
});
afterEach(() => removeTmp(tmp));

it("state: engineer outcome settles after a fix or SETTLE_MS; fixes pause the role; resume clears; persisted", async () => {
  let now = 1_000_000;
  const path = join(tmp, "delegation-state.json");
  const st = new DelegationState(path, () => now);
  for (let i = 0; i < 10; i++) st.record("engineer", { runtime: "codex", run: `r${i}-a1`, clean: true });
  expect(st.stats("engineer").codex.n).toBe(0);
  for (let i = 0; i < 6; i++) st.markFixed("engineer", `r${i}-a1`);
  expect(st.stats("engineer").codex).toEqual({ n: 6, clean: 0 });
  now += SETTLE_MS;
  expect(st.stats("engineer").codex).toEqual({ n: 10, clean: 4 });
  // пауза ставится при изменении (markFixed/record), без базы Claude
  st.record("engineer", { runtime: "codex", run: "r10-a1", clean: false });
  expect(st.pausedRoles().has("engineer")).toBe(true);
  await st.flush();
  const again = new DelegationState(path, () => now);
  await again.load();
  expect(again.pausedRoles().has("engineer")).toBe(true);
  again.resume("engineer");
  expect(again.pausedRoles().size).toBe(0);
  expect(again.stats("engineer").codex.n).toBe(0);
  await again.flush();
  expect(JSON.parse(await readFile(path, "utf8")).paused).toEqual({});
  expect(ROLES.length).toBeGreaterThan(0);
});
