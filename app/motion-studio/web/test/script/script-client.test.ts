// S1 «сценарий → моушн»: клиент API сценария — пути и методы спеки §7, Idempotency-Key на создающих POST.
import { afterEach, expect, it, vi } from "vitest";
import { fillState, scriptApi, scriptUrls, stateActive } from "../../src/api/script-client.js";
import { fakeFetch, job, on } from "../helpers.js";
import { state } from "./plan-fixtures.js";

afterEach(() => vi.unstubAllGlobals());

it("маршруты и ключи идемпотентности", async () => {
  const { calls } = fakeFetch([(c) => ({ status: 200, body: { url: c.url } })]);
  await scriptApi.state("p 1");
  await scriptApi.saveText("p1", { blocks: [{ title: "", text: "a" }] });
  await scriptApi.buildPlan("p1", { useAgent: true }, "k1");
  await scriptApi.planOps("p1", { base_revision: 1, ops: [{ op: "set_status", item_id: "ss_001", status: "rejected" }] });
  await scriptApi.generate("p1", { revision: 1 }, "k2");
  await scriptApi.batch("sb_1");
  await scriptApi.cancelBatch("sb_1");
  await scriptApi.reframe("p1", { aspect: "9:16" }, "k3");
  await scriptApi.buildPackage("p1", { aspect: "16:9" }, "k4");
  await scriptApi.package("pkg_1");
  await scriptApi.reveal("pkg_1");
  expect(calls.map((c) => `${c.method} ${c.url} ${c.headers["idempotency-key"] ?? "-"}`)).toEqual([
    "GET /api/projects/p%201/script -",
    "PUT /api/projects/p1/script -",
    "POST /api/projects/p1/script/plan k1",
    "POST /api/projects/p1/script/plan/ops -",
    "POST /api/projects/p1/script/generate k2",
    "GET /api/script-batches/sb_1 -",
    "POST /api/script-batches/sb_1/cancel -",
    "POST /api/projects/p1/script/reframe k3",
    "POST /api/projects/p1/script/package k4",
    "GET /api/script-packages/pkg_1 -",
    "POST /api/script-packages/pkg_1/reveal -",
  ]);
  expect(scriptUrls.cheatsheet("pkg_1", "csv")).toBe("/api/script-packages/pkg_1/cheatsheet?format=csv");
});

it("S16a: сцена плана ждёт дозаполнения — состояние опрашивается, пока задача дозаполнения идёт", () => {
  const s = state({ fill_job: job({ id: "job_f", type: "script.plan", status: "running" }) as never });
  expect(stateActive(s)).toBe(false);
  s.plan!.doc.items[0] = { ...s.plan!.doc.items[0]!, fill: "pending" };
  expect(fillState(s)).toEqual({ kind: "running", items: ["ss_001"] });
  expect(stateActive(s)).toBe(true);
  // ревью I1: задача упала или её нет — опрос не нужен, UI предлагает повтор
  expect(fillState({ ...s, fill_job: { ...s.fill_job!, status: "failed" } })).toEqual({ kind: "failed", items: ["ss_001"] });
  expect(stateActive({ ...s, fill_job: { ...s.fill_job!, status: "cancelled" } })).toBe(false);
  expect(fillState({ ...s, fill_job: null })).toEqual({ kind: "failed", items: ["ss_001"] });
  s.plan!.doc.items[0] = { ...s.plan!.doc.items[0]!, fill: "failed" };
  expect(fillState(s)).toEqual({ kind: "none", items: [] });
  expect(stateActive(s)).toBe(false);
});

it("ревью S16a I1: повтор дозаполнения — POST plan/fill", async () => {
  const { calls } = fakeFetch([on("POST", "/api/projects/p1/script/plan/fill", { job: job({ id: "job_r", type: "script.plan", status: "pending" }) }, 202)]);
  await scriptApi.retryFill("p1");
  expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(["POST /api/projects/p1/script/plan/fill"]);
});
