import { Link } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { safeReturnPath } from "@/lib/maintpay/job-link";

export function SignInFailedPanel({ code, returnTo = "/" }: { code?: string | null; returnTo?: string }) {
  const back = safeReturnPath(returnTo);
  const detail = code?.replace(/\s+/g, " ").slice(0, 80);
  return (
    <main className="mx-auto flex min-h-screen w-full min-w-0 flex-col justify-center gap-6 px-4 py-10 xl:max-w-xl">
      <div>
        <p className="text-base font-medium tracking-wide text-sage uppercase">MaintPay</p>
        <h1 className="mt-3 font-display text-4xl leading-tight text-ink">Sign-in didn't finish. Try again.</h1>
        <p className="mt-4 text-base leading-relaxed text-muted">
          Nothing was changed. If the sign-in site showed its own error, you are back on MaintPay now.
        </p>
      </div>
      {authEnabled ? (
        <div className="flex flex-col gap-3">
          {GROK_PROVIDERS.map((provider) => (
            <button
              key={provider.providerId}
              type="button"
              onClick={() => {
                void signIn(provider.providerId, { callbackURL: back, errorCallbackURL: back === "/" ? "/sign-in-failed" : back }).catch(() => {
                  window.location.assign(back === "/" ? "/sign-in-failed" : `${back}?error=cancelled`);
                });
              }}
              className="inline-flex min-h-11 items-center justify-center rounded-sm bg-sage px-4 text-base font-medium text-paper"
            >
              Try again with {provider.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-base text-muted">Sign-in is not available in this preview.</p>
      )}
      <Link to="/sample" className="inline-flex min-h-11 items-center text-base font-medium text-sage">
        See a sample job instead
      </Link>
      {detail ? (
        <details className="rounded-md border border-line bg-card px-4 py-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-base font-medium">Technical detail</summary>
          <p className="pb-2 text-base leading-relaxed text-muted">The sign-in service returned “{detail}”. MaintPay did not finish signing you in.</p>
        </details>
      ) : null}
    </main>
  );
}