// codeLinc App Kit components used by this app, ported to typed React.
// Styles live in kit.css; colors, type and spacing in tokens.css.
import { useId, type ReactNode } from 'react'

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ')

/* ---------- Icon: a small original line set (stand-ins for SF Symbols) ---------- */
// Each part: [shape, ...geometry, fillable]
type Part = ['p', string, 0 | 1] | ['c', number, number, number, 0 | 1] | ['r', number, number, number, number, number, 0 | 1]
const ICONS = {
  house: [['p', 'M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z', 1]],
  heart: [['p', 'M12 20.5S3 15 3 9.2A4.7 4.7 0 0 1 12 7a4.7 4.7 0 0 1 9 2.2C21 15 12 20.5 12 20.5z', 1]],
  person: [['c', 12, 8, 4, 1], ['p', 'M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z', 1]],
  'chevron-right': [['p', 'M9.5 5.5 16 12l-6.5 6.5', 0]],
  'chevron-left': [['p', 'M14.5 5.5 8 12l6.5 6.5', 0]],
  check: [['p', 'M5 12.5l4.5 4.5L19 7.5', 0]],
  'arrow-up': [['p', 'M12 19.5V5M6 11l6-6 6 6', 0]],
  calendar: [['r', 3.5, 5, 17, 15.5, 3, 1], ['p', 'M3.5 10h17M8 3v4M16 3v4', 0]],
  xmark: [['p', 'M6.5 6.5l11 11M17.5 6.5l-11 11', 0]],
  info: [['c', 12, 12, 9, 1], ['p', 'M12 11v6M12 7.6v.1', 0]],
  exclamation: [['c', 12, 12, 9, 1], ['p', 'M12 7v6M12 16.4v.1', 0]],
  gift: [['r', 4, 9, 16, 12, 2, 1], ['p', 'M3 9h18M12 9v12M12 9c-1.5-4-6-4-6-1.5S12 9 12 9zm0 0c1.5-4 6-4 6-1.5S12 9 12 9z', 0]],
  share: [['p', 'M12 3.5v11M8 7.5l4-4 4 4', 0], ['p', 'M8.5 10.5H6.5a1.5 1.5 0 0 0-1.5 1.5v7a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5h-2', 0]],
  people: [['c', 9, 8, 3.5, 1], ['p', 'M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6z', 1], ['p', 'M15.5 4.8a3.5 3.5 0 0 1 0 6.4M18 14.4c2 .8 3.5 2.8 3.5 5.6', 0]],
  'trend-up': [['p', 'M3.5 17 9.5 11l4 4 7-7.5', 0], ['p', 'M15 7.5h5.5V13', 0]],
  'check-circle': [['c', 12, 12, 9, 1], ['p', 'M7.5 12.5l3 3 6-6.5', 0]],
  shield: [['p', 'M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6z', 1], ['p', 'M8.8 12l2.2 2.2 4.2-4.4', 0]],
} satisfies Record<string, Part[]>

export type IconName = keyof typeof ICONS
export type HueName = 'red' | 'orange' | 'yellow' | 'green' | 'mint' | 'teal' | 'cyan' | 'blue' | 'indigo' | 'purple' | 'pink' | 'brown'

export function Icon({ name, size = 22, filled = false, weight = 2, label, className }: {
  name: IconName; size?: number; filled?: boolean; weight?: number; label?: string; className?: string
}) {
  return (
    <svg
      className={cx('ck-icon', className)} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}
    >
      {(ICONS[name] as Part[]).map((d, i) => {
        const fill = filled && d[d.length - 1] ? 'currentColor' : 'none'
        if (d[0] === 'p') return <path key={i} d={d[1]} fill={fill} />
        if (d[0] === 'c') return <circle key={i} cx={d[1]} cy={d[2]} r={d[3]} fill={fill} />
        return <rect key={i} x={d[1]} y={d[2]} width={d[3]} height={d[4]} rx={d[5]} fill={fill} />
      })}
    </svg>
  )
}

