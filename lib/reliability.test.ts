import { describe, expect, it, vi } from "vitest";
import {
  RELIABILITY_RULES,
  formatBlockedUntil,
  isLateCancellationWindow,
  isWorkerBlocked,
} from "./reliability";

describe("reliability helpers", () => {
  it("flags cancellations inside the late window", () => {
    const now = new Date("2026-04-18T10:00:00Z");
    expect(
      isLateCancellationWindow(
        {
          shift_date: "2026-04-19",
          start_time: "08:00:00",
        },
        now,
      ),
    ).toBe(true);

    expect(
      isLateCancellationWindow(
        {
          shift_date: "2026-04-21",
          start_time: "12:00:00",
        },
        now,
      ),
    ).toBe(false);
    expect(RELIABILITY_RULES.blockStrikeThreshold).toBe(3);
  });

  it("treats workers as blocked only until the block expires", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-18T10:00:00Z"));

    expect(
      isWorkerBlocked({
        worker_id: "worker",
        active_strikes: 3,
        reliability_status: "temporarily_blocked",
        blocked_until: "2026-04-20T10:00:00Z",
        late_cancellations_count: 1,
        no_show_count: 1,
        completed_shifts_count: 4,
        last_event_at: null,
        created_at: "",
        updated_at: "",
      }),
    ).toBe(true);

    expect(
      isWorkerBlocked({
        worker_id: "worker",
        active_strikes: 3,
        reliability_status: "temporarily_blocked",
        blocked_until: "2026-04-17T10:00:00Z",
        late_cancellations_count: 1,
        no_show_count: 1,
        completed_shifts_count: 4,
        last_event_at: null,
        created_at: "",
        updated_at: "",
      }),
    ).toBe(false);

    expect(formatBlockedUntil("2026-04-20T10:30:00Z")).toContain("20 Apr 2026");
    vi.useRealTimers();
  });
});
