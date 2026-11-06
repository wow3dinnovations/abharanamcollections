# Billing (POS)

## Making a bill
1. *Sales → POS / New Bill*. There is no location to choose: a bill sells from all locations together.
2. **Scan** each tag (or search by name). Change quantity with **− / +**. Prices come from the product; they cannot be typed over at the till.
3. **Customer details** (optional): type the customer's **mobile number**.
   * Existing customer → their name, number of bills, total spent, last visit and **past bills** appear. Tap a bill to see its items; *Open invoice* opens the PDF.
   * New number → type the name (email and address are optional). The customer is saved with this bill. The same mobile is never saved twice.
   * Leave it empty for a walk-in customer. *Find by name* searches saved customers who have no mobile.
4. **Discount** (if allowed): choose **Percentage (%)** or **Amount (₹)**, then type the number. The box shows the other figure too (e.g. *= ₹250 off* or *= 9.81% of the bill*).
5. **Payment:** Cash, UPI, Card, Bank Transfer, Other — or tick **Split payment** for several methods.
6. **Save Sale & Generate Bill.** Stock reduces, the sale is saved, an invoice PDF is made, the dashboard updates.

Worked example: ₹799 + ₹998 = ₹1,797 → 10% discount = ₹179.70 → **Final ₹1,617.30**.

## Which location does the stock come from?
Scanning and searching work across every location, and *available stock = the total of all locations*. When you press **Save**, the software decides where each piece comes from:

* Stock in **one** location → taken from there.
* Stock in **several** locations → taken from the location holding the **most** first, then the next, until the quantity is covered. (Equal stock: alphabetical by location name.) Example: Nandyal 5, Warehouse 3, bill for 6 → Nandyal 5 + Warehouse 1.
* Not enough **in total** → the bill is blocked with a clear message, e.g. *"Not enough stock of Gold Jhumka: 8 available in total across all locations, 9 on the bill (stock: Nandyal 5, Warehouse 3)"*. Nothing is changed.
* One bill can take items from different locations. Every location touched gets its **own line in Inventory History** (reference = the bill).
* The bill and the invoice show **no location**. Internally each item remembers where it was taken from (visible as *Stock taken from* in *Sales History → View* and in the Excel sales export).

## Discount rules
* Percentage: 0–100%. Fixed amount: cannot exceed the bill. Never negative totals.
* The discount is shared across the lines in proportion to their value (shown per line).
* **Who may discount:** Admin always. Staff need the *Give Discount* permission **and** *Settings → Billing → Staff may give discounts* switched on, and stay within their limit (per person, or the shop default).
* A product can have **Discount allowed %** and a **Minimum selling price** — the till refuses a discount that goes beyond them.

## Payment methods
*Settings → Billing* — one per line; add UPI apps, EMI, etc. Split payments are stored as separate payment records. Cancelling a sale marks its payments **refunded**.

## Invoice numbers
`INV-000001`, `INV-000002`… Change the prefix in *Settings → Billing*. The starting number can be set only **before the first bill** is made.

## Invoices
* A **PDF invoice** (logo, business address/phone, invoice no., date/time, cashier, customer, items, subtotal, discount, final amount, payment, "Thank you for shopping with us.") opens in a new tab — print it or save it. A copy is kept in `invoices/`.
* *Sales History → Print* reprints any bill (logged in the audit trail).
* Staff with *Generate Bill* can print today's bills; *Reprint Bill* allows older bills.

## GST / tax
**Off — your shop does not charge GST/tax, so bills show no tax line.** The software never assumes a tax treatment. If your accountant confirms it, switch it on in *Settings → Billing*: name, rate %, and whether prices **include** tax or tax is **added on top**. Bills then show the tax line. (GST returns/reports are not included.)

## Cancelling a sale
*Sales → Sales History →* open the bill → **Cancel sale** → a reason is required.
* The bill is **marked cancelled** (never deleted) and its PDF shows a CANCELLED mark.
* Stock is put back **into the same location(s) it was taken from** (even if you have moved stock around since), one stock-history line per location.
* Payments are marked refunded; the audit log records who and why.
* Cancelled sales are not counted in any sales figure or profit.

**Partial returns** (taking back only some items of a bill) are **not available yet**; the screen says so. Cancel the bill and make a new one for the items that stay.
