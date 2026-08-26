import { redirect } from "next/navigation";
import LoginForm from "./login-form";
import { getUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ signedOut?: string }>;
}) {
  const user = await getUser();
  if (user) redirect("/");
  const { signedOut } = await searchParams;

  return <LoginForm signedOut={signedOut === "1"} />;
}
