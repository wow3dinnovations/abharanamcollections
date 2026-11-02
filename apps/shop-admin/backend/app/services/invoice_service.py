"""PDF invoices (reportlab)."""
from __future__ import annotations

import logging
import os
from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.core.context import AppContext
from app.services import settings_service
from app.utils.money import format_inr

log = logging.getLogger("abharanam.invoice")

MAROON = colors.HexColor("#5a1024")
GOLD = colors.HexColor("#b98f36")
GOLD_LIGHT = colors.HexColor("#f5ecc9")
CREAM = colors.HexColor("#fbf6ec")

_FONTS: dict | None = None


def fonts() -> dict:
    """Arial (has the ₹ sign) and Georgia if Windows provides them; otherwise built-in fonts and 'Rs.'."""
    global _FONTS
    if _FONTS is not None:
        return _FONTS
    windir = Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts"
    result = {"regular": "Helvetica", "bold": "Helvetica-Bold", "serif": "Times-Bold", "serif_italic": "Times-Italic",
              "symbol": "Rs. "}
    try:
        if (windir / "arial.ttf").exists() and (windir / "arialbd.ttf").exists():
            pdfmetrics.registerFont(TTFont("ABH-Sans", str(windir / "arial.ttf")))
            pdfmetrics.registerFont(TTFont("ABH-Sans-Bold", str(windir / "arialbd.ttf")))
            pdfmetrics.registerFontFamily("ABH-Sans", normal="ABH-Sans", bold="ABH-Sans-Bold",
                                          italic="ABH-Sans", boldItalic="ABH-Sans-Bold")
            result.update(regular="ABH-Sans", bold="ABH-Sans-Bold", symbol="\u20b9")
        if (windir / "georgiab.ttf").exists() and (windir / "georgiai.ttf").exists():
            pdfmetrics.registerFont(TTFont("ABH-Serif-Bold", str(windir / "georgiab.ttf")))
            pdfmetrics.registerFont(TTFont("ABH-Serif-Italic", str(windir / "georgiai.ttf")))
            result.update(serif="ABH-Serif-Bold", serif_italic="ABH-Serif-Italic")
    except Exception:  # pragma: no cover
        log.exception("could not load fonts, using built-in fonts")
    _FONTS = result
    return result


def invoice_path(ctx: AppContext, sale: dict) -> Path:
    return ctx.settings.invoices_dir / f"{sale['invoice_number']}.pdf"


def _fmt_dt(iso: str) -> str:
    try:
        return datetime.fromisoformat(iso).strftime("%d/%m/%Y  %I:%M %p")
    except ValueError:
        return iso


