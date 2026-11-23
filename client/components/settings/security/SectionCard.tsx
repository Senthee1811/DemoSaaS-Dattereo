import React from 'react';

/** The shell every Security section uses: icon, title, description, optional action. */
export function SectionCard({
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-line bg-surface p-5 sm:p-6 space-y-4 min-w-0">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="p-2 rounded-field bg-accent-subtle text-accent shrink-0">
            <Icon className="w-4 h-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="font-serif text-lg text-fg leading-tight">{title}</h3>
            <p className="text-xs text-fg-secondary mt-0.5">{description}</p>
          </div>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
