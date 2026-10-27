import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ConfirmDialog } from "../src/components/ui/ConfirmDialog.js";
import { t } from "../src/i18n/index.js";

it("связывает заголовок и описание, подтверждает и отменяет", () => {
  const yes = vi.fn();
  const no = vi.fn();
  render(
    <ConfirmDialog
      open
      title={t("ux.confirm.deleteProject.title")}
      description={t("ux.confirm.deleteProject.description")}
      confirmLabel={t("ux.confirm.deleteProject.action")}
      onConfirm={yes}
      onCancel={no}
      danger
    />,
  );
  const dialog = screen.getByRole("dialog", { name: t("ux.confirm.deleteProject.title") });
  expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: t("ux.confirm.deleteProject.action") }));
  expect(yes).toHaveBeenCalledOnce();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(no).toHaveBeenCalledOnce();
});

it("не рендерится в закрытом состоянии и блокирует действие во время запроса", () => {
  const { rerender } = render(<ConfirmDialog open={false} title="x" description="y" confirmLabel="z" onConfirm={() => undefined} onCancel={() => undefined} />);
  expect(screen.queryByRole("dialog")).toBeNull();
  rerender(<ConfirmDialog open title="x" description="y" confirmLabel="z" busy onConfirm={() => undefined} onCancel={() => undefined} />);
  expect((screen.getByRole("button", { name: "z" }) as HTMLButtonElement).disabled).toBe(true);
});
