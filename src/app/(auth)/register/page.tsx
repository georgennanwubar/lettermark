import Link from "next/link";
import { RegisterForm } from "./register-form";

export const metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <div>
      <div className="mb-6 space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">Create your account</h2>
        <p className="text-sm text-muted-foreground">Start sending newsletters in minutes</p>
      </div>
      <RegisterForm />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">Log in</Link>
      </p>
    </div>
  );
}
