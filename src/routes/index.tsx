import { Link, createFileRoute, useRouterState } from "@tanstack/react-router";
import { Handoff } from "@/components/maintpay/handoff";
import { SignInFailedPanel } from "@/components/maintpay/sign-in-failed";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { user, isPending } = useCurrentUserState();
  const failed = useAuthErrorCode();
  if (!isPending && !user && failed) return <SignInFailedPanel code={failed} />;
  if (isPending || !user) return <Welcome showSignIn={!isPending && !user} />;
  return (
    <main>
      <Handoff />
    </main>
  );
}

function useAuthErrorCode() {
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const error = new URLSearchParams(searchStr).get("error");
  return error ? error.replace(/\s+/g, " ").slice(0, 80) : null;
}

function Welcome({ showSignIn }: { showSignIn: boolean }) {
  return (
    <main className="mx-auto flex min-h-screen w-full min-w-0 flex-col justify-center gap-8 px-4 py-12 xl:max-w-xl">
      <div>
        <p className="text-base font-medium tracking-wide text-sage uppercase">MaintPay</p>
        <h1 className="mt-3 font-display text-4xl leading-tight break-words text-ink sm:text-5xl">Pay only after a person reviews the exact change.</h1>
        <p className="mt-4 text-base leading-relaxed text-muted">
          A client agrees the work. A different person accepts that exact commit. MaintPay can then store one payment attempt. It does not send the money, and the client can still take it back.
        </p>
      </div>
      <Link
        to="/sample"
        className="inline-flex min-h-11 items-center justify-center rounded-sm bg-sage px-4 text-base font-medium text-paper"
      >
        See a sample job
      </Link>
      {showSignIn && authEnabled ? (
        <div className="flex flex-col gap-3">
          <p className="text-base text-muted">Already one of the three people on a job?</p>
          {GROK_PROVIDERS.map((provider) => (
            <button
              key={provider.providerId}
              type="button"
              onClick={() => {
                void signIn(provider.providerId, { callbackURL: "/", errorCallbackURL: "/sign-in-failed" }).catch(() => {
                  window.location.assign("/sign-in-failed");
                });
              }}
              className="inline-flex min-h-11 items-center justify-center rounded-sm border border-line bg-card px-4 text-base font-medium text-ink"
            >
              Sign in with {provider.label}
            </button>
          ))}
        </div>
      ) : null}
    </main>
  );
}