"use client";
import type { ComponentProps } from "react";

/** A GET form that re-submits as soon as a select or checkbox changes (works without JS via the button). */
export function AutoSubmitForm(props: ComponentProps<"form">) {
  return (
    <form
      {...props}
      onChange={(e) => {
        const t = e.target as HTMLElement;
        if (t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && t.type === "checkbox")) {
          e.currentTarget.requestSubmit();
        }
      }}
    />
  );
}
