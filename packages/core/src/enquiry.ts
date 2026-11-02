import { rupees } from "./format";

export type BagLine = { productId: string; sku: string; name: string; price: number; quantity: number; slug?: string };

export const MAX_QTY = 50;
export const MAX_LINES = 30;

export function addToBag(bag: BagLine[], line: BagLine): BagLine[] {
  const existing = bag.find((l) => l.productId === line.productId);
  if (existing) {
    return bag.map((l) =>
      l.productId === line.productId ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + line.quantity) } : l,
    );
  }
  if (bag.length >= MAX_LINES) return bag;
  return [...bag, { ...line, quantity: Math.max(1, Math.min(MAX_QTY, line.quantity)) }];
}

export function setQuantity(bag: BagLine[], productId: string, quantity: number): BagLine[] {
  if (quantity <= 0) return bag.filter((l) => l.productId !== productId);
  return bag.map((l) => (l.productId === productId ? { ...l, quantity: Math.min(MAX_QTY, Math.floor(quantity)) } : l));
}

export function bagTotal(bag: BagLine[]): { count: number; total: number } {
  return bag.reduce((a, l) => ({ count: a.count + l.quantity, total: a.total + l.price * l.quantity }), {
    count: 0,
    total: 0,
  });
}

/** Text for a WhatsApp message to the shop. */
export function enquiryMessage(opts: {
  lines: Pick<BagLine, "sku" | "name" | "price" | "quantity">[];
  number?: string;
  name?: string;
  city?: string;
  siteUrl?: string;
}): string {
  const head = opts.number ? `Hello! My enquiry ${opts.number}:` : "Hello! I'm interested in:";
  const items = opts.lines.map((l, i) => `${i + 1}. ${l.name} (${l.sku}) x${l.quantity} – ${rupees(l.price * l.quantity)}`);
  const { total } = bagTotal(opts.lines.map((l) => ({ ...l, productId: l.sku })));
  const who = [opts.name, opts.city].filter(Boolean).join(", ");
  return [head, ...items, `Total: ${rupees(total)}`, who ? `– ${who}` : ""].filter(Boolean).join("\n");
}

/** wa.me link. Number must include the country code; anything that isn't a digit is dropped. */
export function whatsappLink(number: string, text: string): string | null {
  const digits = number.replace(/[^0-9]/g, "");
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
