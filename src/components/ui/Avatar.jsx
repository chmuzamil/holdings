const tones = ['sky', 'emerald', 'violet', 'amber', 'rose', 'cyan']

function toneFromName(name) {
  const code = String(name || 'A').split('').reduce((sum, c) => sum + c.charCodeAt(0), 0)
  return tones[code % tones.length]
}

export function Avatar({ name, size = 'md', className = '' }) {
  const initials = String(name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || '?'
  const tone = toneFromName(name)

  return (
    <span className={`ui-avatar ui-avatar-${size} ui-avatar-${tone} ${className}`.trim()}>
      {initials}
    </span>
  )
}
