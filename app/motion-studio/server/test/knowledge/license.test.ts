import { describe, expect, it } from "vitest";
import { confidenceOf, licenseClass } from "../../src/knowledge/license.js";
import type { CapabilityView } from "../../src/knowledge/types.js";

describe("licenseClass", () => {
  it("restricted", () => {
    expect(licenseClass("MIT + Commons Clause")).toBe("restricted");
    expect(licenseClass("MIT + Commons Clause v1.0 (LICENSE.md)")).toBe("restricted");
    expect(licenseClass("UNLICENSED (package.json, README); файла LICENSE нет")).toBe("restricted");
  });
  it("unknown", () => {
    expect(licenseClass("не указана")).toBe("unknown");
    expect(licenseClass("не указана (нет LICENSE, нет поля license в package.json)")).toBe("unknown");
    expect(licenseClass("нет")).toBe("unknown");
    expect(licenseClass("")).toBe("unknown");
    expect(licenseClass("   ")).toBe("unknown");
    expect(licenseClass("GPL-3.0")).toBe("unknown");
  });
  it("permissive", () => {
    expect(licenseClass("MIT (package.json)")).toBe("permissive");
    expect(licenseClass("MIT (package.json; файла LICENSE нет)")).toBe("permissive");
    expect(licenseClass("Apache-2.0 (package.json, LICENSE, NOTICE)")).toBe("permissive");
    expect(licenseClass("BSD-3-Clause")).toBe("permissive");
    expect(licenseClass("ISC")).toBe("permissive");
    // Реальные строки KB: фото/аватары Unsplash, сторонние бренды, чужие данные.
    expect(licenseClass("MIT (LICENSE.md); фото по умолчанию — Unsplash")).toBe("unknown");
    expect(licenseClass("MIT (LICENSE.md); аватар по умолчанию — Unsplash")).toBe("unknown");
    expect(licenseClass("MIT (LICENSE.md); логотип авиакомпании — сторонний бренд с seeklogo.com")).toBe("unknown");
    expect(licenseClass("Apache-2.0 (package.json, LICENSE, NOTICE); лицензия GeoJSON — своя у источника")).toBe("unknown");
    expect(licenseClass("CC0 1.0 (LICENSE)")).toBe("permissive");
    expect(licenseClass("MIT (package.json, LICENSE); шрифт Inter — OFL (Google Fonts)")).toBe("permissive");
    expect(licenseClass("Apache-2.0 (package.json, LICENSE, NOTICE); layoutHelper.ts содержит код d3 (BSD-3, licenses/LICENSE-d3)")).toBe("permissive");
  });
  it("оговорки о неясных сторонних материалах -> unknown", () => {
    expect(licenseClass("MIT (LICENSE.md); обложка public/widget/music.jpg — лицензия не указана")).toBe("unknown");
    expect(licenseClass("CC0 1.0 (LICENSE) на сам список; у каждого проекта своя лицензия")).toBe("unknown");
  });
});

describe("confidenceOf", () => {
  const v = (tested_status: string, compatibility_status: string) =>
    ({ tested_status, compatibility_status }) as unknown as CapabilityView;
  it("правила", () => {
    expect(confidenceOf(v("static-review", "native"))).toBe("medium");
    expect(confidenceOf(v("static-review", "adaptable"))).toBe("low");
    expect(confidenceOf(v("static-review", "complex"))).toBe("unknown");
    expect(confidenceOf(v("unverified", "native"))).toBe("unknown");
    expect(confidenceOf(v("rendered-ok", "native"))).toBe("unknown");
  });
});
