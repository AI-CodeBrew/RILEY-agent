import Link from "next/link";
import { Card } from "@/components/Card";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in · Dialcom" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG wordmark, no benefit from next/image's raster pipeline */}
        <img src="/logo-full.svg" alt="Dialcom — connect, solve, grow" className="h-14 w-auto" />
        <p className="text-sm text-muted">
          Sign in to your sales agent account.
        </p>
      </div>

      <Card className="p-5 space-y-4">
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <LoginForm next={next} />
      </Card>

      <p className="text-center text-xs text-muted">
        No account?{" "}
        <Link href="/register" className="text-accent hover:underline">
          Register as a sales agent
        </Link>{" "}
        — an admin approves it before you can sign in.
      </p>
    </div>
  );
}
