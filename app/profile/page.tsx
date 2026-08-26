import ProfileForm from "./profile-form";
import { requireScope } from "@/lib/session";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const { userId } = await requireScope();
  const [profile, db] = await Promise.all([store.readProfile(userId), store.read(userId)]);
  const logged = db.sessions.length;
  const first = db.sessions[0]?.date;

  return (
    <>
      <section>
        <div>
          <div className="eyebrow">Account</div>
          <h1>Profile</h1>
        </div>
        <p className="muted">
          Who the app thinks you are, and what it knows about how you train.
          {logged > 0 && ` ${logged} sessions logged since ${first}.`}
        </p>
      </section>

      <ProfileForm initial={profile} />

      <section>
        <article className="card">
          <div className="card-head">
            <div>
              <h3>Your programme</h3>
              <p className="tiny">
                Set when you started, and changed by the coach rather than by you — which is
                the point of it. Editing this by hand is on the list; it needs to invalidate
                the plan it contradicts, so it isn&apos;t a text box.
              </p>
            </div>
          </div>
          <div className="lifts">
            <div className="lift">
              <span className="lift-name">Days per week</span>
              <span className="lift-rx">{db.intent.daysPerWeek}</span>
            </div>
            <div className="lift">
              <span className="lift-name">Split</span>
              <span className="lift-rx">{db.intent.split}</span>
            </div>
            <div className="lift">
              <span className="lift-name">Goal</span>
              <span className="lift-rx">{db.intent.goal}</span>
            </div>
            <div className="lift">
              <span className="lift-name">In a deficit</span>
              <span className="lift-rx">{db.intent.inDeficit ? "Yes" : "No"}</span>
            </div>
          </div>
          <p className="tiny">{db.intent.progressionRule}</p>
        </article>
      </section>
    </>
  );
}
