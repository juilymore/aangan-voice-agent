import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · Aangan Leads" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="min-h-screen flex items-center justify-center bg-stone-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-stone-900">Aangan Leads</h1>
        <p className="mb-5 text-sm text-stone-500">Sign in to see enquiries from the phone assistant.</p>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
