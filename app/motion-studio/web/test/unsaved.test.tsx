import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { t } from "../src/i18n/index.js";
import { useUnsavedGuard } from "../src/ui/unsaved.js";

it("ставит beforeunload только для несохранённого черновика", () => {
  const { rerender, unmount } = renderHook(({ dirty }) => useUnsavedGuard(dirty), { initialProps: { dirty: false } });
  const clean = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
  window.dispatchEvent(clean);
  expect(clean.defaultPrevented).toBe(false);

  rerender({ dirty: true });
  const dirty = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
  Object.defineProperty(dirty, "returnValue", { writable: true, value: undefined });
  window.dispatchEvent(dirty);
  expect(dirty.defaultPrevented).toBe(true);
  expect(dirty.returnValue).toBe(t("ux.unsaved.leave"));
  unmount();
});

it("confirmLeave спрашивает только при наличии изменений", () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const { result, rerender } = renderHook(({ dirty }) => useUnsavedGuard(dirty), { initialProps: { dirty: false } });
  expect(result.current.confirmLeave()).toBe(true);
  expect(confirm).not.toHaveBeenCalled();
  rerender({ dirty: true });
  act(() => expect(result.current.confirmLeave()).toBe(false));
  expect(confirm).toHaveBeenCalledWith(t("ux.unsaved.leave"));
  confirm.mockRestore();
});
