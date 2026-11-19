"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { CameraCapture } from "@/components/shop/CameraCapture";

const btn = "inline-flex cursor-pointer items-center gap-1 rounded border border-cream bg-white px-3 py-1.5 text-sm font-medium hover:bg-stone-100";

/**
 * Two buttons: "Take photo" opens the camera, "Choose photo" picks one from the gallery or the
 * computer's files. On a phone or tablet, Take photo opens the phone's own camera app. On a computer
 * (where browsers ignore the camera hint and would just show the file picker), it opens a live
 * webcam view instead. Shows the picked photo with a Remove link.
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
  const [webcam, setWebcam] = useState(false);
  const closeWebcam = useCallback(() => setWebcam(false), []);

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

  // Phones and tablets (touch screen, no mouse) handle the camera hint on the file input themselves.
  // Computers ignore it, so use the webcam directly when the browser can.
  const takePhoto = (e: MouseEvent) => {
    const touch = window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(any-pointer: fine)").matches;
    if (!touch && typeof navigator.mediaDevices?.getUserMedia === "function") {
      e.preventDefault();
      setWebcam(true);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {preview && (
        <div className="relative h-20 w-20 overflow-hidden rounded border border-cream">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Chosen photo" className="h-full w-full object-cover" />
        </div>
      )}
      <label className={`${btn} ${disabled ? "pointer-events-none opacity-60" : ""}`} onClick={takePhoto}>
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
      {webcam && (
        <CameraCapture
          onClose={closeWebcam}
          onCapture={(file) => {
            setWebcam(false);
            picked(file);
          }}
        />
      )}
    </div>
  );
}
