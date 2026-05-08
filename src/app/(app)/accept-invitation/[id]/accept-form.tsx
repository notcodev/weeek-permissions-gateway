"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { trpc } from "@/lib/trpc-client";

type Props = {
  invitationId: string;
};

export function AcceptInvitationForm({ invitationId }: Props) {
  const router = useRouter();

  const acceptMutation = trpc.org.acceptInvite.useMutation({
    onSuccess: () => {
      toast.success("Invitation accepted");
      router.push("/dashboard");
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to accept invitation");
    },
  });

  return (
    <main className="mx-auto flex min-h-[50vh] max-w-md items-center px-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Organisation invitation</CardTitle>
          <CardDescription>
            You&apos;ve been invited to join an organisation. Accepting will add you to its
            members and you&apos;ll be able to switch context to it from the dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent />
        <CardFooter className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => router.push("/dashboard")}
            disabled={acceptMutation.isPending}
          >
            Decide later
          </Button>
          <Button
            onClick={() => acceptMutation.mutate({ invitationId })}
            disabled={acceptMutation.isPending}
          >
            {acceptMutation.isPending ? "Accepting…" : "Accept invitation"}
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
