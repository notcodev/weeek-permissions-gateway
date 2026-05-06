import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/feature/sign-out-button";
import { auth } from "@/server/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <Link href="/dashboard" className="font-semibold">
          Weeek Permissions Gateway
        </Link>
        <SignOutButton />
      </header>
      <main className="px-6 py-8">{children}</main>
    </div>
  );
}
