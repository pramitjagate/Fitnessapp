import { needsProgrammeSetup } from "@/lib/seed";
import { requireScope } from "@/lib/session";
import { store } from "@/lib/store";
import SetupForm from "./setup-form";

export const dynamic = "force-dynamic";

export default async function PlanSetupPage() {
  const { userId } = await requireScope();
  const db = await store.read(userId);
  const firstRun = needsProgrammeSetup(db);

  return (
    <>
      <section>
        <div>
          <div className="eyebrow">{firstRun ? "Welcome" : "Programme"}</div>
          <h1>{firstRun ? "Set up your training week" : "Change your training week"}</h1>
        </div>
        <p className="muted">
          {firstRun
            ? "Three questions, then you have a week you can train from today. Everything here can be changed later."
            : "Rebuilding the week from a new split replaces the current plan. Your logged history is untouched."}
        </p>
      </section>

      <SetupForm firstRun={firstRun} />
    </>
  );
}
