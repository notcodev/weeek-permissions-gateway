import { isGoogleEnabled } from "@/server/auth";
import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  return <SignInForm googleEnabled={isGoogleEnabled} />;
}
