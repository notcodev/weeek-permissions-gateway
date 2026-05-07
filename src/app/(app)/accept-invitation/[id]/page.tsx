import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { AcceptInvitationForm } from "./accept-form";

export const dynamic = "force-dynamic";

type Params = { id: string };

export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });
  const { id } = await params;
  if (!session) {
    redirect(`/sign-in?redirect=${encodeURIComponent(`/accept-invitation/${id}`)}`);
  }
  return <AcceptInvitationForm invitationId={id} />;
}
