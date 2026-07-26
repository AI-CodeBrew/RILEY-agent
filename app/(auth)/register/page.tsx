import Link from "next/link";
import { PhoneCall } from "lucide-react";
import { Card } from "@/components/Card";
import { RegisterForm } from "./RegisterForm";

export const metadata = { title: "Request access · Riley Booking" };

export default function RegisterPage() {
  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <PhoneCall className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            Register as a sales agent
          </h1>
          <p className="text-sm text-muted">
            An admin approves your account, then you connect your Calendly and
            get an outbound number.
          </p>
        </div>
      </div>

      <Card className="p-5">
        <RegisterForm />
      </Card>

      <p className="text-center text-xs text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
