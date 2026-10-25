// S4 «сценарий → моушн»: можно ли утвердить план (`planApprovable`, потребляет S5).
import { expect, it } from "vitest";
import { applyScriptPlanOps } from "../../src/script/plan-ops.js";
import { planApprovable } from "../../src/script/plan-state.js";
import { PLAN as d1, SCRIPT as script } from "./plan-ops-fixtures.js";

it("план по текущему тексту без blocking и с принятыми сценами — можно", () => {
  expect(planApprovable(d1, script)).toEqual({ ok: true });
});

it("blocking — нельзя, проблемы в ответе", () => {
  // приём с идеей — без дозаполнения (S16a F3), остаётся только повтор приёма
  const d5 = applyScriptPlanOps(d1, [{ op: "modify", item_id: "ss_002", patch: { technique: d1.items[0]!.technique, idea: "и2" } }], script);
  const r = planApprovable(d5, script);
  expect(r).toMatchObject({ ok: false, code: "blocking_issues" });
  expect(r.ok ? [] : r.issues?.map((i) => i.code)).toEqual(["adjacent_technique_repeat"]);
});

it("текст новее плана — plan_outdated (важнее прочего)", () => {
  expect(planApprovable(d1, { ...script, revision: script.revision + 1 })).toMatchObject({ ok: false, code: "plan_outdated" });
  expect(planApprovable(d1, { ...script, script_id: "scr_other" })).toMatchObject({ ok: false, code: "plan_outdated" });
});

it("все сцены сняты — no_items", () => {
  const off = applyScriptPlanOps(d1, d1.items.map((x) => ({ op: "set_status", item_id: x.id, status: "rejected" }) as const), script);
  expect(planApprovable(off, script)).toEqual({ ok: false, code: "no_items" });
});
