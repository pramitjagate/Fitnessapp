import { needsProfileSetup } from "@/lib/nutrition";
import { requireScope } from "@/lib/session";
import { store } from "@/lib/store";
import ProfileSetupForm from "./profile-setup-form";

export const dynamic = "force-dynamic";

export default async function ProfileSetupPage() {
  const { userId } = await requireScope();
  const profile = await store.readProfile(userId);
  const firstRun = needsProfileSetup(profile);

  return (
    <>
      <section>
        <div>
          <div className="eyebrow">{firstRun ? "Welcome" : "Profile"}</div>
          <h1>{firstRun ? "A few things about you" : "Update your body stats"}</h1>
        </div>
        <p className="muted">
          {firstRun
            ? "Used to estimate your calorie needs on the Nutrition page — nothing else reads them. Skip it and the estimate waits until you fill it in from your profile later."
            : "Used to estimate your calorie needs on the Nutrition page. Everything here can be changed any time from your profile."}
        </p>
      </section>

      <ProfileSetupForm initial={profile} firstRun={firstRun} />
    </>
  );
}
