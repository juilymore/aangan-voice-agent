"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { findPersona } from "@/config/team";
import { PERSONA_COOKIE } from "@/lib/persona";

export async function switchPersona(key: string) {
  const persona = findPersona(key); // unknown keys fall back to the default persona
  (await cookies()).set(PERSONA_COOKIE, persona.key, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
