import { discountPercent, rupees } from "@abh/core";

export function Price({ price, mrp, size = "md" }: { price: number; mrp?: number | null; size?: "md" | "lg" }) {
  const off = discountPercent(Number(price), mrp == null ? null : Number(mrp));
  return (
    <span className="flex flex-wrap items-baseline gap-x-2">
      <span className={size === "lg" ? "text-2xl font-semibold text-maroon" : "font-semibold text-maroon"}>{rupees(price)}</span>
      {off && (
        <>
          <s className="text-sm text-muted">{rupees(mrp)}</s>
          <span className="text-xs font-semibold text-green-700">{off}% off</span>
        </>
      )}
    </span>
  );
}
