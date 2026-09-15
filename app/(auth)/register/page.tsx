import Link from "next/link";
import { Card } from "@/components/Card";
import { RegisterForm } from "./RegisterForm";
import { GoogleSignInButton } from "../GoogleSignInButton";

export const metadata = { title: "Request access · Dialcom" };

export default function RegisterPage() {
  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG wordmark, no benefit from next/image's raster pipeline */}
        <img src="/logo.svg" alt="Dialcom" className="h-7 w-auto" />
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

      <Card className="p-5 space-y-4">
        <GoogleSignInButton />

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted">or register with email</span>
          <div className="h-px flex-1 bg-border" />
        </div>

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
