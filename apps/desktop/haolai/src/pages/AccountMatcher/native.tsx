import { useId, useMemo, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

export { Table } from './Table'

type LayoutProps = { children?: ReactNode; className?: string; [key: string]: unknown }

export function useMatcherMessage() {
  const [notice, setNotice] = useState<{ text: string; type: string } | null>(null)
  const api = useMemo(() => {
    const show = (type: string) => (input: string | { content: string }) => {
      setNotice({ text: typeof input === 'string' ? input : input.content, type })
      return Promise.resolve()
    }
    return { error: show('error'), success: show('success'), info: show('info'), warning: show('warning') }
  }, [])
  const holder = notice ? <Alert type={notice.type} message={notice.text} closable afterClose={() => setNotice(null)} /> : null
  return [api, holder] as const
}

export function Row({ children, className = '' }: LayoutProps) {
  return <div className={`matcher-row ${className}`}>{children}</div>
}
export function Col({ children, className = '' }: LayoutProps) {
  return <div className={`min-w-0 ${className}`}>{children}</div>
}
export function Alert({ message, description, type, children, className = '', closable, onClose, afterClose }: LayoutProps & { message?: ReactNode; description?: ReactNode; type?: string; closable?: boolean; onClose?: () => void; afterClose?: () => void }) {
  const [closed, setClosed] = useState(false)
  if (closed) return null
  return <div className={`matcher-notice ${className}`} data-tone={type} role={type === 'error' ? 'alert' : 'status'}>
    <div><strong>{message}</strong>{description && <span>{description}</span>}{children}</div>
    {closable && <button type="button" onClick={() => { onClose?.(); setClosed(true); afterClose?.() }}>收起提示</button>}
  </div>
}
export function Card({ title, extra, children, className = '' }: LayoutProps & { title?: ReactNode; extra?: ReactNode }) {
  return <section className={`work-panel matcher-panel ${className}`}><header className="matcher-panel-heading"><h2>{title}</h2>{extra}</header>{children}</section>
}
export function InputNumber({ value, onChange, min, max, step, precision, placeholder, className = '', disabled, id, 'aria-label': ariaLabel }: LayoutProps & { id?: string; 'aria-label'?: string; value?: number | null; onChange?: (value: number | null) => void; min?: number; max?: number; step?: number; precision?: number; placeholder?: string; disabled?: boolean }) {
  return <input id={id} aria-label={ariaLabel} className={`matcher-number ${className}`} type="number" value={value ?? ''} min={min} max={max} step={step ?? (precision ? 10 ** -precision : 1)} placeholder={placeholder} disabled={disabled} onChange={event => onChange?.(event.target.value === '' ? null : Number(event.target.value))} />
}
type Option = string | { value: string; label: ReactNode }
function optionValue(option: Option) { return typeof option === 'string' ? option : option.value }
function optionLabel(option: Option) { return typeof option === 'string' ? option : option.label }
function CheckboxBase({ children, checked, indeterminate, onChange, disabled }: LayoutProps & { checked?: boolean; indeterminate?: boolean; onChange?: (event: ChangeEvent<HTMLInputElement>) => void; disabled?: boolean }) {
  return (
    <label className="matcher-option">
      <input
        type="checkbox"
        ref={input => { if (input) input.indeterminate = indeterminate ?? false }}
        checked={checked ?? false}
        aria-checked={indeterminate ? 'mixed' : checked ?? false}
        onChange={onChange}
        disabled={disabled}
      />
      {children}
    </label>
  )
}
function CheckboxGroup({ options = [], value = [], onChange, className = '' }: LayoutProps & { options?: Option[]; value?: string[]; onChange?: (value: string[]) => void }) {
  // Match the original group contract: emit only this platform's options.
  const selected = options.map(optionValue).filter(id => value.includes(id))
  return (
    <div className={`matcher-options ${className}`}>
      {options.map(option => {
        const id = optionValue(option)
        return (
          <CheckboxBase
            key={id}
            checked={selected.includes(id)}
            onChange={event => onChange?.(event.target.checked ? [...selected, id] : selected.filter(item => item !== id))}
          >
            {optionLabel(option)}
          </CheckboxBase>
        )
      })}
    </div>
  )
}
export const Checkbox = Object.assign(CheckboxBase, { Group: CheckboxGroup })
function RadioGroup({ options = [], value, onChange, className = '', 'aria-label': ariaLabel }: LayoutProps & { options?: Option[]; value?: string; 'aria-label'?: string; onChange?: (event: { target: { value: string } }) => void }) {
  const name = useId()
  return <div role="radiogroup" aria-label={ariaLabel} className={`matcher-options ${className}`}>{options.map(option => { const id = optionValue(option); return <label className="matcher-option" key={id}><input type="radio" name={name} checked={id === value} onChange={() => onChange?.({ target: { value: id } })} />{optionLabel(option)}</label> })}</div>
}
export const Radio = { Group: RadioGroup }
type CollapseItem = { key: string; label: ReactNode; children: ReactNode }
export function Collapse({ items = [], defaultActiveKey = [], activeKey, onChange, className = '' }: LayoutProps & { items?: CollapseItem[]; defaultActiveKey?: string[]; activeKey?: string[]; onChange?: (keys: string[]) => void }) {
  const [expanded, setExpanded] = useState(defaultActiveKey)
  const keys = activeKey ?? expanded
  return <div className={`matcher-sections ${className}`}>{items.map(item => {
    const open = keys.includes(item.key)
    return <section className="matcher-filter-section" key={item.key}>
      <button type="button" className="matcher-section-toggle" aria-expanded={open} onClick={() => { const next = open ? keys.filter(key => key !== item.key) : [...keys, item.key]; setExpanded(next); onChange?.(next) }}>
        {item.label}<ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && <div className="matcher-section-body">{item.children}</div>}
    </section>
  })}</div>
}
export function FilterWorkspace({ items }: { items: CollapseItem[] }) {
  const id = useId()
  const tabs = items.slice(1)
  const [active, setActive] = useState(tabs[0]?.key)
  const selected = tabs.find(item => item.key === active) ?? tabs[0]
  return <div className="matcher-filter-workspace">
    <div className="matcher-listing-body">{items[0]?.children}</div>
    <div className="matcher-filter-tabs" role="tablist" aria-label="账号属性筛选">
      {tabs.map((item, index) => <button
        key={item.key}
        type="button"
        role="tab"
        id={`${id}-tab-${item.key}`}
        aria-selected={item.key === selected?.key}
        aria-controls={`${id}-panel`}
        tabIndex={item.key === selected?.key ? 0 : -1}
        onClick={() => setActive(item.key)}
        onKeyDown={event => {
          const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null
          if (next === null) return
          event.preventDefault()
          setActive(tabs[next].key)
          const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
          buttons?.[next].focus()
        }}
      >{item.label}</button>)}
    </div>
    {selected && <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${selected.key}`} tabIndex={0} className="matcher-filter-tabpanel">
      <div className="matcher-filter-summary">{selected.label}</div>
      {selected.children}
    </div>}
  </div>
}

function SpaceBase({ children, className = '' }: LayoutProps) { return <div className={`flex flex-wrap items-center gap-2 ${className}`}>{children}</div> }
export const Space = Object.assign(SpaceBase, { Compact: SpaceBase })
export const Typography = { Text: function Text({ children, title, strong, type }: LayoutProps & { title?: string; strong?: boolean; type?: string }) {
  return <span title={title} className={type === 'danger' ? 'text-destructive' : type === 'secondary' ? 'muted' : undefined} style={strong ? { fontWeight: 600 } : undefined}>{children}</span>
} }
