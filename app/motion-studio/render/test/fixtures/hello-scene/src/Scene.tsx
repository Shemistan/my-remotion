// Рукописная тестовая сцена: всё движение — от кадра, без таймеров и случайности.
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

export const Scene = ({ title }: { title: string }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0d12", justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          width: 120,
          height: 120,
          borderRadius: 24,
          backgroundColor: "#4f8cff",
          translate: `${interpolate(frame, [0, durationInFrames - 1], [-200, 200], clamp)}px 0px`,
          rotate: `${interpolate(frame, [0, durationInFrames - 1], [0, 180], clamp)}deg`,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 40,
          color: "#ffffff",
          fontFamily: "sans-serif",
          fontSize: 32,
          opacity: interpolate(frame, [0, fps / 2], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) }),
        }}
      >
        {title}
      </div>
    </AbsoluteFill>
  );
};
