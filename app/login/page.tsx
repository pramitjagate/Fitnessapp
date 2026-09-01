import { redirect } from "next/navigation";
import LoginForm from "./login-form";
import { getUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ signedOut?: string; accountDeleted?: string }>;
}) {
  const user = await getUser();
  if (user) redirect("/");
  const { signedOut, accountDeleted } = await searchParams;

  return <LoginForm signedOut={signedOut === "1"} accountDeleted={accountDeleted === "1"} />;
}
