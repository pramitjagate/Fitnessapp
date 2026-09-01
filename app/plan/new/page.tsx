import Link from "next/link";
import { addDays, iso, mondayOf } from "@/lib/dates";
import { requireScope } from "@/lib/session";
import PlanBuilder from "./plan-builder";

export const dynamic = "force-dynamic";

export default async function NewPlanPage() {
  await requireScope();
  const monday = mondayOf(new Date());

  return (
    <>
      <section>
        <div>
          <div className="eyebrow">Programme</div>
          <h1>Add your own plan</h1>
        </div>
        <p className="muted">
          Upload the programme you already follow, or type it in. Either way you get a draft you
          edit before anything is saved — a parser reads a document, it doesn&apos;t understand your
          training.
        </p>
      </section>

      <PlanBuilder mondayIso={iso(monday)} nextMondayIso={iso(addDays(monday, 7))} />

      <section>
        <Link className="tiny" href="/more">
          ← Back to More
        </Link>
      </section>
    </>
  );
}
