import { Link } from "@tanstack/react-router";

export function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full min-w-0 flex-col justify-center gap-6 px-4 py-12 xl:max-w-xl">
      <title>Page not found</title>
      <div>
        <p className="text-base font-medium tracking-wide text-sage uppercase">MaintPay</p>
        <h1 className="mt-3 font-display text-4xl leading-tight text-ink">Page not found</h1>
        <p className="mt-4 text-base leading-relaxed text-muted">That address is not part of MaintPay.</p>
      </div>
      <Link to="/" className="inline-flex min-h-11 items-center text-base font-medium text-sage">
        Back to the dashboard
      </Link>
    </main>
  );
}
