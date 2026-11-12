import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { SignInFailedPanel } from "@/components/maintpay/sign-in-failed";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";
import { emailAndPasswordEnabled } from "@/lib/auth/email-password";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const [signUp, setSignUp] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    setPending(true);
    setMessage("");
    try {
      const result = signUp
        ? await authClient.signUp.email({ email, password, name: email.split("@")[0] })
        : await authClient.signIn.email({ email, password });
      if (result.error) setMessage(result.error.message ?? "Sign-in failed. Try again.");
      else window.location.assign("/");
    } catch {
      setMessage("Could not reach sign-in. Try again.");
    } finally {
      setPending(false);
    }
  }
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
          {emailAndPasswordEnabled && (
            <form onSubmit={submit} className="flex flex-col gap-3">
              <label className="text-base text-ink">
                Email
                <input name="email" type="email" required autoComplete="email" className="mt-1 block min-h-11 w-full rounded-sm border border-muted px-3" />
              </label>
              <label className="text-base text-ink">
                Password
                <input name="password" type="password" required minLength={8} autoComplete={signUp ? "new-password" : "current-password"} className="mt-1 block min-h-11 w-full rounded-sm border border-muted px-3" />
              </label>
              {message && <p role="alert" className="text-base text-ink">{message}</p>}
              <button disabled={pending} type="submit" className="min-h-11 rounded-sm bg-sage px-4 text-base font-medium text-paper disabled:opacity-50">
                {pending ? "Please wait…" : signUp ? "Create account" : "Sign in with email"}
              </button>
              <button disabled={pending} type="button" onClick={() => { setSignUp(!signUp); setMessage(""); }} className="min-h-11 text-base text-ink underline">
                {signUp ? "Already have an account? Sign in" : "New here? Create an account"}
              </button>
            </form>
          )}
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
