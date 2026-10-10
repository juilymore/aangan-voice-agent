import { describe, expect, it } from "vitest";
import { mockDeps } from "@/lib/providers";
import { resolveSlotId } from "@/lib/tools/handlers";

// resolveSlotId reads designers and bookings from the database; these cases only exercise the
// canonical path, which must not touch the database or calendar.
describe("slot id resolution", () => {
  it("passes a canonical slot id straight through", async () => {
    const id = "ruhi|2026-10-15T04:30:00.000Z|site_visit";
    expect(await resolveSlotId(id, "site_visit", mockDeps())).toBe(id);
  });
});