/* ---------- Button ---------- */
export function Button({
  children, variant = 'prominent', size = 'medium', icon, destructive, disabled, fullWidth, type = 'button', onClick, className, ...aria
}: {
  children?: ReactNode
  variant?: 'prominent' | 'bordered' | 'plain' | 'glass'
  size?: 'large' | 'medium' | 'small'
  icon?: IconName
  destructive?: boolean
  disabled?: boolean
  fullWidth?: boolean
  type?: 'button' | 'submit'
  onClick?: () => void
  className?: string
  'aria-label'?: string
}) {
  return (
    <button
      type={type}
      className={cx('ck-btn', `ck-btn--${variant}`, `ck-btn--${size}`, destructive && 'ck-btn--destructive', fullWidth && 'ck-btn--full', className)}
      disabled={disabled} onClick={onClick} aria-label={aria['aria-label']}
    >
      {icon && <Icon name={icon} size={size === 'small' ? 17 : 20} />}
      {children != null && <span>{children}</span>}
    </button>
  )
}

/* ---------- TextField ---------- */
export function TextField({ label, value, onChange, placeholder, inputMode, helper, error, autoFocus }: {
  label?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  inputMode?: 'text' | 'numeric' | 'decimal'
  helper?: string
  error?: string
  autoFocus?: boolean
}) {
  const id = useId()
  return (
    <div className={cx('ck-field', error && 'is-error')}>
      {label && <label className="ck-field__label" htmlFor={id}>{label}</label>}
      <div className="ck-field__box">
        <input
          id={id} className="ck-field__input" value={value} placeholder={placeholder} inputMode={inputMode} autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined} aria-describedby={error || helper ? `${id}-msg` : undefined}
        />
      </div>
      {error
        ? <p className="ck-field__msg ck-field__msg--error" id={`${id}-msg`}><Icon name="exclamation" size={15} />{error}</p>
        : helper && <p className="ck-field__msg" id={`${id}-msg`}>{helper}</p>}
    </div>
  )
}

/* ---------- List ---------- */
export function ListSection({ header, footer, children, className }: { header?: ReactNode; footer?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('ck-list', className)}>
      {header && <h3 className="ck-list__header">{header}</h3>}
      <div className="ck-list__body" role="list">{children}</div>
      {footer && <p className="ck-list__footer">{footer}</p>}
    </section>
  )
}

export function ListRow({ title, subtitle, value, icon, iconColor = 'blue', accessory, checked, onClick }: {
  title: ReactNode
  subtitle?: ReactNode
  value?: ReactNode
  icon?: IconName
  iconColor?: HueName
  accessory?: 'chevron' | 'check' | 'none'
  checked?: boolean
  onClick?: () => void
}) {
  const acc = accessory ?? (onClick ? 'chevron' : 'none')
  const content = (
    <>
      {icon && (
        <span className="ck-row__tile" style={{ background: `var(--hue-${iconColor})`, color: iconColor === 'yellow' ? '#000' : '#fff' }}>
          <Icon name={icon} size={18} weight={2.2} />
        </span>
      )}
      <span className="ck-row__text">
        <span className="ck-row__title">{title}</span>
        {subtitle && <span className="ck-row__subtitle">{subtitle}</span>}
      </span>
      <span className="ck-row__trail">
        {value != null && <span className="ck-row__value">{value}</span>}
        {acc === 'chevron' && <Icon name="chevron-right" size={16} weight={2.4} className="ck-row__chev" />}
        {acc === 'check' && checked && <Icon name="check" size={20} weight={2.4} className="ck-row__check" />}
      </span>
    </>
  )
  if (onClick) {
    return (
      <button type="button" className="ck-row ck-row--tap" role="listitem" onClick={onClick} aria-current={acc === 'check' && checked ? 'true' : undefined}>
        {content}
      </button>
    )
  }
  return <div className="ck-row" role="listitem">{content}</div>
}

