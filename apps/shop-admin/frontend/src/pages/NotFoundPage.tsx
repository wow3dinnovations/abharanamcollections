import { Link } from 'react-router-dom'
import { EmptyState } from '../components/ui'

export function NotFoundPage() {
  return <EmptyState title="Page not found" hint="That page does not exist or you may not have access to it." action={<Link to="/" className="text-sm font-medium text-maroon-800 underline">Go to Dashboard</Link>} />
}
