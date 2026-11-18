"use client";

import { useEffect, useRef, useState } from "react";

const btn = "inline-flex cursor-pointer items-center gap-1 rounded border border-cream bg-white px-3 py-1.5 text-sm font-medium hover:bg-stone-100";

/**
 * Two buttons: "Take photo" opens the camera (on a phone or tablet), "Choose photo" picks one from the
 * gallery or the computer's files. Shows the picked photo with a Remove link.
 * Set resetKey to a new value to clear it (e.g. after a product is saved).
 */
export function PhotoPicker({
  onPick,
  disabled,
  resetKey,
  showPreview = true,
}: {
  onPick: (file: File | null) => void;
  disabled?: boolean;
  resetKey?: unknown;
  showPreview?: boolean;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const clearInputs = () => {
    if (camera.current) camera.current.value = "";
    if (gallery.current) gallery.current.value = "";
  };

  useEffect(() => {
    setPreview(null);
    clearInputs();
  }, [resetKey]);

  // Free the preview image when it changes or the form closes.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const picked = (file: File | null | undefined) => {
    onPick(file ?? null);
    setPreview(file && showPreview ? URL.createObjectURL(file) : null);
    clearInputs();
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {preview && (
        <div className="relative h-20 w-20 overflow-hidden rounded border border-cream">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Chosen photo" className="h-full w-full object-cover" />
        </div>
      )}
      <label className={`${btn} ${disabled ? "pointer-events-none opacity-60" : ""}`}>
        📷 Take photo
        <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" disabled={disabled} onChange={(e) => picked(e.target.files?.[0])} />
      </label>
      <label className={`${btn} ${disabled ? "pointer-events-none opacity-60" : ""}`}>
        🖼️ Choose photo
        <input ref={gallery} type="file" accept="image/*" className="hidden" disabled={disabled} onChange={(e) => picked(e.target.files?.[0])} />
      </label>
      {preview && (
        <button type="button" className="text-sm text-red-700 underline" onClick={() => picked(null)}>
          Remove
        </button>
      )}
    </div>
  );
}
