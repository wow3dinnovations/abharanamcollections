# Barcode labels, printer and scanner

## Your setup (recorded in the software)
| | |
|---|---|
| Printer | **Udyama POS UDY 420B** |
| Connection | **USB** |
| Tag size | **12 mm × 18 mm** (12 tall × 18 wide) — the default label size |
| Scanner | keyboard-style (types the code and presses Enter) |

Printing uses the normal **Windows printer driver** — the same way any program prints. **No printer-specific commands are sent**, because Udyama does not publish the language/specifications for the UDY 420B on their website, and the software never guesses at commands. If you later want one-click "raw" printing, see the last section.

## What is on a 12 × 18 mm tag
```
   ₹799
   ▌▌▐▌▐▐▌▌▐▌▌▐▐▌▌▐▌
   100123
```
A tag this small has room for **price, barcode and its number** only. (Bigger tags — 25×50, 30×50, 40×60 — also show the shop name, tagline, product name and SKU.)

## Why the barcode is a SHORT NUMBER on small tags
A barcode is a row of thin bars. The SKU `ABH-JHM-000123` needs about 167 bars; squeezed into 18 mm each bar would be **0.08 mm — thinner than one printer dot** (even on a 300 dpi printer). It could not be printed or scanned. This was tested with an independent barcode reader.

So, by default, every new product gets a **short numeric barcode** (`100000`, `100001`, …). It needs only 68 bars, so each bar can be 0.19 mm wide — readable.

* The **SKU** is still the product's unique code everywhere (screens, reports, invoices).
* The **POS and Barcode Search find a product by barcode *or* by SKU**, so both work.
* Prefer the SKU as the barcode (only sensible on wide tags)? *Settings → Inventory & Barcode → Barcode on the tag → The SKU itself.*
* Products already made keep the barcode they have. You can change one product's barcode on its Edit page (then re-print its tag).
* Importing from Excel: leave the Barcode column blank to get short numbers automatically.

## Printing
1. *Barcode → Print Labels* (or **Print label** on a product) → add products → set the number of labels (starts at the stock quantity).
2. Check the preview → **Print**.
3. In the browser print window: **printer = UDY 420B**, **Margins = None**, **Scale = 100%**, headers/footers off.
4. In the Windows driver (*Settings → Printers & scanners → UDY 420B → Printing preferences*) set the **paper/label size to 18 × 12 mm** (or 12 × 18 — see below) and the label type to *gap* labels.
5. Every print is stored in *Barcode → Print History* (with **Reprint**).

## FIRST-TIME CALIBRATION (do this once, 5 minutes)
Tiny barcodes depend on your printer's dot size, which I cannot see from here. So the software has a test page:

1. *Barcode → **Printer Test*** → tag size **12mm x 18mm** → **Print 5 test tags** (they show 0.125, 0.15, 0.169, 0.19, 0.21 mm bars).
2. Click the *Scan test* box and **scan each tag**. It says ✓ read correctly or ✕ wrong.
3. Press **Use this width** on the **thinnest width that scans every time** (try each tag 3 times).
4. Done — every label you print now uses that bar width.

If **none** scan: raise the printer's *darkness/density* and lower its *speed* (Windows driver → Printing preferences), check the driver's label size, and try **Print sideways** (turns the tag 90°). Tell me what you see.

**Sideways:** if the printed tag comes out turned or cut, the driver treats your label the other way round. Tick *Print sideways* (Print Labels / Printer Test, or *Settings → Printer*).

**Label sizes** are *height × width* as you wrote them (25×50, 30×50, 40×60, 12×18). Add or change sizes in *Settings → Inventory & Barcode → Label sizes*.

## The barcode scanner
It behaves like a keyboard: it "types" the code and presses Enter.
* **POS:** the big **SCAN BARCODE** box is always ready. Scan → product added, price and stock checked. Scan the same tag again → quantity +1.
* Messages: *Unknown barcode*, *Out of stock*, *only N available here*, *inactive product* — with a beep for errors.
* **Barcode → Barcode Search:** scan a tag to see the product, stock and price.
* If a scan does nothing, click in the box first.

## Later: direct ("raw") printing
Most 4-inch label printers of this kind understand a command language such as **TSPL**, and direct printing would give perfectly crisp bars and one-click printing. But the UDY 420B's language is not published, so it is **not built**. To add it safely I would need one of:
* the printer's **programming manual**, or
* its **self-test printout** (usually: turn it off, hold the FEED button, turn it on, keep holding until it prints) showing "language / firmware", and its **dpi** (203 or 300).
Send me that and I will add direct printing for exactly that model.

## Checking the barcode before a big print
Print 1–2 tags, scan them in *Barcode Search*: it must show the right product. Only then print the whole batch.
