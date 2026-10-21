import { expect, it } from "vitest";
import { childEnv } from "../../src/agents/env.js";

it("keeps only allowlisted variables", () => {
  expect(childEnv({ PATH: "/bin", GITHUB_TOKEN: "x", ANTHROPIC_API_KEY: "y" })).toEqual({ PATH: "/bin" });
});

it("passes the full allowlist and drops everything else", () => {
  const parent = {
    PATH: "/bin",
    HOME: "/Users/u",
    USER: "u",
    LOGNAME: "u",
    SHELL: "/bin/zsh",
    LANG: "ru_RU.UTF-8",
    LC_ALL: "C",
    TMPDIR: "/tmp/",
    CLAUDE_CODE_OAUTH_TOKEN: "t",
    AWS_SECRET_ACCESS_KEY: "s",
    NODE_OPTIONS: "--require evil.js",
    MS_DATA_DIR: "/Volumes/x",
  };
  expect(childEnv(parent)).toEqual({
    PATH: "/bin",
    HOME: "/Users/u",
    USER: "u",
    LOGNAME: "u",
    SHELL: "/bin/zsh",
    LANG: "ru_RU.UTF-8",
    LC_ALL: "C",
    TMPDIR: "/tmp/",
  });
});

it("skips undefined values", () => {
  expect(childEnv({ PATH: "/bin", HOME: undefined })).toEqual({ PATH: "/bin" });
});

it("tmpdir of the call replaces the parent TMPDIR", () => {
  expect(childEnv({ PATH: "/bin", TMPDIR: "/var/folders/x/" }, "/Volumes/SSD/MS/run/tmp/run_1-a1-engineer-abc")).toEqual({
    PATH: "/bin",
    TMPDIR: "/Volumes/SSD/MS/run/tmp/run_1-a1-engineer-abc",
  });
});
