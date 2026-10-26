// Оценка места под финал (ADR 0010, Task 49b) — одна для задачи `final.render`/`final.reproduce` и
// для API (диалог экспорта, предпроверка 409 `low_space`): файл финала с запасом; master по ступени
// короткой стороны выхода (не в кэше — ещё и копия, которую Remotion качает во временный каталог
// попытки); копия смонтированного WAV в рабочем каталоге и у Remotion.
import type { FinalExportRequest, FinalManifest, MediaAsset, VideoTimelineDoc } from "@ms/contracts";
import { artifactPaths } from "../artifacts/paths.js";
import { isPublished } from "../artifacts/store.js";
import type { Db } from "../db/open.js";
import { timelineFor } from "../edit/timeline-store.js";
import { masterFrames, masterHeightFor, masterSize, publishedMasterSha } from "../media/master.js";
import { editedAudioBytes, estimateFinalBytes, estimateMasterBytes } from "../media/space.js";
import { finalOutput } from "./render.js";

export interface FinalSpacePlan {
  out: ReturnType<typeof finalOutput>;
  /** Ступень master (`undefined` — в размере исходника). */
  masterHeight: number | undefined;
  masterCached: boolean;
  /** Байт нужно под работу (без порога StorageGuard). */
  bytes: number;
}

/**
 * План места финала ревизии `doc` из исходника `asset`. `expect` — манифест исходного экспорта при
 * повторе: экспорт до 49b брал полный master — если опубликованный полный master тот же
 * (`master_sha256`), повтор берёт его.
 */
export async function finalSpacePlan(
  db: Db, root: string, projectId: string, asset: Pick<MediaAsset, "id" | "probe">, doc: VideoTimelineDoc, request: FinalExportRequest, expect?: FinalManifest,
): Promise<FinalSpacePlan> {
  const display = { width: asset.probe.video.display_width, height: asset.probe.video.display_height };
  const out = finalOutput(doc, request, display);
  const paths = artifactPaths(root, projectId);
  let masterHeight = masterHeightFor(display, Math.min(out.width, out.height));
  if (expect && masterHeight !== undefined && (await publishedMasterSha(root, db, paths.master(asset.id, doc.fps))) === expect.inputs.master_sha256) masterHeight = undefined;
  const masterCached = isPublished(db, paths.master(asset.id, doc.fps, masterHeight));
  const masterBytes = estimateMasterBytes({ frames: masterFrames(asset.probe, doc.fps), ...masterSize(display, masterHeight) });
  const tl = timelineFor(db, doc.inputs.edl.id, doc.inputs.edl.revision);
  const bytes = estimateFinalBytes({ ...out, quality: request.quality }) + masterBytes * (masterCached ? 1 : 2)
    + 2 * editedAudioBytes({ durationUs: tl.duration_us, channels: asset.probe.audio?.channels ?? 0 });
  return { out, masterHeight, masterCached, bytes };
}
