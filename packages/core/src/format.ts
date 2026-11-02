/** ₹1,299 or ₹1,299.50, Indian digit grouping. */
export function rupees(amount: number | string | null | undefined): string {
  const n = Number(amount ?? 0);
  const whole = Number.isInteger(Math.round(n * 100) / 100) && Math.round(n * 100) % 100 === 0;
  return (
    "₹" +
    n.toLocaleString("en-IN", {
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    })
  );
}

/** Percentage saved against the MRP, or null when there is no real saving. */
export function discountPercent(price: number, mrp: number | null | undefined): number | null {
  if (!mrp || mrp <= price || price < 0) return null;
  const pct = Math.round(((mrp - price) / mrp) * 100);
  return pct >= 1 ? pct : null;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Accepts 10-digit Indian mobiles with or without +91 / spaces. Returns "+91XXXXXXXXXX" or null. */
export function normaliseIndianMobile(input: string): string | null {
  const digits = input.replace(/[^0-9]/g, "");
  const ten = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.length === 11 && digits.startsWith("0") ? digits.slice(1) : digits;
  if (!/^[6-9][0-9]{9}$/.test(ten)) return null;
  return "+91" + ten;
}
