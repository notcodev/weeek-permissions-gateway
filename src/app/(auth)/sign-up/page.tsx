import { isGoogleEnabled } from "@/server/auth";
import { SignUpForm } from "./sign-up-form";

export const dynamic = "force-dynamic";

export default function SignUpPage() {
  return <SignUpForm googleEnabled={isGoogleEnabled} />;
}
