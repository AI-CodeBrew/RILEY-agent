import { redirect } from "next/navigation";

// The dashboard is the portal's front door; proxy.ts sends anonymous
// visitors to /login before this ever renders.
export default function Home() {
  redirect("/dashboard");
}
