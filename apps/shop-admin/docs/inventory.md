# Inventory guide

## Adding a product
*Inventory → Add Product.* Enter name, category, selling price. If you also enter **Quantity + Location (+ purchase rate, vendor)**, the software:
1. creates the product,
2. records a **Purchase** (so purchase reports are right),
3. adds the stock and writes a stock-history line.

Categories, sub-categories, vendors and locations are lists **you** control (no code changes ever needed).

## SKU (product code) and barcode
* Leave SKU blank → it is created for you: `ABH-<category code>-<6 digits>`, e.g. `ABH-JHM-000123`. The prefix `ABH` is in *Settings*.
* You may type your own SKU. It must be **unique**; letters, digits, `.`, `_`, `-`; no spaces.
* The **barcode** on the tag is a **short number** by default (e.g. `100123`) so it fits small tags; you may type your own, or switch to "the SKU itself" in Settings. The POS finds a product by barcode or SKU. No barcode may equal another product's SKU or barcode.
* Changing a SKU later means the printed labels are out of date — re-print them.

## Stock is kept per location
A product can be in several places: e.g. Nandyal = 3, Warehouse = 2. **A bill is not tied to a location:** the POS sells from *all* locations and takes the pieces from the location with the most stock first (see `billing.md`). Cancelling a bill puts each piece back where it came from. Use *Inventory → Stock* to see stock by location.

## Changing the stock of an existing product
Open **Inventory → Stock** (one row per product per location) or a product's page. Two buttons need the **Adjust Stock** permission:

**Add stock** — *increase by a number*
* Choose the location and **how many pieces to add** (a whole number, 1 or more).
* **New stock bought** (a *Purchase*): optionally enter the **purchase rate** and **vendor**. A blank rate keeps the current cost. It is saved as a **Purchase** too, so purchase reports and average cost stay right, and shown in *Purchases* with an **Add Stock** tag.
* **Other** (found in the cabinet, returned, a gift…): a plain increase, **not** a purchase and no cost change. Remarks are required.

**Adjust stock** — *set the correct quantity* (e.g. after a physical count)
* Choose the location and type **the quantity you counted** — the software works out the difference.
* Give a **reason**: *Counting correction*, *Damaged*, *Lost* or *Other* (Other needs remarks). Damaged/Lost can only lower the quantity.
* Saved as a **Stock adjustment** in the history with previous stock, new stock, who and when.

For both:
* Negative quantities are **blocked**; you must press **Review** and then **Confirm & save** — nothing is saved until you confirm.
* Every change is written to **Inventory History** (previous → new stock) and to the **Audit Log**.
* Staff without the *Adjust Stock* permission do not see the buttons (and the server refuses the request anyway). Staff who may not see costs are not shown the rate and vendor fields.
* You can still record bigger deliveries with several products in **Purchases → Add Purchase**, and move stock between places with **Stock Transfer**.

## Cost price
Each product keeps a **weighted-average purchase cost**. Buy 5 at ₹300 then 10 at ₹330 → average ₹320. When you sell, the cost *at that moment* is saved on the bill line, so later purchases never change past profit.

## Product age and Old Stock
Age is **calculated every day** from the date added (never stored): 0–30, 31–60, 61–90, 91–180, 181–365, 365+ days. *Inventory → Old Stock* (or *Reports → Old Stock*) lists pieces older than 30/60/90/180/365 days with their stock value — good for planning offers.

## Low stock / out of stock
*Settings → Inventory & Barcode* sets the low-stock number (default 3) and the old-stock age (default 90 days). The dashboard and product list highlight them.

## Deleting a product
Only when its stock is zero (use *Adjust stock → Damaged/Lost/Other* first). It disappears from lists but its history is kept and its SKU stays reserved.

## Pictures
JPG/PNG/WEBP up to 6 MB, resized and stored in `uploads/products/`.

## Importing many products
*Administration → Import Products* (see the README). Category, vendor and location names must already exist.
