"use client";

import { useState } from "react";
import { importChunk, importDone, productIdsForCodes, type ImportCounts } from "@/app/shop-admin/actions";
import { Button, Card } from "@/components/admin/ui";
import { uploadProductPhoto } from "@/lib/shop/photo";

const KINDS = ["categories", "subcategories", "vendors", "locations", "products"] as const;
type Kind = (typeof KINDS)[number];
const CHUNK = 300;

async function readRecords(file: File): Promise<unknown[]> {
  const data = JSON.parse(await file.text());
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.records)) return data.records;
  throw new Error(`${file.name} is not a shop data file.`);
}

export function Importer() {
  const [files, setFiles] = useState<Partial<Record<Kind, File>>>({});
  const [photos, setPhotos] = useState<File[]>([]);
  const [skipWithPhoto, setSkipWithPhoto] = useState(true);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const say = (line: string) => setLog((l) => [...l, line]);

  const pickData = (list: FileList | null) => {
    const next: Partial<Record<Kind, File>> = {};
    for (const f of Array.from(list ?? [])) {
      const kind = f.name.toLowerCase().replace(/\.json$/, "") as Kind;
      if (KINDS.includes(kind)) next[kind] = f;
    }
    setFiles(next);
  };
  const pickPhotos = (list: FileList | null) =>
    setPhotos(Array.from(list ?? []).filter((f) => /\.(jpe?g|png|webp)$/i.test(f.name)));

  async function run() {
    setBusy(true);
    setLog([]);
    try {
      const data: Partial<Record<Kind, unknown[]>> = {};
      for (const k of KINDS) if (files[k]) data[k] = await readRecords(files[k]!);
      const products = data.products ?? [];
      const total: ImportCounts = { categories: 0, subcategories: 0, vendors: 0, locations: 0, products: 0, skipped: 0, skipped_codes: [] };
      const parts = Math.max(1, Math.ceil(products.length / CHUNK));
      for (let i = 0; i < parts; i++) {
        setProgress(`Saving data, part ${i + 1} of ${parts}…`);
        const payload: Record<string, unknown[]> = { products: products.slice(i * CHUNK, (i + 1) * CHUNK) };
        if (i === 0) for (const k of KINDS.slice(0, 4)) if (data[k]) payload[k] = data[k]!;
        const res = await importChunk(payload);
        if (!res.ok) throw new Error(res.error);
        for (const k of KINDS) total[k] += res.counts[k];
        total.skipped += res.counts.skipped;
        total.skipped_codes.push(...res.counts.skipped_codes);
      }
      if (Object.keys(data).length) {
        say(`Data saved: ${total.products} products, ${total.categories} categories, ${total.subcategories} sub-categories, ${total.vendors} vendors, ${total.locations} locations.`);
        if (total.skipped) say(`${total.skipped} skipped (deleted in the shop${total.skipped_codes.length ? `, or code already used by another product: ${total.skipped_codes.slice(0, 20).join(", ")}` : ""}).`);
      }

      if (photos.length) {
        setProgress("Matching photos…");
        const byCode = new Map<string, File>();
        for (const f of photos) byCode.set(f.name.replace(/\.[^.]+$/, "").toUpperCase(), f);
        const ids = await productIdsForCodes([...byCode.keys()]);
        const todo = [...byCode.entries()].filter(([code]) => ids[code] && !(skipWithPhoto && ids[code].hasPhoto));
        const unknown = [...byCode.keys()].filter((c) => !ids[c]);
        let done = 0, failed = 0;
        const worker = async () => {
          while (todo.length) {
            const [code, file] = todo.shift()!;
            try {
              await uploadProductPhoto(ids[code]!.id, code, file);
            } catch {
              failed++;
            }
            done++;
            setProgress(`Uploading photos: ${done} done…`);
          }
        };
        await Promise.all([worker(), worker(), worker()]);
        say(`Photos uploaded: ${done - failed}${failed ? `, failed: ${failed} (run the import again to retry)` : ""}.`);
        if (unknown.length) say(`${unknown.length} photos have no matching product code: ${unknown.slice(0, 15).join(", ")}${unknown.length > 15 ? "…" : ""}`);
      }
      await importDone();
      say("Finished.");
    } catch (e) {
      say(`Stopped: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setProgress("");
      setBusy(false);
    }
  }

  const chosen = KINDS.filter((k) => files[k]);
  return (
    <div className="space-y-4">
      <Card title="1. Data files">
        <p className="mb-2 text-sm text-muted">
          On the shop computer open <code>C:\1GRAM GOLD\Abharanam\data</code> and choose these files together:
          products.json, categories.json, subcategories.json, vendors.json, locations.json.
        </p>
        <input type="file" multiple accept=".json,application/json" onChange={(e) => pickData(e.target.files)} className="text-sm" disabled={busy} />
        {chosen.length > 0 && <p className="mt-2 text-xs">Found: {chosen.join(", ")}</p>}
        {chosen.includes("products") && (!files.locations || !files.vendors) && (
          <p className="mt-2 text-xs text-amber-800">
            Without {!files.locations ? "locations.json" : ""}{!files.locations && !files.vendors ? " and " : ""}{!files.vendors ? "vendors.json" : ""} the
            names show as LOC-0001, VEN-0001 and so on. You can rename them later in Vendors &amp; settings.
          </p>
        )}
      </Card>
      <Card title="2. Photos (optional)">
        <p className="mb-2 text-sm text-muted">
          Choose the photos in <code>C:\1GRAM GOLD\Abharanam\uploads\products</code> (named like IB21041.jpg). Select all with Ctrl+A.
        </p>
        <input type="file" multiple accept="image/*" onChange={(e) => pickPhotos(e.target.files)} className="text-sm" disabled={busy} />
        {photos.length > 0 && <p className="mt-2 text-xs">{photos.length} photos chosen</p>}
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={skipWithPhoto} onChange={(e) => setSkipWithPhoto(e.target.checked)} /> Skip products that already have a photo
        </label>
      </Card>
      <Button onClick={run} disabled={busy || (!chosen.length && !photos.length)} className="py-2.5">
        {busy ? "Importing…" : "Import"}
      </Button>
      {progress && <p className="text-sm" role="status">{progress}</p>}
      {log.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-cream bg-white p-3 text-sm">
          {log.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      )}
    </div>
  );
}
