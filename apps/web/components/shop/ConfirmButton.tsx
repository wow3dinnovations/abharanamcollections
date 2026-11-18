"use client";

import type { ComponentProps } from "react";
import { Button } from "@/components/admin/ui";

/** A submit button that asks "Are you sure?" first, for deleting. */
export function ConfirmButton({ message, ...props }: ComponentProps<typeof Button> & { message: string }) {
  return (
    <Button
      {...props}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    />
  );
}