/* ---------- Sheet ---------- */
export function Sheet({ title, children, onClose, action, detent }: {
  title: string
  children?: ReactNode
  onClose: () => void
  action?: { label: string; icon?: IconName; onClick: () => void }
  detent?: 'medium' | 'large'
}) {
  return (
    <div className="ck-overlay">
      <div className="ck-scrim" onClick={onClose} />
      <div className={cx('ck-sheet', detent === 'large' && 'ck-sheet--large')} role="dialog" aria-modal="true" aria-label={title}>
        <span className="ck-sheet__grabber" aria-hidden="true" />
        <div className="ck-sheet__head">
          <button type="button" className="ck-nav__glass" aria-label="Close" onClick={onClose}><Icon name="xmark" size={18} weight={2.4} /></button>
          <h2 className="ck-sheet__title">{title}</h2>
          {action
            ? <button type="button" className="ck-nav__glass is-prominent" aria-label={action.label} onClick={action.onClick}><Icon name={action.icon ?? 'check'} size={18} weight={2.4} /></button>
            : <span className="ck-sheet__spacer" />}
        </div>
        <div className="ck-sheet__body">{children}</div>
      </div>
    </div>
  )
}

/* ---------- Alert ---------- */
export type AlertAction = { label: string; role?: 'cancel' | 'destructive'; onClick: () => void }

export function Alert({ open, title, message, actions }: { open: boolean; title: string; message?: ReactNode; actions: AlertAction[] }) {
  const titleId = useId()
  if (!open) return null
  return (
    <div className="ck-overlay ck-overlay--center">
      <div className="ck-scrim" />
      <div className="ck-alert" role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 className="ck-alert__title" id={titleId}>{title}</h2>
        {message && <p className="ck-alert__msg">{message}</p>}
        <div className={cx('ck-alert__actions', actions.length > 2 && 'is-stacked')}>
          {actions.map((a) => (
            <Button key={a.label} variant={a.role ? 'bordered' : 'prominent'} destructive={a.role === 'destructive'} fullWidth onClick={a.onClick}>
              {a.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ---------- StatCard ---------- */
export function StatCard({ value, label, icon, tone = 'plain', className }: {
  value: ReactNode; label: ReactNode; icon?: IconName; tone?: 'brand' | 'plain'; className?: string
}) {
  const brand = tone === 'brand'
  return (
    <div className={cx('ck-stat', brand && 'ck-stat--brand', className)}>
      {icon && <span className="ck-stat__icon"><Icon name={icon} size={20} /></span>}
      <span className={cx('ck-stat__value', brand ? 'stat-large' : 'stat')}>{value}</span>
      <span className="ck-stat__label">{label}</span>
    </div>
  )
}

/* ---------- Banner ---------- */
const TONE_ICON = { info: 'info', success: 'check-circle', warning: 'exclamation', danger: 'exclamation', secure: 'shield' } as const

export function Banner({ tone = 'info', title, message, action, onDismiss }: {
  tone?: keyof typeof TONE_ICON
  title?: ReactNode
  message?: ReactNode
  action?: { label: string; onClick: () => void }
  onDismiss?: () => void
}) {
  return (
    <div className={cx('ck-banner', `ck-banner--${tone}`)} role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}>
      <span className="ck-banner__icon"><Icon name={TONE_ICON[tone]} size={22} /></span>
      <div className="ck-banner__text">
        {title && <strong className="ck-banner__title">{title}</strong>}
        {message && <span className="ck-banner__msg">{message}</span>}
        {action && <button type="button" className="ck-banner__action" onClick={action.onClick}>{action.label}</button>}
      </div>
      {onDismiss && (
        <button type="button" className="ck-banner__close" aria-label="Dismiss" onClick={onDismiss}><Icon name="xmark" size={16} weight={2.4} /></button>
      )}
    </div>
  )
}

/* ---------- EmptyState ---------- */
export function EmptyState({ icon = 'info', title, message, action }: {
  icon?: IconName; title: ReactNode; message?: ReactNode; action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="ck-empty">
      <span className="ck-empty__icon"><Icon name={icon} size={30} /></span>
      <h3 className="ck-empty__title">{title}</h3>
      {message && <p className="ck-empty__msg">{message}</p>}
      {action && <Button onClick={action.onClick}>{action.label}</Button>}
    </div>
  )
}

/* ---------- PartnerBadge ---------- */
export function PartnerBadge({ name, prefix = 'In partnership with' }: { name: ReactNode; prefix?: ReactNode }) {
  return (
    <span className="ck-partner">
      <span className="ck-partner__dot" aria-hidden="true" />
      <span>{prefix} <strong>{name}</strong></span>
    </span>
  )
}
