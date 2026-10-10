import { deps } from "@/lib/providers";
import { callerNumberOf, runTool } from "@/lib/tools/http";
import {
  BookParams,
  CheckFitParams,
  LookupParams,
  SlotsParams,
  bookConsultation,
  checkFit,
  getAvailableSlots,
  lookupCaller,
} from "@/lib/tools/handlers";

// The four mid-call tools Vaani calls (docs/vaani_agent_prompt.md Part C). POST /api/tools/<name>
// with header x-aangan-tool-secret. Every response is well-formed JSON, never an empty 500.
export const maxDuration = 15;

export async function POST(request: Request, ctx: { params: Promise<{ tool: string }> }) {
  const { tool } = await ctx.params;
  switch (tool) {
    case "lookup_caller":
      return runTool(request, tool, LookupParams, 2_000,
        { known: false, has_booking: false, booking_spoken: null, booking_designer: null, recent_call: false },
        (p, c) => lookupCaller({ caller_number: p.caller_number ?? callerNumberOf(c.body, c.raw, request) }));
    case "check_fit":
      // On any error the agent proceeds; the post-call pipeline re-checks (build_spec §6).
      return runTool(request, tool, CheckFitParams, 2_500, { decision: "proceed" as const }, (p, c) => checkFit(p, c.callId));
    case "get_available_slots":
      return runTool(request, tool, SlotsParams, 6_000, { slots: [] as unknown[], error: "calendar_unavailable" }, (p) =>
        getAvailableSlots(p, deps()),
      );
    case "book_consultation":
      return runTool(request, tool, BookParams, 8_000, { success: false, error: "calendar_unavailable" }, (p, c) =>
        bookConsultation(p, c.callId, deps()),
      );
    default:
      return Response.json({ error: "unknown tool" }, { status: 404 });
  }
}