def build_pdf(ctx: AppContext, sale: dict) -> Path:
    cfg = settings_service.get(ctx)
    biz = cfg["business"]
    F = fonts()
    sym = F["symbol"]
    money = lambda v: format_inr(v, sym)  # noqa: E731

    def st(name, **kw):
        base = dict(fontName=F["regular"], fontSize=9, leading=12, textColor=colors.HexColor("#2b1a1f"))
        base.update(kw)
        return ParagraphStyle(name, **base)

    normal, small = st("n"), st("s", fontSize=8, textColor=colors.HexColor("#5b4a4f"))
    right, bold = st("r", alignment=TA_RIGHT), st("b", fontName=F["bold"])
    brand = st("brand", fontName=F["serif"], fontSize=20, leading=24, textColor=MAROON)
    tag = st("tag", fontName=F["serif_italic"], fontSize=10, leading=13, textColor=GOLD)
    center = st("c", alignment=TA_CENTER, fontSize=9)

    path = invoice_path(ctx, sale)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    doc = SimpleDocTemplate(str(tmp), pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=14 * mm,
                            bottomMargin=16 * mm, title=f"Invoice {sale['invoice_number']}", author=biz["name"])
    story = []

    # ---- header: logo + business details
    left = []
    logo = settings_service.find_logo(ctx)
    if logo is not None and logo.suffix.lower() != ".svg":
        try:
            img = Image(str(logo))
            ratio = img.imageWidth / max(img.imageHeight, 1)
            h = 22 * mm
            img.drawHeight, img.drawWidth = h, min(h * ratio, 60 * mm)
            img.drawHeight = img.drawWidth / ratio
            left.append(img)
        except Exception:
            log.warning("logo could not be drawn on the invoice")
    biz_lines = [Paragraph(biz["name"], brand), Paragraph(biz["tagline"], tag)]
    contact = [x for x in (biz.get("address"), biz.get("phone") and f"Phone: {biz['phone']}", biz.get("email"),
                           biz.get("gstin") and f"GSTIN: {biz['gstin']}") if x]
    for line in contact:
        biz_lines.append(Paragraph(str(line).replace("\n", "<br/>"), small))
    header = Table([[left or "", biz_lines]], colWidths=[62 * mm if left else 1 * mm, None])
    header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    story += [header, Spacer(1, 3 * mm)]
    rule = Table([[""]], colWidths=[178 * mm], rowHeights=[1.2])
    rule.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), GOLD)]))
    story += [rule, Spacer(1, 4 * mm)]

    title = "INVOICE"
    if sale["status"] == "cancelled":
        title = "INVOICE (CANCELLED)"
    story.append(Paragraph(title, st("t", fontName=F["serif"], fontSize=15, leading=18, textColor=MAROON)))
    story.append(Spacer(1, 2 * mm))

    meta = [
        [Paragraph("<b>Invoice No.</b>", normal), Paragraph(sale["invoice_number"], normal),
         Paragraph("<b>Date / Time</b>", normal), Paragraph(_fmt_dt(sale["date_time"]), normal)],
        [Paragraph("<b>Customer</b>", normal), Paragraph(sale["customer_name"] + (f" ({sale['customer_mobile']})" if sale.get("customer_mobile") else ""), normal),
         Paragraph("<b>Cashier</b>", normal), Paragraph(sale.get("cashier_name", ""), normal)],
    ]
    mt = Table(meta, colWidths=[26 * mm, 62 * mm, 26 * mm, 64 * mm])
    mt.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), CREAM), ("BOX", (0, 0), (-1, -1), 0.5, GOLD),
                            ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    story += [mt, Spacer(1, 5 * mm)]

    # ---- items
    rows = [[Paragraph(f"<font color='#f5ecc9'>{h}</font>", st("h", fontName=F["bold"], fontSize=8.5, alignment=a))
             for h, a in (("#", 0), ("Product", 0), ("SKU", 0), ("Qty", TA_RIGHT), ("Rate", TA_RIGHT), ("Discount", TA_RIGHT), ("Amount", TA_RIGHT))]]
    for i, it in enumerate(sale["items"], 1):
        rows.append([Paragraph(str(i), normal), Paragraph(it["name"], normal), Paragraph(it["sku"], small),
                     Paragraph(str(it["quantity"]), right), Paragraph(money(it["unit_price"]), right),
                     Paragraph(money(it["discount_amount"]) if it["discount_amount"] else "-", right),
                     Paragraph(money(it["line_total"]), right)])
    it_table = Table(rows, colWidths=[8 * mm, 60 * mm, 32 * mm, 10 * mm, 22 * mm, 22 * mm, 24 * mm], repeatRows=1)
    it_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), MAROON), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, CREAM]), ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.HexColor("#e6dcc4")),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5), ("BOX", (0, 0), (-1, -1), 0.5, GOLD)]))
    story += [it_table, Spacer(1, 4 * mm)]

    # ---- totals
    disc_label = "Discount"
    if sale.get("discount_type") == "percent":
        disc_label = f"Discount ({sale['discount_value']:g}%)"
    tot_rows = [[Paragraph("Subtotal", normal), Paragraph(money(sale["subtotal"]), right)]]
    if sale["discount_amount"]:
        tot_rows.append([Paragraph(disc_label, normal), Paragraph("- " + money(sale["discount_amount"]), right)])
    if sale.get("tax_amount"):
        tot_rows.append([Paragraph(f"{sale.get('tax_label') or 'Tax'}", normal), Paragraph(money(sale["tax_amount"]), right)])
    tot_rows.append([Paragraph("<b>Final Amount</b>", st("fa", fontName=F["bold"], fontSize=11, leading=14, textColor=MAROON)),
                     Paragraph(money(sale["total"]), st("fv", fontName=F["bold"], fontSize=11, leading=14, alignment=TA_RIGHT, textColor=MAROON))])
    tt = Table(tot_rows, colWidths=[40 * mm, 34 * mm], hAlign="RIGHT")
    tt.setStyle(TableStyle([("LINEABOVE", (0, -1), (-1, -1), 0.8, GOLD), ("BACKGROUND", (0, -1), (-1, -1), GOLD_LIGHT),
                            ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    story += [tt, Spacer(1, 5 * mm)]

    pay_text = ", ".join(f"{p['method']} {money(p['amount'])}" + (f" (Ref: {p['reference']})" if p.get("reference") else "")
                         for p in sale["payments"]) or "-"
    story.append(Paragraph(f"<b>Payment:</b> {pay_text}", normal))
    if sale["status"] == "cancelled":
        story.append(Spacer(1, 2 * mm))
        story.append(Paragraph(f"<font color='#b91c1c'><b>This invoice was cancelled on {_fmt_dt(sale.get('cancelled_at', ''))}.</b> "
                               f"Reason: {sale.get('cancel_reason', '')}</font>", normal))
    story += [Spacer(1, 12 * mm), Paragraph(cfg["billing"].get("invoice_footer") or "Thank you for shopping with us.",
                                            st("f", fontName=F["serif"], fontSize=13, leading=20, alignment=TA_CENTER, textColor=MAROON)),
              Paragraph(biz["tagline"], st("f2", fontName=F["serif_italic"], fontSize=10, leading=14, alignment=TA_CENTER, textColor=GOLD))]

    def page_marks(canvas, _doc):
        canvas.saveState()
        canvas.setStrokeColor(GOLD)
        canvas.setLineWidth(0.6)
        canvas.rect(8 * mm, 8 * mm, A4[0] - 16 * mm, A4[1] - 16 * mm)
        if sale["status"] == "cancelled":
            canvas.setFont(F["bold"], 70)
            canvas.setFillColor(colors.Color(0.72, 0.1, 0.1, alpha=0.18))
            canvas.translate(A4[0] / 2, A4[1] / 2)
            canvas.rotate(35)
            canvas.drawCentredString(0, 0, "CANCELLED")
        canvas.restoreState()

    doc.build(story, onFirstPage=page_marks, onLaterPages=page_marks)
    os.replace(tmp, path)
    return path
