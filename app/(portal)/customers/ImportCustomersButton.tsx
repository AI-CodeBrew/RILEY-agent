"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { parseCsv, csvRowsToObjects } from "@/lib/csv";

const TEMPLATE_CSV =
  "name,phone,email,company,province,timezone,kit_count,mailing_address,request_date,date_of_birth,beneficiary_name,call_type,notes\n" +
  "Jane Doe,+923001234567,jane@example.com,,Ontario,Eastern,1,,,,,POS,\n";

type ImportResult = { inserted: number; skipped: { row: number; reason: string }[] };

/**
 * Bulk-adds customers from a CSV export instead of one at a time — same
 * fields and validation as "Add customer", just parsed client-side first so
 * bad rows can be reported without losing the good ones.
 */
export function ImportCustomersButton() {
  const router = useRouter();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  function reset() {
    setFileName(null);
    setRows([]);
    setParseError(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFile(file: File) {
    setResult(null);
    setParseError(null);
    setFileName(file.name);

    file
      .text()
      .then((text) => {
        const parsed = csvRowsToObjects(parseCsv(text));
        if (parsed.length === 0) {
          setParseError("No data rows found — check the file has a header row plus at least one customer.");
          setRows([]);
          return;
        }
        if (!("name" in parsed[0]) || !("phone" in parsed[0])) {
          setParseError('The header row must include "name" and "phone" columns.');
          setRows([]);
          return;
        }
        setRows(parsed);
      })
      .catch(() => setParseError("Could not read that file — make sure it's a plain CSV."));
  }

  async function handleImport() {
    setImporting(true);
    const res = await fetch("/api/customers/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    });
    const body = await res.json().catch(() => ({}));
    setImporting(false);

    if (!res.ok) {
      toast(body.error ?? "Import failed", "error");
      return;
    }

    setResult(body as ImportResult);
    if (body.inserted > 0) {
      toast(`${body.inserted} customer${body.inserted === 1 ? "" : "s"} added.`, "success");
      router.refresh();
    }
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "customers-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <Upload className="h-4 w-4" />
        Import file
      </Button>

      <Modal
        open={open}
        onClose={() => !importing && setOpen(false)}
        title="Import customers"
        description="Upload a CSV with a header row. Only name and phone are required."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={importing}>
              {result ? "Close" : "Cancel"}
            </Button>
            {!result && (
              <Button onClick={handleImport} loading={importing} disabled={rows.length === 0}>
                {!importing && <Upload className="h-4 w-4" />}
                Import {rows.length > 0 ? `${rows.length} customer${rows.length === 1 ? "" : "s"}` : ""}
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-3">
          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
          >
            <Download className="h-3.5 w-3.5" />
            Download CSV template
          </button>

          {!result && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
                className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-background"
              />
              {fileName && !parseError && rows.length > 0 && (
                <p className="mt-2 text-sm text-muted">
                  {fileName}: {rows.length} row{rows.length === 1 ? "" : "s"} ready to import.
                </p>
              )}
              {parseError && <p className="mt-2 text-sm text-red-600">{parseError}</p>}
            </div>
          )}

          {result && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {result.inserted} added, {result.skipped.length} skipped.
              </p>
              {result.skipped.length > 0 && (
                <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border bg-surface-muted p-3 text-xs text-muted">
                  {result.skipped.map((s) => (
                    <li key={s.row}>
                      Row {s.row}: {s.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
