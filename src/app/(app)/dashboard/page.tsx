import { headers } from "next/headers";
import { auth } from "@/server/auth";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-muted-foreground">
        Hello, {session?.user.email}. Workspace management lands in the next phase.
      </p>
    </section>
  );
}
