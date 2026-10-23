// Holdings mark: a ledger of entries. Same shape as public/favicon.svg.
export function BrandMark({ size = 28 }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <rect x="8" y="9" width="16" height="3.5" rx="1.75" fill="var(--bg)" />
      <rect x="8" y="14.25" width="12" height="3.5" rx="1.75" fill="var(--bg)" />
      <rect x="8" y="19.5" width="7" height="3.5" rx="1.75" fill="var(--bg)" />
    </svg>
  )
}
