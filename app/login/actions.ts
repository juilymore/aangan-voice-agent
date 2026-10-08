"use server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/token";

const LoginInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
  next: z.string().optional(),
});

export type LoginState = { error?: string };

let dummy: string | undefined;
function dummyHash() {
  dummy ??= bcrypt.hashSync("not-a-real-password", 10);
  return dummy;
}

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = LoginInput.safeParse({
    email: form.get("email"),
    password: form.get("password"),
    next: form.get("next") ?? undefined,
  });
  if (!parsed.success) return { error: "Enter your email and password." };

  const [user] = await db().select().from(schema.users).where(eq(schema.users.email, parsed.data.email)).limit(1);
  // Compare against a dummy hash when the user doesn't exist, so timing doesn't reveal valid emails.
  const hash = user?.passwordHash ?? dummyHash();
  const ok = await bcrypt.compare(parsed.data.password, hash);
  if (!user || !ok) return { error: "Wrong email or password." };

  await createSession({
    uid: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    designerKey: user.designerKey,
  });
  redirect(safeNext(parsed.data.next));
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
