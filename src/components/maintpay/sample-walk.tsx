import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { SAMPLE_BANNER, SAMPLE_MODE, sampleChapters, sampleWalk } from "@/lib/maintpay/sample";

export function SampleWalk() {
  const [chapter, setChapter] = useState(0);
  const atEnd = chapter === sampleChapters.length - 1;

  return (
    <div className="mx-auto flex w-full min-w-0 flex-col gap-6 px-4 py-6 xl:max-w-3xl">
      <div className="flex flex-col gap-2">
        <Link to="/" className="inline-flex min-h-11 items-center text-base font-medium text-sage">
          Back to MaintPay
        </Link>
        <Link to="/login" className="inline-flex min-h-11 items-center justify-center rounded-sm border border-line bg-card px-4 text-base font-medium text-ink">
          Sign in with email
        </Link>
      </div>

      <div className="rounded-md border border-sage bg-sage-bg px-4 py-3">
        <p className="text-sm font-semibold tracking-wide text-sage uppercase">{SAMPLE_MODE}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink">{SAMPLE_BANNER}</p>
      </div>

      <header>
        <p className="text-sm font-medium tracking-wide text-muted uppercase">One small maintenance job</p>
        <h1 className="mt-2 font-display text-3xl leading-tight break-words text-ink sm:text-5xl">{sampleWalk.promise}</h1>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="tablist" aria-label="Sample story">
        {sampleChapters.map((name, index) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={chapter === index}
            onClick={() => setChapter(index)}
            className={`inline-flex min-h-11 items-center justify-center rounded-sm px-3 text-center text-base font-medium ${chapter === index ? "bg-ink text-paper" : "border border-line bg-card text-ink"}`}
          >
            {name}
          </button>
        ))}
      </div>

      {chapter === 0 ? <ClientChapter /> : null}
      {chapter === 1 ? <ContributorChapter /> : null}
      {chapter === 2 ? <ApproverChapter /> : null}
      {chapter === 3 ? <DecisionChapter /> : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setChapter((current) => Math.max(0, current - 1))}
          disabled={chapter === 0}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-sm border border-line bg-card px-2 text-center text-base font-medium text-ink disabled:opacity-40"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => setChapter((current) => Math.min(sampleChapters.length - 1, current + 1))}
          disabled={atEnd}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-sm bg-sage px-2 text-center text-base leading-snug font-medium text-paper disabled:opacity-40"
        >
          {atEnd ? "End of the example" : `Next: ${sampleChapters[chapter + 1]}`}
        </button>
      </div>

      <details className="rounded-md border border-line bg-card px-4 py-3">
        <summary className="flex min-h-11 cursor-pointer items-center text-base font-medium">Technical evidence</summary>
        <p className="pb-2 text-sm leading-relaxed text-muted">
          This example has no request, no chain receipt, and no wallet action. The labels above are sample words, not data read from GitHub or the chain.
        </p>
      </details>
    </div>
  );
}

function ClientChapter() {
  const job = sampleWalk.client;
  return (
    <section className="flex flex-col gap-4 rounded-md border border-line bg-card p-5" aria-label="Client">
      <h2 className="font-display text-3xl">The client writes the promise first</h2>
      <p className="rounded-sm bg-warn-bg px-3 py-3 text-sm leading-relaxed text-warn">{job.warning}</p>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <Fact label="Repository" value={job.repository} />
        <Fact label="Amount" value={job.amount} />
        <Fact label="Contributor" value={job.contributor} />
        <Fact label="Approver" value={job.approver} />
        <Fact label="Who would be paid" value={job.recipient} />
        <Fact label="Expires" value={job.expiry} />
      </dl>
      <p className="text-sm leading-relaxed text-ink">
        <span className="font-medium">The work. </span>
        {job.task}
      </p>
      <p className="text-sm leading-relaxed text-ink">
        <span className="font-medium">Done when. </span>
        {job.criteria}
      </p>
    </section>
  );
}

function ContributorChapter() {
  const person = sampleWalk.contributor;
  return (
    <section className="flex flex-col gap-4 rounded-md border border-line bg-card p-5" aria-label="Contributor">
      <h2 className="font-display text-3xl">The contributor sees the risk before starting</h2>
      <p className="rounded-sm bg-warn-bg px-3 py-3 text-sm leading-relaxed text-warn">{person.warning}</p>
      <p className="text-sm leading-relaxed text-muted">
        Only after that warning does this example show them linking a pull request.
      </p>
      <div className="rounded-sm border border-line px-3 py-3">
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">Not verified</p>
        <p className="mt-1 text-sm font-medium text-ink">{person.pullRequest.title}</p>
        <p className="mt-1 text-sm text-muted">{person.pullRequest.detail}</p>
        <p className="mt-2 text-sm text-ink">{person.pullRequest.head}</p>
      </div>
    </section>
  );
}

function ApproverChapter() {
  const job = sampleWalk.client;
  const review = sampleWalk.approver;
  return (
    <section className="flex flex-col gap-4" aria-label="Approver">
      <div className="grid gap-3 sm:grid-cols-2">
        <article className="rounded-md border border-line bg-card p-5">
          <h2 className="font-display text-2xl">What was agreed</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink">{job.task}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">{job.criteria}</p>
        </article>
        <article className="rounded-md border border-sage bg-sage-bg p-5">
          <h2 className="font-display text-2xl">The snapshot in front of them</h2>
          <p className="mt-3 text-sm font-medium text-ink">{sampleWalk.contributor.pullRequest.title}</p>
          <p className="mt-2 text-sm text-ink">{sampleWalk.contributor.pullRequest.head}</p>
          <p className="mt-2 text-sm text-muted">{sampleWalk.contributor.pullRequest.detail}</p>
        </article>
      </div>
      <div className="rounded-md border border-line bg-card p-5">
        <p className="text-sm leading-relaxed text-ink">{review.note}</p>
        <h3 className="mt-4 text-sm font-medium text-ink">An acceptance would bind these together</h3>
        <ul className="mt-2 flex flex-col gap-2 text-sm text-muted">
          {review.binds.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function DecisionChapter() {
  return (
    <section className="flex flex-col gap-4" aria-label="Decision">
      <div className="rounded-md border border-sage bg-sage-bg px-4 py-3 text-sm leading-relaxed text-ink">{SAMPLE_BANNER}</div>
      <div className="flex flex-col gap-3">
        {sampleWalk.held.map((item) => (
          <article key={item.title} className="rounded-md border border-line bg-card p-5">
            <h2 className="font-display text-2xl text-hold">{item.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink">{item.reason}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">Next: {item.next}</p>
          </article>
        ))}
      </div>
      <article className="rounded-md border border-line bg-card p-5">
        <p className="text-xs font-semibold tracking-wide text-sage uppercase">{SAMPLE_MODE}</p>
        <h2 className="mt-2 font-display text-2xl">{sampleWalk.confirmation.title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink">{sampleWalk.confirmation.intro}</p>
        <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-sm leading-relaxed text-muted">
          {sampleWalk.confirmation.needs.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </article>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs tracking-wide text-muted uppercase">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink">{value}</dd>
    </div>
  );
}
