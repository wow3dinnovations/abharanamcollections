# Expenses

## Purchases vs Expenses — the key idea

| | Inventory **Purchase** | Business **Expense** |
|---|---|---|
| Example | 20 jhumkas from a vendor, ₹6,000 | Shop rent ₹10,000 · bags ₹1,500 · marketing ₹5,000 · printer ₹8,000 |
| Where | *Purchases* | *Expenses* |
| Effect | **Adds stock** | Money spent running the shop |
| In profit | Becomes cost **only when the pieces are sold** | Deducted as **operating expense** |

They are **never mixed**, so your profit figures are honest.

## Adding an expense
*Expenses → Add Expense*: Date · Category · Description · Amount · Vendor/Payee · Payment method · Reference number · Notes · **Receipt/bill** (PDF, JPG, PNG up to 8 MB).
The receipt is stored in `uploads/expenses/` under a safe generated name.

## Categories
Shop Rent, Electricity, Marketing, Transportation, Travel, Packaging, Printing, Furniture, Shop Decoration, Equipment, Computer, Printer, Software, Internet, Phone, Staff, Maintenance, Repair, Bank Charges, Miscellaneous, Other — created on first start. *Administration → Categories → Expense categories* to add, rename or deactivate. Nothing is hard-coded.

## Changing or cancelling
Expense History → **Edit** (each change is audit-logged) or **Cancel** (needs a reason). A cancelled expense stays on record but is **not counted** anywhere. Expenses are never silently deleted.

## Reports
*Expenses → Expense Reports* (and *Reports → …*): total, by **category**, by **vendor/payee**, by **payment method**, by **day/month**, and the full list. Choose any date range, filter by category/payment/payee, **Export Excel/PDF**.

## Profitability (estimated)
*Reports → Profitability*:
```
Net sales (revenue)
− Estimated cost of goods sold (purchase cost of pieces sold)
= Estimated gross profit
− Operating expenses
= Estimated net operating result
```
Everything is labelled **Estimated** — a management view, not formal accounting. Inventory purchases in the period are shown "for information only".
