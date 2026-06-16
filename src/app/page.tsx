/**
 * page.tsx — Root entry. Pure router: send authed users to dashboard,
 * everyone else to login. Marketing copy can go here later.
 */
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/session";

export default async function HomePage() {
  const auth = await getAuth();
  redirect(auth ? "/dashboard" : "/login");
}
