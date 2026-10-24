// StaleBanner (Task 33): план на прежнем монтаже или стиле — предупреждение и «Перепроверить план»;
// после перепроверки — «Монтаж изменился: N пересчитаны, M требуют решения» со списком.
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { StaleBanner } from "../../src/components/video/StaleBanner.js";
import { t } from "../../src/i18n/index.js";

const fresh = { edl: true, transcript: true, style: true };

it("итог перепроверки: anchor_cut 1, remapped 2 → сводка и список требующих решения; кнопка перепроверки", () => {
  const onRecheck = vi.fn();
  render(<StaleBanner fresh={fresh} recheck={{ changed: [
    { item_id: "sp_001", change: "anchor_cut" }, { item_id: "sp_002", change: "remapped" }, { item_id: "sp_003", change: "remapped" },
  ] }} busy={false} onRecheck={onRecheck} />);
  const banner = screen.getByTestId("stale-banner");
  expect(banner.textContent).toContain("Монтаж изменился: 2 сцены пересчитаны, 1 требует решения");
  expect(banner.textContent).toContain(t("plan.stale.change.anchor_cut", { id: "sp_001" }));
  expect(banner.textContent).not.toContain("sp_002");
  fireEvent.click(screen.getByRole("button", { name: t("plan.recheck") }));
  expect(onRecheck).toHaveBeenCalledOnce();
});

it("план на прежнем монтаже — предупреждение; на прежнем стиле — своё; идёт перепроверка — кнопка недоступна", () => {
  const { rerender } = render(<StaleBanner fresh={{ ...fresh, edl: false }} recheck={null} busy={false} onRecheck={vi.fn()} />);
  expect(screen.getByTestId("stale-banner").textContent).toContain(t("plan.stale.edl"));
  rerender(<StaleBanner fresh={{ ...fresh, style: false }} recheck={null} busy onRecheck={vi.fn()} />);
  expect(screen.getByTestId("stale-banner").textContent).toContain(t("plan.stale.style"));
  expect(screen.getByRole("button", { name: t("plan.recheck") })).toHaveProperty("disabled", true);
  expect(screen.getByTestId("stale-banner").textContent).toContain(t("plan.stale.running"));
});

it("всё свежо и перепроверки не было (или только пересчёт без перемен) — баннера нет", () => {
  const { container, rerender } = render(<StaleBanner fresh={fresh} recheck={null} busy={false} onRecheck={vi.fn()} />);
  expect(container.textContent).toBe("");
  rerender(<StaleBanner fresh={fresh} recheck={{ changed: [] }} busy={false} onRecheck={vi.fn()} />);
  expect(container.textContent).toBe("");
});

it("ревью #5: сводка — русские формы числа (1 сцена пересчитана, 5 сцен, 2 требуют решения)", () => {
  const ch = (id: string, change: "remapped" | "anchor_cut") => ({ item_id: id, change });
  const { rerender } = render(<StaleBanner fresh={fresh} recheck={{ changed: [ch("sp_001", "remapped")] }} busy={false} onRecheck={vi.fn()} />);
  expect(screen.getByTestId("stale-banner").textContent).toContain("Монтаж изменился: 1 сцена пересчитана, 0 требуют решения");
  const many = [1, 2, 3, 4, 5].map((i) => ch(`sp_00${i}`, "remapped"));
  rerender(<StaleBanner fresh={fresh} recheck={{ changed: [...many, ch("sp_006", "anchor_cut"), ch("sp_007", "anchor_cut")] }} busy={false} onRecheck={vi.fn()} />);
  expect(screen.getByTestId("stale-banner").textContent).toContain("Монтаж изменился: 5 сцен пересчитаны, 2 требуют решения");
});
