"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc-client";

type Props = {
  invitationId: string;
};

export function AcceptInvitationForm({ invitationId }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const acceptMutation = trpc.org.acceptInvite.useMutation({
    onSuccess: () => {
      toast.success("Invitation accepted");
      router.push("/dashboard");
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to accept invitation");
      setPending(false);
    },
  });

  function onAccept() {
    setPending(true);
    acceptMutation.mutate({ invitationId });
  }

  return (
    <main className="mx-auto flex min-h-[50vh] max-w-md items-center px-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Organisation invitation</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-muted-foreground text-sm">
            You&apos;ve been invited to join an organisation. Accepting will add you to its
            members and you&apos;ll be able to switch context to it from the dashboard.
          </p>
          <Button onClick={onAccept} disabled={pending || acceptMutation.isPending}>
            {pending || acceptMutation.isPending ? "Accepting…" : "Accept invitation"}
          </Button>
          <Button variant="ghost" onClick={() => router.push("/dashboard")} disabled={pending}>
            Decide later
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
