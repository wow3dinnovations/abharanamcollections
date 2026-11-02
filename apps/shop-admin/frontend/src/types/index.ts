export interface User {
  id: string
  username: string
  full_name: string
  email: string
  role: 'admin' | 'staff'
  permissions: string[]
  assigned_permissions: string[]
  active: boolean
  max_discount_percent: number | null
  max_discount_amount: number | null
  must_change_password?: boolean
  created_at?: string
  last_login?: string | null
}

export interface Branding {
  name: string
  tagline: string
  has_logo: boolean
}

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface PermissionGroup {
  group: string
  items: { key: string; label: string }[]
}

export interface Role {
  id: string
  name: string
  description: string
  permissions: string[]
  is_system: boolean
}

export interface BackupFile {
  name: string
  size: number
  records: number | null
  state: string
}
export interface BackupInfo {
  name: string
  created_at: string
  kind: string
  reason: string
  created_by: string
  files: BackupFile[]
  total_size: number
  problems?: string[]
}

export interface DataSummary {
  data_folder: string
  backup_folder: string
  export_folder: string
  counts: Record<string, number | null>
  last_backup: BackupInfo | null
  backup_count: number
  health: 'ok' | 'warning' | 'corrupted'
  corrupted_files: string[]
  recreated_files: string[]
  recovery_notice: string
  files: { file: string; state: string; records: number; revision: number; updated_at: string }[]
}

export interface LabelSize { id: string; name: string; width_mm: number; height_mm: number }

export interface AppSettings {
  business: { name: string; tagline: string; address: string; phone: string; email: string; gstin: string; currency: string; currency_symbol: string; date_format: string }
  inventory: { sku_prefix: string; low_stock_threshold: number; old_stock_days: number; default_location_id: string; barcode_symbology: string; barcode_mode: 'short' | 'sku'; short_barcode_digits: number; barcode_module_mm: number; label_size_id: string; label_sizes: LabelSize[] }
  billing: { invoice_prefix: string; starting_invoice_number: number; payment_methods: string[]; default_payment_method: string; invoice_footer: string; tax_enabled: boolean; tax_label: string; tax_rate: number; tax_mode: 'exclusive' | 'inclusive'; staff_can_discount: boolean; staff_max_discount_percent: number | null; staff_max_discount_amount: number | null }
  expenses: { default_payment_method: string }
  printer: { name: string; model: string; connection: string; label_size_id: string; copies: number; rotate: boolean }
}
