// The sidebar. Each item is only shown when the user has at least one of its permissions.
// Screens are added here as they are built.

export interface NavItem { to: string; label: string; perms?: string[] }
export interface NavGroup { title: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  { title: '', items: [{ to: '/', label: 'Dashboard' }] },
  {
    title: 'Inventory',
    items: [
      { to: '/inventory/products', label: 'Products', perms: ['inventory.view'] },
      { to: '/inventory/add', label: 'Add Product', perms: ['inventory.add_product'] },
      { to: '/inventory/stock', label: 'Stock', perms: ['inventory.view'] },
      { to: '/inventory/transfer', label: 'Stock Transfer', perms: ['inventory.transfer_stock', 'inventory.view'] },
      { to: '/inventory/history', label: 'Inventory History', perms: ['inventory.view'] },
      { to: '/reports/old_stock', label: 'Old Stock', perms: ['reports.old_stock'] },
    ],
  },
  {
    title: 'Purchases',
    items: [
      { to: '/purchases', label: 'Purchases', perms: ['purchases.view'] },
      { to: '/purchases/add', label: 'Add Purchase', perms: ['purchases.add'] },
      { to: '/purchases/vendors', label: 'Vendors', perms: ['admin.vendors', 'purchases.view'] },
      { to: '/purchases/locations', label: 'Locations', perms: ['admin.locations', 'purchases.view'] },
    ],
  },
  {
    title: 'Sales',
    items: [
      { to: '/sales/pos', label: 'POS / New Bill', perms: ['sales.create'] },
      { to: '/sales/history', label: 'Sales History', perms: ['sales.view'] },
      { to: '/sales/cancellations', label: 'Returns / Cancellations', perms: ['sales.view'] },
    ],
  },
  {
    title: 'Barcode',
    items: [
      { to: '/barcode/search', label: 'Barcode Search', perms: ['inventory.view', 'barcode.print', 'barcode.reprint', 'sales.create'] },
      { to: '/barcode/print', label: 'Print Labels', perms: ['barcode.print', 'barcode.reprint'] },
      { to: '/barcode/history', label: 'Print History', perms: ['barcode.print', 'barcode.reprint'] },
      { to: '/barcode/test', label: 'Printer Test', perms: ['barcode.print'] },
    ],
  },
  {
    title: 'Expenses',
    items: [
      { to: '/expenses/add', label: 'Add Expense', perms: ['expenses.add'] },
      { to: '/expenses/history', label: 'Expense History', perms: ['expenses.view'] },
      { to: '/expenses/reports', label: 'Expense Reports', perms: ['reports.expenses'] },
    ],
  },
  {
    title: 'Customers',
    items: [{ to: '/customers', label: 'Customers', perms: ['customers.view', 'customers.manage'] }],
  },
  {
    title: 'Reports',
    items: [
      { to: '/reports/daily_sales', label: 'Daily Sales', perms: ['reports.daily_sales'] },
      { to: '/reports/monthly_sales', label: 'Monthly Sales', perms: ['reports.monthly_sales'] },
      { to: '/reports/product_sales', label: 'Product Sales', perms: ['reports.sales_detail'] },
      { to: '/reports/category_sales', label: 'Category Sales', perms: ['reports.sales_detail'] },
      { to: '/reports/staff_sales', label: 'Staff Sales', perms: ['reports.sales_detail'] },
      { to: '/reports/payment_report', label: 'Payments', perms: ['reports.sales_detail'] },
      { to: '/reports/inventory', label: 'Inventory', perms: ['reports.inventory'] },
      { to: '/reports/purchases', label: 'Purchases', perms: ['reports.purchases'] },
      { to: '/reports/profitability', label: 'Profitability', perms: ['reports.profitability'] },
    ],
  },
  {
    title: 'Administration',
    items: [
      { to: '/admin/staff', label: 'Staff', perms: ['admin.staff'] },
      { to: '/admin/roles', label: 'Roles & Permissions', perms: ['admin.staff'] },
      { to: '/admin/categories', label: 'Categories', perms: ['admin.categories'] },
      { to: '/admin/settings', label: 'Settings', perms: ['admin.settings'] },
      { to: '/admin/website', label: 'Website & App', perms: ['website.publish'] },
      { to: '/admin/audit', label: 'Audit Logs', perms: ['admin.audit_logs'] },
      { to: '/admin/health', label: 'Data Health', perms: ['admin.data_health'] },
      { to: '/admin/backup', label: 'Backup & Restore', perms: ['admin.backup', 'admin.restore'] },
      { to: '/admin/import', label: 'Import Products', perms: ['data.import'] },
      { to: '/admin/export', label: 'Export Data', perms: ['data.export', 'admin.backup'] },
    ],
  },
]
