// Обёртка итога cold-open (S3-fix2): крючок в полную силу с кадра 0 → уход целиком → нет на
// объяснении → возврат на ударе payoff (choreo/cold-open.ts). Итог не бывает «призраком».
import type { Beat } from "@ms/contracts";
import type { CSSProperties, ReactNode } from "react";
import { useCurrentFrame } from "remotion";
import { type ColdOpenFrame, coldOpenAt, coldOpenStyle } from "../choreo/cold-open.js";
import { useStyle } from "../style.js";

type Window = Pick<Beat, "start_frame" | "end_frame">;

/** Кадр cold-open (хук): `open` — бит `<id>-open`, `strike` — бит удара payoff (или его кадр). */
export function useColdOpen(open: Window, strike: Window | number): ColdOpenFrame & { style: CSSProperties } {
  const s = useStyle();
  const frame = useCurrentFrame();
  const f = coldOpenAt(frame, open, typeof strike === "number" ? strike : strike.start_frame, s);
  return { ...f, style: coldOpenStyle(f) };
}

/**
 * Итог cold-open: дети (герой итога — число, короткое утверждение) видны в полную силу в бите
 * `open`, уходят к его концу, на объяснении скрыты, возвращаются на ударе `strike`.
 */
export function ColdOpen({ open, strike, style, children }: { open: Window; strike: Window | number; style?: CSSProperties; children?: ReactNode }) {
  const c = useColdOpen(open, strike);
  return <div style={{ transformOrigin: "50% 50%", ...style, ...c.style }}>{children}</div>;
}
