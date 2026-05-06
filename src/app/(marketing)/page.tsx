import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6">
      <h1 className="text-4xl font-semibold">Weeek Permissions Gateway</h1>
      <p className="text-lg opacity-80">
        Issue scoped Weeek API keys with explicit permissions and audit.
      </p>
      <div className="flex gap-3">
        <Link href="/sign-in" className="underline">Sign in</Link>
        <Link href="/sign-up" className="underline">Sign up</Link>
      </div>
    </main>
  );
}
