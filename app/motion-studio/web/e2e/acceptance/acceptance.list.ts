// Порядок приёмки (Playwright «test list»): спецификации — функции, здесь вызываются по
// порядку в одном воркере. Test 2 и Test 3 идут на сценах предыдущих шагов; MS_ACC_ONLY=<имя>
// (через запятую) — только эти шаги (продолжение прогона с MS_ACC_REUSE=1).
import { test } from "@playwright/test";
import mvpCriteria from "./mvp-criteria.spec.js";
import resilience from "./resilience.spec.js";
import restart from "./restart.spec.js";
import test1 from "./test1-data-storytelling.spec.js";
import test2 from "./test2-technical-explainer.spec.js";
import test3 from "./test3-iterative-editing.spec.js";

const only = process.env.MS_ACC_ONLY?.split(",").map((s) => s.trim()).filter(Boolean);
const steps: [string, () => void][] = [["test1", test1], ["test2", test2], ["test3", test3], ["restart", restart], ["resilience", resilience], ["mvp", mvpCriteria]];

test.describe.configure({ mode: "default" });
for (const [name, register] of steps) if (!only || only.includes(name)) test.describe(name, register);
