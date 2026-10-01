import { useId, type ReactNode } from 'react'

export function DashboardSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const titleId = useId()
  return <section className="dashboard-section" aria-labelledby={titleId}>
    <header className="dashboard-section__header"><h2 id={titleId}>{title}</h2>{description && <p>{description}</p>}</header>
    {children}
  </section>
}
