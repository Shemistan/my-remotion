import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { DisabledReason } from "../src/components/ui/DisabledReason.js";
import { t } from "../src/i18n/index.js";

it("показывает у заблокированного действия причину только из словаря", () => {
  render(
    <DisabledReason reasonKey="ux.disabled.enterProjectTitle">
      <button type="button" disabled>{t("dashboard.create")}</button>
    </DisabledReason>,
  );
  const reason = screen.getByRole("status");
  expect(reason.textContent).toBe(t("ux.disabled.enterProjectTitle"));
  expect(screen.getByRole("button").getAttribute("aria-describedby")).toBe(reason.id);
});

it("не добавляет подсказку доступному действию", () => {
  render(<DisabledReason><button type="button">{t("dashboard.create")}</button></DisabledReason>);
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByRole("button").hasAttribute("aria-describedby")).toBe(false);
});
