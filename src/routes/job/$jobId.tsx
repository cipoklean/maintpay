import { Link, createFileRoute, useRouterState } from "@tanstack/react-router";
import { FocusedJob } from "@/components/maintpay/handoff";
import { EmailSignInLink } from "@/components/maintpay/email-sign-in-link";
import { NotFoundPage } from "@/components/maintpay/not-found";
import { SignInFailedPanel } from "@/components/maintpay/sign-in-failed";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { isJobId, jobPath } from "@/lib/maintpay/job-link";

export const Route = createFileRoute("/job/$jobId")({
  component: JobPage,
  head: ({ params }) => ({
    meta: [{ title: isJobId(params.jobId) ? "Agreement · MaintPay" : "Page not found" }],
  }),
});

function JobPage() {
  const { jobId } = Route.useParams();
  const failed = useAuthErrorCode();
  const { user, isPending } = useCurrentUserState();
  if (!isJobId(jobId)) return <NotFoundPage />;
  const back = jobPath(jobId);
  if (!isPending && !user && failed) return <SignInFailedPanel code={failed} returnTo={back} />;
  if (isPending) return <Opening />;
  if (!user) return <JobSignIn jobId={jobId} />;
  return (
    <main>
      <FocusedJob jobId={jobId} />
    </main>
  );
}

function useAuthErrorCode() {
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const error = new URLSearchParams(searchStr).get("error");
  return error ? error.replace(/\s+/g, " ").slice(0, 80) : null;
}

function Opening() {
  return (
    <main className="mx-auto flex min-h-screen w-full min-w-0 flex-col justify-center gap-4 px-4 py-12 xl:max-w-xl">
      <p className="text-base font-medium tracking-wide text-sage uppercase">MaintPay</p>
      <h1 className="font-display text-4xl leading-tight text-ink">Opening this agreement.</h1>
    </main>
  );
}

function JobSignIn({ jobId }: { jobId: string }) {
  const back = jobPath(jobId);
  return (
    <main className="mx-auto flex min-h-screen w-full min-w-0 flex-col justify-center gap-6 px-4 py-12 xl:max-w-xl">
      <div>
        <p className="text-base font-medium tracking-wide text-sage uppercase">MaintPay</p>
        <h1 className="mt-3 font-display text-4xl leading-tight break-words text-ink">Sign in to open this agreement.</h1>
        <p className="mt-4 text-base leading-relaxed text-muted">
          Use the email the client named for you. A different account cannot see the agreement. Signing in does not move any money.
        </p>
      </div>
      {authEnabled ? (
        <div className="flex flex-col gap-3">
          <EmailSignInLink returnTo={back} />
          {GROK_PROVIDERS.map((provider) => (
            <button
              key={provider.providerId}
              type="button"
              onClick={() => {
                void signIn(provider.providerId, { callbackURL: back, errorCallbackURL: back }).catch(() => {
                  window.location.assign(`${back}?error=cancelled`);
                });
              }}
              className="inline-flex min-h-11 items-center justify-center rounded-sm bg-sage px-4 text-base font-medium text-paper"
            >
              Sign in with {provider.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-base text-muted">Sign-in is not available in this preview.</p>
      )}
      <Link to="/sample" className="inline-flex min-h-11 items-center text-base font-medium text-sage">
        See a sample job instead
      </Link>
    </main>
  );
}
