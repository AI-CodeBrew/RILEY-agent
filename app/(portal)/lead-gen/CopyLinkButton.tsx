"use client";

import { Copy } from "lucide-react";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";

/** Copies an order's public lead-form link (/quote/<id>) as an absolute URL. */
export function CopyLinkButton({ path }: { path: string }) {
  const toast = useToast();

  async function copy() {
    const url = new URL(path, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      toast("Lead form link copied.", "success");
    } catch {
      toast(url, "info");
    }
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={copy}>
      <Copy className="h-3.5 w-3.5" />
      Copy link
    </Button>
  );
}
