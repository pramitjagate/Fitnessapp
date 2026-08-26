import Link from "next/link";
import { requireScope } from "@/lib/session";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

const LINKS = [
  { href: "/upcoming", label: "Upcoming", hint: "The evidence, and next week's plan" },
  { href: "/history", label: "History", hint: "Every logged session" },
  { href: "/music", label: "Music", hint: "Genres, artists, playlist shape" },
  { href: "/profile", label: "Profile", hint: "Your numbers and your programme" },
  { href: "/settings", label: "Settings", hint: "Theme, engine, reset" },
];

export default async function MorePage() {
  const { userId, user } = await requireScope();
  const db = await store.read(userId);

  return (
    <>
      <section>
        <div>
          <div className="eyebrow">{user?.name ?? "Account"}</div>
          <h1>More</h1>
        </div>
        <p className="muted">
          {db.sessions.length} sessions logged · block week {db.currentPlan.blockWeek}.
        </p>
      </section>

      <section>
        {LINKS.map((l) => (
          <Link className="card row-link" href={l.href} key={l.href}>
            <div>
              <h3>{l.label}</h3>
              <p className="tiny">{l.hint}</p>
            </div>
            <span className="row-link-arrow" aria-hidden="true">
              ›
            </span>
          </Link>
        ))}
      </section>
    </>
  );
}
