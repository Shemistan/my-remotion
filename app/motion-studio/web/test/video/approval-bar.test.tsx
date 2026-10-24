// ApprovalBar: A и B — «нет», «утверждено», «устарело — причина»; MediaInfo: fps 30000/1001 → «29,97».
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ApprovalBar } from "../../src/components/video/ApprovalBar.js";
import { MediaInfo } from "../../src/components/video/MediaInfo.js";
import { t } from "../../src/i18n/index.js";
import { approvals } from "./fixtures.js";

const approval = { id: "apr_1", project_id: "p1", kind: "A" as const, subject_ref: "edl:edl_1@r2", subject_hash: "a".repeat(64), status: "valid" as const, decided_at: "2026-10-24T10:00:00.000Z" };

it("A: нет / утверждено / устарело — причина", () => {
  const { rerender } = render(<ApprovalBar approvals={approvals()} />);
  expect(screen.getByTestId("approval-A").textContent).toContain(t("approval.state.missing"));
  rerender(<ApprovalBar approvals={approvals({ state: "valid", approval })} />);
  expect(screen.getByTestId("approval-A").textContent).toContain(t("approval.state.valid"));
  rerender(<ApprovalBar approvals={approvals({ state: "stale", reason: "subject_changed", approval: { ...approval, status: "stale", stale_reason: "subject_changed" } })} />);
  expect(screen.getByTestId("approval-A").textContent).toContain(t("approval.stale.subject_changed"));
  expect(screen.getByTestId("approval-B").textContent).toContain(t("approval.state.missing"));
});

it("MediaInfo: длительность, размер, fps «29,97», VFR, поворот, звук, sha256 (12 символов), оригинал только для чтения", () => {
  const asset = {
    id: "med_1", project_id: "p1", original_name: "talk.mov", rel_path: "workspace/projects/p1/source/med_1/original.mov", sha256: "0123456789abcdef".repeat(4), size_bytes: 1_500_000,
    probe: {
      container: "mov,mp4", duration_us: 20_020_000, size_bytes: 1_500_000, start_time_us: 0,
      video: { codec: "h264", width: 1920, height: 1080, display_width: 1920, display_height: 1080, rotation: 90 as const, r_frame_rate: { num: 30000, den: 1001 }, avg_frame_rate: { num: 30000, den: 1001 }, pix_fmt: "yuv420p" },
      audio: { codec: "aac", sample_rate: 48_000, channels: 2 }, vfr: true, timeline_fps: { num: 30000, den: 1001 },
    },
    status: "ready" as const, import: { method: "path" as const, source_path: "/Volumes/SSD/talk.mov", cloned: true }, created_at: "2026-10-24T10:00:00.000Z",
  };
  render(<MediaInfo media={{ asset, derivatives: [], transcript_id: null }} />);
  const text = screen.getByTestId("media-info").textContent ?? "";
  expect(text).toContain("29,97");
  expect(text).toContain("00:00:20.02");
  expect(text).toContain("1920×1080");
  expect(text).toContain("0123456789ab");
  expect(text).not.toContain("0123456789abc");
  expect(text).toContain(t("media.vfrYes"));
  expect(text).toContain("90°");
  expect(text).toContain("/Volumes/SSD/talk.mov");
  expect(text).toContain(t("media.readOnly"));
});
