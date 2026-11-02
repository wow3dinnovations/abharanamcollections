import { useState } from 'react'
import { MasterPage } from '../../components/MasterPage'
import { PageHeader, Tabs } from '../../components/ui'
import { useAuth } from '../../hooks/useAuth'
import { useLookups, type Category, type ExpenseCategory, type Location, type Subcategory, type Vendor } from '../../hooks/useLookups'

type CatTab = 'categories' | 'subcategories' | 'expense'

export function CategoriesPage() {
  const { can } = useAuth()
  const { categories } = useLookups()
  const [tab, setTab] = useState<CatTab>('categories')
  const canEdit = can('admin.categories')
  return (
    <div>
      <PageHeader title="Categories" subtitle="Product categories, sub-categories and expense categories. Add new ones any time - no changes to the software needed." />
      <Tabs<CatTab> value={tab} onChange={setTab} tabs={[{ id: 'categories', label: 'Product categories' }, { id: 'subcategories', label: 'Sub-categories' }, { id: 'expense', label: 'Expense categories' }]} />
      {tab === 'categories' && (
        <MasterPage<Category & Record<string, unknown>> embedded title="" endpoint="/api/categories" noun="Category" canEdit={canEdit}
          fields={[
            { key: 'name', label: 'Category name', required: true },
            { key: 'code', label: 'Code (for SKU)', required: true, type: 'code', hint: '2-6 letters, e.g. EAR → ABH-EAR-000001' },
            { key: 'description', label: 'Description', type: 'textarea' },
          ]}
          columns={[{ label: 'Name', render: (r) => <b>{r.name}</b> }, { label: 'Code', render: (r) => r.code }, { label: 'Description', render: (r) => r.description }]} />
      )}
      {tab === 'subcategories' && (
        <MasterPage<Subcategory & Record<string, unknown>> embedded title="" endpoint="/api/subcategories" noun="Sub-category" canEdit={canEdit}
          fields={[
            { key: 'category_id', label: 'Category', type: 'select', required: true, options: categories.filter((c) => c.active).map((c) => ({ value: c.id, label: c.name })) },
            { key: 'name', label: 'Sub-category name', required: true },
          ]}
          columns={[{ label: 'Name', render: (r) => <b>{r.name}</b> }, { label: 'Category', render: (r) => categories.find((c) => c.id === r.category_id)?.name ?? '' }]} />
      )}
      {tab === 'expense' && (
        <MasterPage<ExpenseCategory & Record<string, unknown>> embedded title="" endpoint="/api/expense-categories" noun="Expense category" canEdit={canEdit}
          fields={[{ key: 'name', label: 'Expense category', required: true }, { key: 'description', label: 'Description', type: 'textarea' }]}
          columns={[{ label: 'Name', render: (r) => <b>{r.name}</b> }, { label: 'Description', render: (r) => r.description }]} />
      )}
    </div>
  )
}

export function VendorsPage() {
  const { can } = useAuth()
  return (
    <MasterPage<Vendor & Record<string, unknown>> title="Vendors" subtitle="Sellers you buy jewellery from." endpoint="/api/vendors" noun="Vendor" canEdit={can('admin.vendors')}
      fields={[
        { key: 'name', label: 'Vendor name', required: true }, { key: 'contact_person', label: 'Contact person' },
        { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' }, { key: 'city', label: 'City' }, { key: 'state', label: 'State' },
        { key: 'gst_number', label: 'GST number (optional)' }, { key: 'address', label: 'Address', type: 'textarea' }, { key: 'notes', label: 'Notes', type: 'textarea' },
      ]}
      columns={[
        { label: 'Vendor', render: (r) => <div><b>{r.name}</b><div className="text-xs text-ink/50">{r.contact_person}</div></div> },
        { label: 'Phone', render: (r) => r.phone }, { label: 'City', render: (r) => [r.city, r.state].filter(Boolean).join(', ') },
        { label: 'GST', render: (r) => r.gst_number },
      ]} />
  )
}

export function LocationsPage() {
  const { can } = useAuth()
  return (
    <MasterPage<Location & Record<string, unknown>> title="Locations" subtitle="Where stock is bought from or kept - shops, warehouses, markets." endpoint="/api/locations" noun="Location" canEdit={can('admin.locations')}
      fields={[{ key: 'name', label: 'Location name', required: true }, { key: 'address', label: 'Address', type: 'textarea' }, { key: 'notes', label: 'Notes', type: 'textarea' }]}
      columns={[{ label: 'Location', render: (r) => <b>{r.name}</b> }, { label: 'Address', render: (r) => r.address }, { label: 'Notes', render: (r) => r.notes }]} />
  )
}
