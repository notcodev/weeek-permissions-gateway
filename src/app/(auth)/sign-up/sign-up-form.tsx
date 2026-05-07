"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUp } from "@/lib/auth-client";
import { GoogleSignInButton } from "@/components/feature/google-sign-in-button";

type Props = {
  googleEnabled: boolean;
};

export function SignUpForm({ googleEnabled }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    const name = String(form.get("name") || email.split("@")[0]);

    setPending(true);
    const { error } = await signUp.email({ email, password, name });
    setPending(false);

    if (error) {
      toast.error(error.message ?? "Sign-up failed");
      return;
    }
    toast.success("Account created");
    router.push("/dashboard");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Create account</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {googleEnabled ? (
              <>
                <GoogleSignInButton label="Sign up with Google" />
                <Divider>or</Divider>
              </>
            ) : null}
            <form className="flex flex-col gap-4" onSubmit={onSubmit}>
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" autoComplete="name" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" autoComplete="email" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                />
                <p className="text-muted-foreground text-xs">Minimum 12 characters.</p>
              </div>
              <Button type="submit" disabled={pending}>
                {pending ? "Creating…" : "Create account"}
              </Button>
              <p className="text-muted-foreground text-sm">
                Have an account?{" "}
                <Link href="/sign-in" className="text-foreground underline">
                  Sign in
                </Link>
              </p>
            </form>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function Divider({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="bg-border h-px flex-1" />
      <span className="text-muted-foreground text-xs uppercase tracking-wide">{children}</span>
      <span className="bg-border h-px flex-1" />
    </div>
  );
}
