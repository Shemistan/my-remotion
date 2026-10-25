// S10 fix M5: ключ «Переделать под 9:16» меняется после новой задачи двойника (иначе повтор
// после упавшего двойника вернул бы тот же пакет), а повторное нажатие без изменений — тот же.
import { expect, it } from "vitest";
import { reframeKey } from "../../src/script/output.js";
import { outState, scene } from "./output-fixtures.js";

it("reframeKey: те же 16:9-версии и задачи двойников — тот же ключ; новая задача двойника — новый", () => {
  const base = outState();
  const twin = (jobId: string) => {
    const s = scene("ss_001", "failed", { aspect: "9:16", scene_id: "sc_v1" });
    return { ...s, job: { ...s.job!, id: jobId } };
  };
  const a = outState({ scenes: [...base.scenes, twin("job_v1")] });
  const again = outState({ scenes: [...base.scenes, twin("job_v1")] });
  const b = outState({ scenes: [...base.scenes, twin("job_v2")] });
  expect(reframeKey(a, [])).toBe(reframeKey(again, []));
  expect(reframeKey(b, [])).not.toBe(reframeKey(a, []));
  expect(reframeKey(b, ["ss_001"])).not.toBe(reframeKey(a, ["ss_001"]));
  expect(reframeKey(a, [])).toMatch(/^script-reframe:[0-9a-f]{16}$/);
});
