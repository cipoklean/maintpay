import { Link } from "@tanstack/react-router";
import { emailAndPasswordEnabled } from "@/lib/auth/email-password";
import { emailLoginSearch } from "@/lib/maintpay/job-link";

export function EmailSignInLink({ returnTo }: { returnTo?: string }) {
  if (!emailAndPasswordEnabled) return null;
  return (
    <Link to="/login" search={emailLoginSearch(returnTo)} className="inline-flex min-h-11 items-center justify-center rounded-sm border border-line bg-card px-4 text-base font-medium text-ink">
      Sign in with email
    </Link>
  );
}
