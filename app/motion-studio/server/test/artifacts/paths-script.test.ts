// S1 «сценарий → моушн»: каталоги ревизий текста и пакетов в artifactPaths и DEST_REL_RE.
import { expect, it } from "vitest";
import { artifactPaths, checkArtifactDestRel } from "../../src/artifacts/paths.js";

it("scriptRev и package", () => {
  expect(artifactPaths("/r", "prj_A").scriptRev("scr_B", 1)).toBe("workspace/projects/prj_A/script/scr_B/r1");
  expect(artifactPaths("/r", "prj_A").package("pkg_C")).toBe("workspace/projects/prj_A/packages/pkg_C");
  expect(() => artifactPaths("/r", "prj_A").scriptRev("scr_B", 0)).toThrow();
  expect(() => artifactPaths("/r", "prj_A").package("../x")).toThrow();
});

it("destRel принимает обе формы и ничего лишнего", () => {
  expect(() => checkArtifactDestRel("workspace/projects/prj_A/script/scr_B/r1")).not.toThrow();
  expect(() => checkArtifactDestRel("workspace/projects/prj_A/packages/pkg_C")).not.toThrow();
  expect(() => checkArtifactDestRel("workspace/projects/prj_A/packages/../x")).toThrow();
  expect(() => checkArtifactDestRel("workspace/projects/prj_A/script/scr_B")).toThrow();
  expect(() => checkArtifactDestRel("workspace/projects/prj_A/packages/pkg_C/r1")).toThrow();
  expect(() => checkArtifactDestRel("workspace/projects/prj_A/script/scr_B/r0")).toThrow();
});
