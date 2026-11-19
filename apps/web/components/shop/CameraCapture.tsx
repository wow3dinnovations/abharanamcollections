"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A full-screen live camera view for computers (webcam). Shows the camera, a Capture button that
 * turns the current frame into a JPEG File, and Cancel. Uses the back camera if the device has one.
 */
export function CameraCapture({ onCapture, onClose }: { onCapture: (file: File) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          video.current.play().catch(() => {});
        }
      })
      .catch((err: unknown) => {
        const name = err instanceof DOMException ? err.name : "";
        setError(
          name === "NotAllowedError"
            ? "Camera permission was blocked. Allow the camera for this site in the browser's address bar, then try again."
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "No camera was found on this computer. Plug in a webcam, or use Choose photo."
              : name === "NotReadableError"
                ? "The camera is being used by another app. Close that app and try again."
                : "Could not open the camera. Use Choose photo instead.",
        );
      });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKey);
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, [onClose]);

  const capture = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")?.drawImage(v, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return setError("Could not take the photo. Try again.");
        onCapture(new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92,
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/90 p-4" role="dialog" aria-modal="true" aria-label="Take photo">
      {error ? (
        <p className="max-w-md rounded bg-white p-4 text-center text-sm text-red-700">{error}</p>
      ) : (
        <video
          ref={video}
          playsInline
          muted
          onLoadedMetadata={() => setReady(true)}
          className="max-h-[75vh] max-w-full rounded bg-black"
        />
      )}
      <div className="flex gap-3">
        {!error && (
          <button
            type="button"
            disabled={!ready}
            onClick={capture}
            className="rounded-full bg-white px-6 py-2 text-base font-semibold text-black disabled:opacity-50"
          >
            {ready ? "📸 Capture" : "Starting camera…"}
          </button>
        )}
        <button type="button" onClick={onClose} className="rounded-full border border-white px-6 py-2 text-base text-white">
          Cancel
        </button>
      </div>
    </div>
  );
}
