// The studio team shown in the "Viewing as" switcher. No logins: this is a submission project,
// so anyone with the dashboard URL can pick a persona. Designer emails come from the designers table.

export type PersonaRole = "owner" | "designer";

export type Persona = {
  key: string; // "nikhil" | designer key
  name: string;
  role: PersonaRole;
  designerKey: string | null; // links to designers.key for designers
};

export const TEAM: readonly Persona[] = [
  { key: "nikhil", name: "Nikhil", role: "owner", designerKey: null },
  { key: "ruhi", name: "Ruhi", role: "designer", designerKey: "ruhi" },
  { key: "jay", name: "Jay", role: "designer", designerKey: "jay" },
];

export const DEFAULT_PERSONA = TEAM[0];

export function findPersona(key: string | undefined | null): Persona {
  return TEAM.find((p) => p.key === key) ?? DEFAULT_PERSONA;
}
