// Session token signing/verification. Pure (no Next imports) so proxy.ts and tests can use it.
import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "aangan_session";
export const SESSION_TTL_SEC = 60 * 60 * 24 * 14; // 14 days

export type SessionPayload = {
  uid: string;
  email: string;
  name: string;
  role: "designer" | "owner";
  designerKey: string | null;
};

const key = (secret: string) => new TextEncoder().encode(secret);

export async function signSession(payload: SessionPayload, secret: string): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SEC}s`)
    .sign(key(secret));
}

export async function verifySession(token: string | undefined, secret: string): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ["HS256"] });
    if (typeof payload.uid !== "string" || typeof payload.email !== "string") return null;
    return {
      uid: payload.uid,
      email: payload.email,
      name: String(payload.name ?? ""),
      role: payload.role === "owner" ? "owner" : "designer",
      designerKey: typeof payload.designerKey === "string" ? payload.designerKey : null,
    };
  } catch {
    return null;
  }
}

// Only allow same-site relative redirects after login (prevents open redirects).
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
