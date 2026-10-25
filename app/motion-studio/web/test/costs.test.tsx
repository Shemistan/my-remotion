// Затраты (Task 49a): сводка на Dashboard за 7/30 дней по ролям и моделям с подписью «не счёт
// подписки»; значок стоимости пакета; кнопка уборки кэша с Idempotency-Key.
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CacheGc } from "../src/components/costs/CacheGc.js";
import { CostBadge } from "../src/components/costs/CostBadge.js";
import { CostSummary } from "../src/components/costs/CostSummary.js";
import { t } from "../src/i18n/index.js";
import { fakeFetch, job, on, renderQ } from "./helpers.js";

afterEach(() => vi.unstubAllGlobals());

const summary = { totalUsd: 3.75, byRole: { engineer: 2.5, visual_qa: 0.25, motion_director: 1 }, byModel: { "claude-opus": 3.5, "claude-sonnet": 0.25 }, byScene: [], calls: 5, unknown: 1 };

it("CostSummary: итог, роли, модели, подпись; переключение 30 дней", async () => {
  const { calls } = fakeFetch([on("GET", /^\/api\/costs\?days=(7|30)$/, summary)]);
  renderQ(<CostSummary />);
  expect(await screen.findByText(t("costs.total", { usd: "$3.75" }))).toBeTruthy();
  expect(screen.getByText(t("costs.note"))).toBeTruthy();
  expect(screen.getByText(t("diagnostics.role.engineer"))).toBeTruthy();
  expect(screen.getByText("claude-opus")).toBeTruthy();
  expect(screen.getByText(t("costs.unknown", { n: 1 }))).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: t("costs.days", { n: 30 }) }));
  await waitFor(() => expect(calls.some((c) => c.url === "/api/costs?days=30")).toBe(true));
});

it("CostSummary: нет вызовов — «пусто»", async () => {
  fakeFetch([on("GET", /^\/api\/costs/, { ...summary, totalUsd: 0, byRole: {}, byModel: {}, calls: 0, unknown: 0 })]);
  renderQ(<CostSummary />);
  expect(await screen.findByText(t("costs.empty"))).toBeTruthy();
});

it("CostBadge: сумма задач пакета; ноль и пустой пакет — без значка и без запроса", async () => {
  const { calls } = fakeFetch([on("GET", "/api/costs?jobIds=a%2Cb", { ...summary, totalUsd: 1.2 })]);
  renderQ(<CostBadge jobIds={["b", "a"]} />);
  expect((await screen.findByTestId("cost-badge")).textContent).toBe(t("costs.badge", { usd: "$1.2" }));
  renderQ(<CostBadge jobIds={[]} />);
  expect(calls).toHaveLength(1);
});

it("CacheGc: POST /api/cache/gc с ключом идемпотентности", async () => {
  const { calls } = fakeFetch([on("POST", "/api/cache/gc", { job: job({ type: "cache.gc", status: "pending" }) }, 202)]);
  renderQ(<CacheGc />);
  fireEvent.click(screen.getByRole("button", { name: t("costs.cacheGc.run") }));
  expect(await screen.findByText(t("costs.cacheGc.queued"), { exact: false })).toBeTruthy();
  expect(calls[0]!.headers["idempotency-key"]).toBeTruthy();
});
