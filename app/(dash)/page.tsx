import { currentPersona } from "@/lib/persona";

export const metadata = { title: "Today · Aangan Leads" };

// Checkpoint 1: empty shell. Sections are filled at Checkpoint 4 (functional_design.md §7.13).
// Designers see their own leads by default; Nikhil sees the whole studio.
export default async function TodayPage() {
  const persona = await currentPersona();
  const scope = persona.role === "owner" ? "the whole studio" : `${persona.name}'s leads`;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Good day, {persona.name}</h1>
        <p className="text-sm text-stone-500">Showing {scope}.</p>
      </div>
      {persona.role === "owner" && <Section title="Alerts">No escalations or price-leak alerts.</Section>}
      <Section title="Consultations today and tomorrow">No consultations booked yet.</Section>
      <Section title="Follow-up queue">Nothing waiting.</Section>
      <Section title="Newest calls">No calls yet.</Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold text-stone-800">{title}</h2>
      <p className="text-sm text-stone-500">{children}</p>
    </section>
  );
}
