// ComponentsPanel: компоненты KB (kb_id, repo, commit, лицензия, класс, стратегия) и motion-kit.
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ComponentsPanel } from "../src/components/ComponentsPanel.js";
import { t } from "../src/i18n/index.js";

const ref = (o: Record<string, unknown>) => ({
  kb_id: "remotion-bits/animated-counter", repository: "remotion-bits", repository_url: "https://github.com/x/remotion-bits",
  commit: "0123456789abcdef", license: "MIT", license_class: "permissive", strategy: "adapt", source_paths: ["a.tsx"], ...o,
}) as never;

it("restricted-компонент помечен бейджем, commit укорочен до 7 символов", () => {
  render(<ComponentsPanel refs={[ref({}), ref({ kb_id: "q/r", license: "MIT + Commons Clause", license_class: "restricted", commit: "fedcba9876543210" })]} kitComponents={[]} />);
  expect(screen.getByText("remotion-bits/animated-counter")).toBeTruthy();
  expect(screen.getByText("0123456")).toBeTruthy();
  expect(screen.getByText("fedcba9")).toBeTruthy();
  expect(screen.queryByText("0123456789abcdef")).toBeNull();
  const badge = screen.getByText(t("license.class.restricted"));
  expect(badge.getAttribute("data-license")).toBe("restricted");
  expect(screen.getByText(t("license.class.permissive")).getAttribute("data-license")).toBe("permissive");
  expect(screen.getAllByText(t("strategy.adapt"))).toHaveLength(2);
  expect(screen.getByText("MIT + Commons Clause")).toBeTruthy();
});

it("ссылка на репозиторий — только http(s), открывается в новой вкладке без referrer", () => {
  render(<ComponentsPanel refs={[ref({}), ref({ kb_id: "bad/x", repository_url: "javascript:alert(1)" })]} kitComponents={[]} />);
  const links = screen.getAllByRole("link");
  expect(links).toHaveLength(1);
  expect(links[0]!.getAttribute("href")).toBe("https://github.com/x/remotion-bits");
  expect(links[0]!.getAttribute("rel")).toContain("noreferrer");
});

it("компоненты motion-kit и пустые списки", () => {
  render(<ComponentsPanel refs={[]} kitComponents={["FlowGraph", "PulseAlongPath"]} />);
  expect(screen.getByText("FlowGraph")).toBeTruthy();
  expect(screen.getByText(t("components.noKb"))).toBeTruthy();
});
