/** Small line icons (inline SVG, so no icon library is needed). */
type IconProps = { size?: number }

const svg = (size: number, children: React.ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

/** Chain link: a new invite link. */
export const LinkIcon = ({ size = 18 }: IconProps) =>
  svg(size, <>
    <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
  </>)

/** Trash can: remove. */
export const TrashIcon = ({ size = 18 }: IconProps) =>
  svg(size, <>
    <path d="M4 7h16" />
    <path d="M10 11v6M14 11v6" />
    <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
    <path d="M9 7V4h6v3" />
  </>)

/** Check mark: a need that is on (read-only views). */
export const CheckIcon = ({ size = 16 }: IconProps) => svg(size, <path d="M5 12l5 5L20 7" />)
