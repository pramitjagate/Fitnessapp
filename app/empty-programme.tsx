import Link from "next/link";

/**
 * What every main page shows before there is a programme.
 *
 * One component rather than three empty states, because the two ways in should
 * be presented identically wherever you hit the wall — and because an empty
 * app that only says "nothing here" is how people leave.
 */
export function EmptyProgramme({ heading = "No programme yet" }: { heading?: string }) {
  return (
    <>
      <section>
        <div>
          <div className="eyebrow">Getting started</div>
          <h1>{heading}</h1>
        </div>
        <p className="muted">
          Nothing has been planned for you, and nothing will be until you say what you
          actually train. Two ways in — both take a couple of minutes.
        </p>
      </section>

      <section>
        <Link className="card row-link" href="/plan/setup">
          <div>
            <h3>Answer three questions</h3>
            <p className="tiny">
              Your split, which days you train, what you&apos;re training for. Builds a week
              you can use today, with the loads left for you to find.
            </p>
          </div>
          <span aria-hidden="true" className="row-link-arrow">
            ›
          </span>
        </Link>

        <Link className="card row-link" href="/plan/new">
          <div>
            <h3>Bring your own plan</h3>
            <p className="tiny">
              Upload a PDF or Word file of the programme you already follow, or type it in.
              Your exercises stay exactly as written.
            </p>
          </div>
          <span aria-hidden="true" className="row-link-arrow">
            ›
          </span>
        </Link>
      </section>
    </>
  );
}
