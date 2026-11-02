import type { ReactNode } from 'react'
import { BASE } from './services/api'
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { PageLoader } from './components/ui'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { ToastProvider } from './hooks/useToast'
import { AppLayout } from './layouts/AppLayout'
import { BackupPage } from './pages/admin/BackupPage'
import { WebsitePage } from './pages/admin/WebsitePage'
import { RolesPage } from './pages/admin/RolesPage'
import { SettingsPage } from './pages/admin/SettingsPage'
import { StaffPage } from './pages/admin/StaffPage'
import { CategoriesPage, LocationsPage, VendorsPage } from './pages/admin/MastersPages'
import { ProductDetailPage } from './pages/inventory/ProductDetailPage'
import { ProductFormPage } from './pages/inventory/ProductFormPage'
import { ProductsPage } from './pages/inventory/ProductsPage'
import { InventoryHistoryPage, StockPage, TransferPage } from './pages/inventory/StockPages'
import { PurchaseFormPage, PurchasesPage } from './pages/purchases/PurchasePages'
import { BarcodeSearchPage, PrintHistoryPage, PrintLabelsPage } from './pages/barcode/BarcodePages'
import { PrinterTestPage } from './pages/barcode/PrinterTestPage'
import { CustomersPage } from './pages/sales/CustomersPage'
import { PosPage } from './pages/sales/PosPage'
import { SalesPage } from './pages/sales/SalesPages'
import { AuditLogsPage, DataHealthPage, ExportPage, ImportPage } from './pages/admin/DataPages'
import { ExpenseFormPage, ExpenseHistoryPage } from './pages/expenses/ExpensePages'
import { ReportPage } from './pages/reports/ReportPage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function ReportRoute() {
  const { key } = useParams()
  return <ReportPage key={key} />
}

function Guard({ perms, children }: { perms: string[]; children: ReactNode }) {
  const { can } = useAuth()
  return can(...perms) ? <>{children}</> : <NotFoundPage />
}

export default function App() {
  return (
    <BrowserRouter basename={BASE || undefined}>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
              <Route index element={<DashboardPage />} />
              <Route path="inventory/products" element={<Guard perms={['inventory.view']}><ProductsPage /></Guard>} />
              <Route path="inventory/add" element={<Guard perms={['inventory.add_product']}><ProductFormPage /></Guard>} />
              <Route path="inventory/products/:id" element={<Guard perms={['inventory.view']}><ProductDetailPage /></Guard>} />
              <Route path="inventory/products/:id/edit" element={<Guard perms={['inventory.edit_product']}><ProductFormPage /></Guard>} />
              <Route path="inventory/stock" element={<Guard perms={['inventory.view']}><StockPage /></Guard>} />
              <Route path="inventory/transfer" element={<Guard perms={['inventory.transfer_stock', 'inventory.view']}><TransferPage /></Guard>} />
              <Route path="inventory/history" element={<Guard perms={['inventory.view']}><InventoryHistoryPage /></Guard>} />
              <Route path="purchases" element={<Guard perms={['purchases.view']}><PurchasesPage /></Guard>} />
              <Route path="purchases/add" element={<Guard perms={['purchases.add']}><PurchaseFormPage /></Guard>} />
              <Route path="purchases/:id/edit" element={<Guard perms={['purchases.edit']}><PurchaseFormPage /></Guard>} />
              <Route path="purchases/vendors" element={<Guard perms={['admin.vendors', 'purchases.view']}><VendorsPage /></Guard>} />
              <Route path="purchases/locations" element={<Guard perms={['admin.locations', 'purchases.view']}><LocationsPage /></Guard>} />
              <Route path="admin/categories" element={<Guard perms={['admin.categories']}><CategoriesPage /></Guard>} />
              <Route path="admin/vendors" element={<Guard perms={['admin.vendors']}><VendorsPage /></Guard>} />
              <Route path="admin/locations" element={<Guard perms={['admin.locations']}><LocationsPage /></Guard>} />
              <Route path="barcode/search" element={<Guard perms={['inventory.view', 'barcode.print', 'barcode.reprint', 'sales.create']}><BarcodeSearchPage /></Guard>} />
              <Route path="barcode/print" element={<Guard perms={['barcode.print', 'barcode.reprint']}><PrintLabelsPage /></Guard>} />
              <Route path="barcode/test" element={<Guard perms={['barcode.print']}><PrinterTestPage /></Guard>} />
              <Route path="barcode/history" element={<Guard perms={['barcode.print', 'barcode.reprint']}><PrintHistoryPage /></Guard>} />
              <Route path="sales/pos" element={<Guard perms={['sales.create']}><PosPage /></Guard>} />
              <Route path="sales/history" element={<Guard perms={['sales.view']}><SalesPage /></Guard>} />
              <Route path="sales/cancellations" element={<Guard perms={['sales.view']}><SalesPage cancelledOnly /></Guard>} />
              <Route path="customers" element={<Guard perms={['customers.view', 'customers.manage']}><CustomersPage /></Guard>} />
              <Route path="expenses/add" element={<Guard perms={['expenses.add']}><ExpenseFormPage /></Guard>} />
              <Route path="expenses/:id/edit" element={<Guard perms={['expenses.edit']}><ExpenseFormPage /></Guard>} />
              <Route path="expenses/history" element={<Guard perms={['expenses.view']}><ExpenseHistoryPage /></Guard>} />
              <Route path="expenses/reports" element={<Guard perms={['reports.expenses']}><ReportPage fixedKey="expenses" /></Guard>} />
              <Route path="reports/:key" element={<ReportRoute />} />
              <Route path="admin/audit" element={<Guard perms={['admin.audit_logs']}><AuditLogsPage /></Guard>} />
              <Route path="admin/health" element={<Guard perms={['admin.data_health']}><DataHealthPage /></Guard>} />
              <Route path="admin/import" element={<Guard perms={['data.import']}><ImportPage /></Guard>} />
              <Route path="admin/export" element={<Guard perms={['data.export', 'admin.backup']}><ExportPage /></Guard>} />
              <Route path="admin/staff" element={<Guard perms={['admin.staff']}><StaffPage /></Guard>} />
              <Route path="admin/roles" element={<Guard perms={['admin.staff']}><RolesPage /></Guard>} />
              <Route path="admin/settings" element={<Guard perms={['admin.settings']}><SettingsPage /></Guard>} />
              <Route path="admin/website" element={<Guard perms={['website.publish']}><WebsitePage /></Guard>} />
              <Route path="admin/backup" element={<Guard perms={['admin.backup', 'admin.restore']}><BackupPage /></Guard>} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
