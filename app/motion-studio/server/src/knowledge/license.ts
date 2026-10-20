import type { CapabilityView, Confidence, LicenseClass } from "./types.js";

// Ограничения на использование/распространение.
const RESTRICTED = /commons clause|unlicensed|proprietary/;
// Лицензия сама по себе не определена.
const UNDEFINED = /^(не указана|нет|unknown|n\/a)/;
// Оговорки о сторонних материалах с неясной лицензией (изображения, свои лицензии проектов).
const CAVEAT = /лицензия не указана|сторонн|своя лицензия|своя у источника|unsplash/;
const PERMISSIVE = /^(mit|apache|bsd|isc|cc0)/;

export function licenseClass(license: string): LicenseClass {
  const s = license.trim().toLowerCase();
  if (s === "") return "unknown";
  if (RESTRICTED.test(s)) return "restricted";
  if (UNDEFINED.test(s) || CAVEAT.test(s)) return "unknown";
  return PERMISSIVE.test(s) ? "permissive" : "unknown";
}

type ConfidenceInput = Pick<CapabilityView, "tested_status" | "compatibility_status">;

export function confidenceOf(view: ConfidenceInput): Confidence {
  if (view.tested_status !== "static-review") return "unknown";
  if (view.compatibility_status === "native") return "medium";
  if (view.compatibility_status === "adaptable") return "low";
  return "unknown";
}
