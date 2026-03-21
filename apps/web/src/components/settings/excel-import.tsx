"use client";

import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface ImportResult {
  imported: number;
  totalRows: number;
  companiesCreated: number;
  errors: string[];
}

export function ExcelImport() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError("");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const token = localStorage.getItem("xperise_token");
      const res = await fetch(`${API_BASE}/import/excel`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error);
      }

      const data: ImportResult = await res.json();
      setResult(data);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Import from Excel
        </CardTitle>
        <CardDescription>
          Upload your &quot;Xperise - BD Tracking.xlsx&quot; file to import contacts and companies.
          Only the &quot;Lead contact&quot; sheet will be parsed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {result && (
          <div className="rounded-md bg-green-500/10 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-green-500">
              <CheckCircle className="h-4 w-4" />
              Import Complete
            </div>
            <div className="text-sm space-y-1">
              <p>Imported: <strong>{result.imported}</strong> contacts from {result.totalRows} rows</p>
              <p>Companies created: <strong>{result.companiesCreated}</strong></p>
              {result.errors.length > 0 && (
                <div className="mt-2">
                  <p className="text-yellow-500 font-medium">Warnings ({result.errors.length}):</p>
                  <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {result.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-sm file:font-medium"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <Button onClick={handleUpload} disabled={!file || uploading}>
            <Upload className="mr-2 h-4 w-4" />
            {uploading ? "Importing..." : "Import"}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Duplicate contacts (same name + company) will be skipped. Admin only.
        </p>
      </CardContent>
    </Card>
  );
}
