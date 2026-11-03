import { barcodeSvg } from "@abh/core";

export type TagItem = { id: string; sku: string; name: string; price: number; barcode: string | null; copies: number };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const price = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

/** One tag as HTML, sized in millimetres so it prints at the real size.
 *  Small tags (like the 18 x 12 mm jewellery tag) show price, barcode and the barcode number. */
export function tagHtml(t: TagItem, W: number, H: number, brand: string): string {
  const code = t.barcode || t.sku;
  const svg = barcodeSvg(code);
  const box = `width:${W}mm;height:${H}mm;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between;align-items:center;text-align:center;background:#fff;color:#000;overflow:hidden;font-family:Arial,Helvetica,sans-serif;`;
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
    `<div style="font-size:${mm(2)};letter-spacing:${mm(0.2)};margin-top:${mm(0.5)};white-space:nowrap">${esc(code)}${t.barcode && t.barcode !== t.sku ? ` · ${esc(t.sku)}` : ""}</div></div>` +
    `</div>`
  );
}

/** A full page to print: one page per tag, each page exactly the tag's size. */
export function tagSheetHtml(items: TagItem[], W: number, H: number, brand: string): string {
  const pages = items.flatMap((t) => Array.from({ length: Math.max(0, t.copies) }, () => `<div class="page">${tagHtml(t, W, H, brand)}</div>`));
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>Tags</title><style>` +
    `@page{size:${W}mm ${H}mm;margin:0}html,body{margin:0;padding:0;background:#fff}` +
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
