import { StatusBadge } from './StatusBadge'

interface OverviewCardProps {
  icon: string
  iconColor: 'purple' | 'blue' | 'orange' | 'green'
  status: string
  label: string
  title: string
  description: string
}

export function OverviewCard({
  icon,
  iconColor,
  status,
  label,
  title,
  description,
}: OverviewCardProps) {
  return (
    <article className="overview-card">
      <div className="overview-top">
        <span className={`overview-icon ${iconColor}`}>{icon}</span>
        <StatusBadge status={status} />
      </div>
      <p className="card-label">{label}</p>
      <h3>{title}</h3>
      <p className="card-description">{description}</p>
    </article>
  )
}
