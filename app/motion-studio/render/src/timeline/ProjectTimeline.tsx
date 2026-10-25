// Единая композиция видеопроекта (Task 36, ADR 0010): превью сцены в контексте, превью таймлайна
// и финал — одна и та же `ProjectTimeline`. Код пакета рендера (доверенный), не сцена агента:
// entry таймлайна (`writeTimelineEntry`) передаёт сюда реестр модулей сцен.
//
// Слои снизу вверх: видео исходника кусками EDL (`<Sequence>` + `OffthreadVideo` по master,
// `muted` — звук не из видео), одна дорожка `<Audio>` смонтированного звука (сэмпл-точные склейки,
// F2), сцены в порядке `z` — каждая `<Sequence>` на весь кадр (Р-V5): `fullscreen` непрозрачная,
// остальные прозрачные (props уже с `style.transparent = true`), графика — в `props.layout.rect`.
import type { ComponentType } from "react";
import { AbsoluteFill, Audio, OffthreadVideo, Sequence } from "remotion";
import type { TimelineRenderProps } from "./types.js";

export type SceneRegistry = Readonly<Record<string, ComponentType<Record<string, unknown>>>>;

const VIDEO_STYLE = { width: "100%", height: "100%", objectFit: "contain" } as const;

export function ProjectTimeline({ registry, ...p }: TimelineRenderProps & { registry: SceneRegistry }) {
  const scenes = [...p.scenes].sort((a, b) => a.z - b.z || a.start_frame - b.start_frame || (a.clip_id < b.clip_id ? -1 : a.clip_id > b.clip_id ? 1 : 0));
  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {p.video.sequences.map((s) => (
        <Sequence key={`video-${s.idx}`} name={`video ${s.idx}`} from={s.from} durationInFrames={s.durationInFrames}>
          <OffthreadVideo src={p.video.src} trimBefore={s.startFrom} muted style={VIDEO_STYLE} />
        </Sequence>
      ))}
      {p.audio ? <Audio src={p.audio.src} /> : null}
      {scenes.map((s) => {
        const Scene = registry[s.key];
        if (!Scene) throw new Error(`ProjectTimeline: сцены ${s.key} (${s.clip_id}) нет в реестре entry`);
        return (
          <Sequence key={s.clip_id} name={s.clip_id} from={s.start_frame} durationInFrames={s.duration_frames}>
            <Scene {...s.props} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
