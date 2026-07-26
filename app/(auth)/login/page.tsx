import { PhoneCall } from "lucide-react";
import { Card } from "@/components/Card";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in · Riley Booking" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <PhoneCall className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Riley Booking</h1>
          <p className="text-sm text-muted">
            Sign in to your sales agent account.
          </p>
        </div>
      </div>

      <Card className="p-5">
        <LoginForm next={next} />
      </Card>

      <p className="text-center text-xs text-muted">
        No account? Your admin creates agent logins from the Sales Agents page.
      </p>
    </div>
  );
}
