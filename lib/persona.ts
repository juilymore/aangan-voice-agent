import "server-only";
import { cookies } from "next/headers";
import { findPersona, type Persona } from "@/config/team";

export const PERSONA_COOKIE = "aangan_view_as";

/** Who the dashboard is currently viewed as (defaults to Nikhil). */
export async function currentPersona(): Promise<Persona> {
  return findPersona((await cookies()).get(PERSONA_COOKIE)?.value);
}
