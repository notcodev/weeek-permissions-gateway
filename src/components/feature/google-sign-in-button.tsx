"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { signIn } from "@/lib/auth-client";

type Props = {
  callbackURL?: string;
  /** Label changes between sign-in and sign-up flows. */
  label?: string;
};

export function GoogleSignInButton({
  callbackURL = "/dashboard",
  label = "Continue with Google",
}: Props) {
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    const { error } = await signIn.social({ provider: "google", callbackURL });
    if (error) {
      // Auth client may navigate before resolving on success; only surface real errors.
      setPending(false);
      toast.error(error.message ?? "Google sign-in failed");
    }
    // No setPending(false) on success — the OAuth redirect navigates away.
  }

  return (
    <Button type="button" variant="outline" disabled={pending} onClick={onClick}>
      <GoogleGlyph />
      {pending ? "Redirecting…" : label}
    </Button>
  );
}

function GoogleGlyph() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width="16"
      height="16"
      className="mr-2"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.15-4.53H2.17v2.85A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.85 14.11A6.6 6.6 0 0 1 5.5 12c0-.74.13-1.46.35-2.11V7.04H2.17A11 11 0 0 0 1 12c0 1.78.43 3.46 1.17 4.96l3.68-2.85Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.42c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.16 14.97 1 12 1 7.7 1 3.99 3.47 2.17 7.04l3.68 2.85C6.71 7.36 9.14 5.42 12 5.42Z"
      />
    </svg>
  );
}
