import { defaultSettings } from "@ms/contracts";
import { fireEvent, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { t } from "../src/i18n/index.js";
import { AppSettings } from "../src/pages/AppSettings.js";
import { fakeFetch, on, renderQ } from "./helpers.js";

it("настройки используют русские ярлыки ролей и предлагают модели со свободным вводом", async () => {
  const agent = (model: string) => ({ model, timeoutMs: 1_200_000, maxBudgetUsd: 2 });
  fakeFetch([
    on("GET", "/api/settings", {
      agents: { concept: agent("sonnet"), engineer: agent("opus") },
      scene: { maxCostUsd: 5, maxAutoFixes: 2 },
      limits: { maxRunning: 16, agentCalls: 16, renders: 4, exportTimeoutMs: 1_800_000 },
      defaults: defaultSettings(),
      delegation: { enabled: false, level: 0, allowUnverified: false },
    }),
    on("GET", "/api/delegation", {
      policy: { enabled: false, level: 0, allowUnverified: false },
      level: 0,
      minLevel: 1,
      maxLevel: 30,
      maxLevelUnverified: 40,
      roles: [{ role: "engineer", weight: 1, share: 0, status: "idle", stats: { codex: { n: 0, clean: 0 }, claude: { n: 0, clean: 0 } } }],
      codex: { status: "ok", detail: "0.165.0" },
    }),
  ]);
  renderQ(<AppSettings />);

  const model = await screen.findByLabelText(t("diagnostics.role.concept")) as HTMLInputElement;
  expect(screen.queryByText("Concept")).toBeNull();
  expect(screen.getAllByText(t("diagnostics.role.engineer"))).toHaveLength(2);
  const list = document.getElementById(model.getAttribute("list")!)!;
  expect([...list.querySelectorAll("option")].map((o) => o.getAttribute("value"))).toEqual(["sonnet", "opus", "haiku"]);
  fireEvent.change(model, { target: { value: "custom-model" } });
  expect(model.value).toBe("custom-model");
});
