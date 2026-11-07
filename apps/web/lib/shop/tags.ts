import { barcodeSvg } from "@abh/core";

export type TagItem = { id: string; sku: string; name: string; price: number; barcode: string | null; copies: number };

/** How a tag is laid out. All sizes in millimetres, measured from the left/top edge of the tag. */
export type TagLayout = {
  /** "jewellery": PID / NAME / Price on the left, barcode right of the fold (the 80 x 12 mm tag with a tail).
   *  "small": price, barcode and number stacked (the 18 x 12 mm tag). */
  style: "jewellery" | "small";
  /** Moves everything right (+) or left (-), and down (+) or up (-), when the printer prints off-centre. */
  offset_x: number;
  offset_y: number;
  /** Text block: where it starts and how wide it is (it stops before the fold). */
  text_x: number;
  text_width: number;
  font_size: number;
  bold: boolean;
  uppercase: boolean;
  /** Barcode block. */
  barcode_x: number;
  barcode_width: number;
  barcode_height: number;
  /** What the barcode holds: the product code (IB850G) or the barcode number (100023). */
  barcode_value: "sku" | "barcode";
  barcode_text: boolean;
  /** Lines and their labels. */
  show_code: boolean;
  show_name: boolean;
  show_price: boolean;
  label_code: string;
  label_name: string;
  label_price: string;
  rupee: boolean;
};

export const DEFAULT_LAYOUT: TagLayout = {
  style: "jewellery",
  offset_x: 0,
  offset_y: 0,
  text_x: 1.5,
  text_width: 21,
  font_size: 2.3,
  bold: true,
  uppercase: true,
  barcode_x: 25.5,
  barcode_width: 21,
  barcode_height: 6,
  barcode_value: "sku",
  barcode_text: false,
  show_code: true,
  show_name: true,
  show_price: true,
  label_code: "PID : ",
  label_name: "NAME : ",
  label_price: "Price ",
  rupee: false,
};

/** Limits for the number fields (min, max). */
export const LAYOUT_LIMITS: Partial<Record<keyof TagLayout, [number, number]>> = {
  offset_x: [-20, 20],
  offset_y: [-10, 10],
  text_x: [0, 120],
  text_width: [3, 120],
  font_size: [1, 8],
  barcode_x: [0, 120],
  barcode_width: [5, 120],
  barcode_height: [2, 60],
};

