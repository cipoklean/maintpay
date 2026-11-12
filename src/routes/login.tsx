import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { SignInFailedPanel } from "@/components/maintpay/sign-in-failed";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const error = new URLSearchParams(searchStr).get("error");
  if (error) return <SignInFailedPanel code={error} />;
  return (
    <main className="mx-auto flex min-h-screen w-full min-w-0 flex-col justify-center gap-6 px-4 py-10 xl:max-w-xl">
      <div>
        <p className="text-base font-medium tracking-wide text-muted uppercase">MaintPay</p>
        <h1 className="mt-2 font-display text-4xl leading-tight break-words text-ink">Sign in to take your part.</h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          The person who pays, the contributor, and the approver are three different accounts.
        </p>
      </div>
      {authEnabled ? (
        <div className="flex flex-col gap-3">
          {GROK_PROVIDERS.map((provider) => (
            <button
              key={provider.providerId}
              type="button"
              onClick={() => {
                void signIn(provider.providerId, { callbackURL: "/", errorCallbackURL: "/sign-in-failed" }).catch(() => {
                  window.location.assign("/sign-in-failed");
                });
              }}
              className="inline-flex min-h-11 items-center justify-center rounded-sm bg-sage px-4 text-base font-medium text-paper"
            >
              Continue with {provider.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-base text-muted">Sign-in is not available in this preview.</p>
      )}
    </main>
  );
}
