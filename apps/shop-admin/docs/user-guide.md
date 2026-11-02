# User guide

## The menu

| Menu | What it is for |
|---|---|
| **Dashboard** | Today, this month, stock, expenses, profit estimate and charts — all calculated live from your data |
| **Inventory** | Products, Add Product, Stock (by location), Stock Transfer, Inventory History, Old Stock |
| **Purchases** | Purchases, Add Purchase, Vendors, Locations |
| **Sales** | POS / New Bill, Sales History, Returns / Cancellations |
| **Barcode** | Barcode Search, Print Labels, Print History |
| **Customers** | Customer list and their purchases |
| **Expenses** | Add Expense, Expense History, Expense Reports |
| **Reports** | Daily/Monthly Sales, Product/Category/Staff Sales, Payments, Inventory, Purchases, Profitability |
| **Administration** | Staff, Roles & Permissions, Categories, Settings, Audit Logs, Data Health, Backup & Restore, Import Products, Export Data |

You only see the items you have permission for.

## A normal day

1. Start the application. Log in.
2. **New stock arrives:** *Inventory → Add Product* (new design) or *Purchases → Add Purchase* (more of an existing design). Then *Barcode → Print Labels* and stick the tags on.
3. **Selling:** *Sales → POS / New Bill*. Scan tags. Choose payment. **Save Sale & Generate Bill**. Print the invoice.
4. **Money spent on the shop:** *Expenses → Add Expense*.
5. **End of day:** *Reports → Daily Sales*. Take a backup (*Backup Now*) and copy `backups/` to a pen drive weekly.

## Staff and permissions

*Administration → Staff → Add staff.*
* **Admin** can do everything. Keep the number of admins small.
* **Staff** can do only what you tick. Use the ready-made buttons (*Cashier*, *Inventory Manager*, *Shop Manager*) as a start, then adjust.
* Sensible defaults for a cashier: View Inventory, Create Sale, View Sales (optional), Generate Bill, Reprint Bill (optional), Print Barcode, View Customers.
* **Discounts:** the *Give Discount* permission, plus a maximum % per person (blank = the shop default of 10%). Change the shop default in *Settings → Billing*.
* **Cost prices are hidden** from staff who have no purchase/inventory-management permission. A cashier never sees what you paid for a piece.
* **Bills:** *Generate Bill* lets someone print **today's** bills; *Reprint Bill* lets them print any old bill.
* Disabling a person signs them out immediately. You cannot disable the last active Admin.
* Changing someone's permissions signs them out once, so the new permissions take effect.

## The Dashboard numbers

* **Net sales** = sales value − discounts (tax not included).
* **Estimated cost of goods** = what you paid for the pieces you sold.
* **Estimated gross profit** = net sales − cost of goods.
* **Estimated net result** = gross profit − operating expenses. *Inventory purchases are not deducted; stock is worth money until it is sold.*
* "Estimated" is on purpose: these help you run the shop; they are not formal accounts.
* Charts have a **Table** switch (top right of each chart) if you prefer numbers.

## Reports

Each report page: choose dates/filters at the top → numbers and tables update → **Export Excel** or **Export PDF**. *Monthly Sales* lets you pick **any** month and year (including future ones). Old Stock offers 30/60/90/180/365 days.

## Audit Logs

*Administration → Audit Logs* records logins, product/price changes, purchases, stock changes, transfers, sales, cancellations, discounts, expenses, staff and permission changes, settings changes, backups and restores — with who and when. It cannot be edited from the software.

## Changing your password

Top right → **Change password**. Admin can reset a staff password from the Staff page.