/** A saved layout, with anything missing or out of range replaced by the default. */
export function readLayout(raw: unknown): TagLayout {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = { ...DEFAULT_LAYOUT } as Record<string, unknown>;
  for (const [k, def] of Object.entries(DEFAULT_LAYOUT)) {
    const v = src[k];
    if (typeof def === "number") {
      const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
      const lim = LAYOUT_LIMITS[k as keyof TagLayout];
      if (Number.isFinite(n) && (!lim || (n >= lim[0] && n <= lim[1]))) out[k] = Math.round(n * 10) / 10;
    } else if (typeof def === "boolean") {
      if (typeof v === "boolean") out[k] = v;
    } else if (typeof v === "string") {
      if (k === "style") out[k] = v === "small" ? "small" : "jewellery";
      else if (k === "barcode_value") out[k] = v === "barcode" ? "barcode" : "sku";
      else out[k] = v.slice(0, 20);
    }
  }
  return out as TagLayout;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const price = (n: number, rupee = true) => (rupee ? "₹" : "") + Math.round(n).toLocaleString("en-IN");
const n2 = (v: number) => v.toFixed(2);

/** What the barcode on this tag holds. */
export function tagCode(t: TagItem, L: TagLayout = DEFAULT_LAYOUT) {
  return L.barcode_value === "barcode" ? t.barcode || t.sku : t.sku;
}

/** One tag as HTML, sized in millimetres so it prints at the real size.
 *  `guides` draws the tag outline and fold line (for the on-screen preview or a test print). */
export function tagHtml(t: TagItem, W: number, H: number, brand: string, L: TagLayout = DEFAULT_LAYOUT, guides = false): string {
  if (L.style === "jewellery") return jewelleryTag(t, W, H, L, guides);
  return smallTag(t, W, H, brand, L);
}

function jewelleryTag(t: TagItem, W: number, H: number, L: TagLayout, guides: boolean): string {
  const code = tagCode(t, L);
  const box = `position:relative;width:${W}mm;height:${H}mm;box-sizing:border-box;overflow:hidden;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;`;
  const lines: string[] = [];
  if (L.show_code) lines.push(L.label_code + t.sku);
  if (L.show_name) lines.push(L.label_name + t.name);
  if (L.show_price) lines.push(L.label_price + price(t.price, L.rupee));
  const text =
    `<div style="position:absolute;left:${n2(L.offset_x + L.text_x)}mm;top:${n2(L.offset_y)}mm;width:${n2(L.text_width)}mm;height:${H}mm;` +
    `display:flex;flex-direction:column;justify-content:center;font-size:${n2(L.font_size)}mm;line-height:1.18;` +
    `font-weight:${L.bold ? 700 : 400};${L.uppercase ? "text-transform:uppercase;" : ""}">` +
    lines.map((s) => `<div style="white-space:nowrap;overflow:hidden">${esc(s)}</div>`).join("") +
    `</div>`;
  const numH = L.barcode_text ? Math.min(L.font_size, 2) : 0;
  const top = L.offset_y + (H - L.barcode_height - numH) / 2;
  const bars =
    `<div style="position:absolute;left:${n2(L.offset_x + L.barcode_x)}mm;top:${n2(top)}mm;width:${n2(L.barcode_width)}mm">` +
    `<div style="height:${n2(L.barcode_height)}mm">${barcodeSvg(code)}</div>` +
    (L.barcode_text ? `<div style="font-size:${n2(numH)}mm;line-height:1;text-align:center;white-space:nowrap">${esc(code)}</div>` : "") +
    `</div>`;
  // Guides are not moved by the offsets: they show where the paper tag is, so you can see what the offsets do.
  const fold = (L.text_x + L.text_width + L.barcode_x) / 2;
  const guide = guides
    ? `<div style="position:absolute;inset:0;border:0.15mm solid #c9a24d;border-radius:0.8mm"></div>` +
      `<div style="position:absolute;left:${n2(fold)}mm;top:0;bottom:0;border-left:0.15mm dashed #c9a24d"></div>`
    : "";
  return `<div class="tag" style="${box}">${guide}${text}${bars}</div>`;
}

/** Small tags (like the 18 x 12 mm jewellery tag): price, barcode and the barcode number.
 *  Bigger sizes get the shop name and product name too. */
function smallTag(t: TagItem, W: number, H: number, brand: string, L: TagLayout): string {
  const code = tagCode(t, L);
  const svg = barcodeSvg(code);
  const shift = `transform:translate(${n2(L.offset_x)}mm,${n2(L.offset_y)}mm);`;
  const box = `width:${W}mm;height:${H}mm;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between;align-items:center;text-align:center;background:#fff;color:#000;overflow:hidden;font-family:Arial,Helvetica,sans-serif;${shift}`;
  if (W < 30 || H < 18) {
    const pad = Math.max(Math.min(W, H) * 0.05, 0.4);
    return (
      `<div class="tag" style="${box}padding:${pad}mm">` +
      `<div style="font-size:${Math.min(H * 0.29, 3.8).toFixed(2)}mm;font-weight:700;line-height:1;white-space:nowrap">${price(t.price)}</div>` +
      `<div style="width:${(W - 2 * pad).toFixed(2)}mm;height:${(H * 0.36).toFixed(2)}mm">${svg}</div>` +
      `<div style="font-size:${Math.min(H * 0.15, 1.9).toFixed(2)}mm;letter-spacing:0.1mm;line-height:1;white-space:nowrap">${esc(code)}</div>` +
      `</div>`
    );
  }
  const s = Math.min(H / 30, W / 50);
  const mm = (v: number) => `${(v * s).toFixed(2)}mm`;
  return (
    `<div class="tag" style="${box}padding:${mm(1.4)}">` +
    `<div style="font-size:${mm(2.3)};font-weight:700;letter-spacing:${mm(0.3)};white-space:nowrap">${esc(brand)}</div>` +
    `<div style="width:100%"><div style="font-size:${mm(2.5)};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.name)}</div>` +
    `<div style="font-size:${mm(4.4)};font-weight:700;line-height:1.1">${price(t.price)}</div></div>` +
    `<div style="width:92%"><div style="height:${mm(7)}">${svg}</div>` +
    `<div style="font-size:${mm(2)};letter-spacing:${mm(0.2)};margin-top:${mm(0.5)};white-space:nowrap">${esc(code)}${code !== t.sku ? ` · ${esc(t.sku)}` : ""}</div></div>` +
    `</div>`
  );
}

/** A full page to print: one page per tag, each page exactly the tag's size. */
export function tagSheetHtml(items: TagItem[], W: number, H: number, brand: string, L: TagLayout = DEFAULT_LAYOUT, guides = false): string {
  const pages = items.flatMap((t) => Array.from({ length: Math.max(0, t.copies) }, () => `<div class="page">${tagHtml(t, W, H, brand, L, guides)}</div>`));
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>Tags</title><style>` +
    `@page{size:${W}mm ${H}mm;margin:0}html,body{margin:0;padding:0;background:#fff}` +
    `*{-webkit-print-color-adjust:exact;print-color-adjust:exact}` +
    `.page{width:${W}mm;height:${H}mm;overflow:hidden;page-break-after:always;break-after:page}.page:last-child{page-break-after:auto;break-after:auto}` +
    `svg{width:100%;height:100%;display:block}</style></head><body>${pages.join("")}</body></html>`
  );
}

/** Print HTML through a hidden frame, so only the tags (or the bill) are printed. */
export function printHtml(html: string) {
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const doc = frame.contentWindow!.document;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
    setTimeout(() => frame.remove(), 60_000);
  }, 250);
}
