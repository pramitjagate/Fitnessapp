import Link from "next/link";
import { prettyDate } from "@/lib/dates";
import { requireScope } from "@/lib/session";
import { store } from "@/lib/store";
import LogForm from "./log-form";

export const dynamic = "force-dynamic";

export default async function LogPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const { userId } = await requireScope();
  const db = await store.read(userId);
  const session = db.currentPlan.sessions.find((s) => s.date === date);

  if (!session) {
    return (
      <section>
        <h1>No session planned for {prettyDate(date)}</h1>
        <p className="muted">
          That date isn&apos;t in the current week&apos;s plan — probably a rest day.
        </p>
        <Link className="btn btn--ghost" href="/">
          Back to this week
        </Link>
      </section>
    );
  }

  const existing = db.sessions.find((s) => s.date === date) ?? null;

  return (
    <>
      <section>
        <div>
          <div className="eyebrow">
            {session.day} · {prettyDate(session.date)}
          </div>
          <h1>{session.focus}</h1>
        </div>
        {session.coachingNote && <p className="note">{session.coachingNote}</p>}
      </section>

      <LogForm session={session} existing={existing} />
    </>
  );
}
