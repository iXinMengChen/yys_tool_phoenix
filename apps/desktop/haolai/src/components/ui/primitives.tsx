import { useEffect, useRef } from "react";
import { Pagination } from '@phoenix/ui/components/Pagination'
import type { ButtonHTMLAttributes, CSSProperties, ElementType, HTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  icon?: ReactNode;
  loading?: boolean;
  danger?: boolean;
  iconPosition?: "start" | "end";
  size?: "small" | "middle" | "large";
  block?: boolean;
  type?: "button" | "submit" | "reset" | "primary" | "default" | "link" | "text";
};

export function Button({ icon, loading, children, className, disabled, type = "button", iconPosition = "start", ...props }: ButtonProps) {
  const nativeType = type === "submit" || type === "reset" ? type : "button";
  const content = <>{loading ? "处理中…" : children}</>;
  return (
    <button className={className} type={nativeType} data-variant={type} disabled={disabled || loading} {...props}>
      {iconPosition === "start" ? icon : null}
      {content}
      {iconPosition === "end" ? icon : null}
    </button>
  );
}

export function Card({ title, children, className, hoverable: _hoverable, ...props }: Omit<HTMLAttributes<HTMLDivElement>, "title"> & { title?: ReactNode; hoverable?: boolean }) {
  void _hoverable;
  return <section className={className} {...props}>{title ? <header className="ui-card-title">{title}</header> : null}{children}</section>;
}

export function Tooltip({ title, children }: { title?: ReactNode; trigger?: string[]; placement?: string; overlayInnerStyle?: CSSProperties; children: ReactNode }) {
  return <span title={typeof title === "string" ? title : undefined}>{children}</span>;
}

type ModalProps = { open?: boolean; title?: ReactNode; onCancel?: () => void; onOk?: () => void; children: ReactNode; footer?: ReactNode; className?: string; rootClassName?: string; width?: number | string; destroyOnHidden?: boolean; zIndex?: number; okText?: ReactNode; cancelText?: ReactNode; okButtonProps?: { danger?: boolean; loading?: boolean } };
function ModalBase({ open = false, title, onCancel, onOk, children, footer, className, rootClassName, width, okText = "确定", cancelText = "取消", okButtonProps }: ModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancelRef.current?.();
      if (event.key !== 'Tab') return;
      const dialog = closeButtonRef.current?.closest('[role="dialog"]');
      const controls = dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]');
      const first = controls?.[0];
      const last = controls?.[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className={`ui-modal ${rootClassName ?? ""}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel?.(); }}>
      <div className={`ui-modal__content ${className ?? ""}`} role="dialog" style={width ? { maxWidth: width } : undefined} aria-modal="true" aria-labelledby="ui-modal-title">
        <header className="ui-modal__header"><strong id="ui-modal-title">{title}</strong><button ref={closeButtonRef} type="button" aria-label="关闭" onClick={onCancel}>关闭</button></header>
        <div className="ui-modal__body">{children}</div>
        {(footer || onOk) ? <footer className="ui-modal__footer">{footer ?? <><button type="button" onClick={onCancel}>{cancelText}</button><button type="button" data-variant="primary" disabled={okButtonProps?.loading} onClick={onOk}>{okButtonProps?.loading ? "处理中…" : okText}</button></>}</footer> : null}
      </div>
    </div>
  );
}

type ListProps<T> = { className?: string; dataSource?: T[]; renderItem?: (item: T, index: number) => ReactNode; pagination?: false | { current?: number; pageSize?: number; onChange?: (page: number) => void; showSizeChanger?: boolean; showLessItems?: boolean; responsive?: boolean; hideOnSinglePage?: boolean; position?: string; align?: string } };
function ListBase<T>({ className, dataSource = [], renderItem, pagination }: ListProps<T>) {
  const size = pagination && pagination.pageSize ? pagination.pageSize : Math.max(1, dataSource.length)
  const pageCount = Math.max(1, Math.ceil(dataSource.length / size))
  const page = Math.max(1, Math.min(pagination && pagination.current ? pagination.current : 1, pageCount))
  const visible = pagination === false ? dataSource : dataSource.slice((page - 1) * size, page * size)
  return (
    <div className={className}>
      {visible.length ? <div className="phoenix-list-items">{visible.map((item, index) => renderItem?.(item, index))}</div> : null}
      {pagination && (pageCount > 1 || !pagination.hideOnSinglePage) && (
        <Pagination className="mt-3" label="御魂分页" page={page} pageCount={pageCount} onPageChange={next => pagination.onChange?.(next)} summary={`共 ${dataSource.length} 件`} />
      )}
    </div>
  )
}
export const List = Object.assign(ListBase, { Item: ({ children }: { children: ReactNode }) => <div className="phoenix-list-item">{children}</div> });
export function Tag({ children, className }: { children: ReactNode; className?: string; color?: string }) { return <span className={className}>{children}</span>; }

function InputBase(props: InputHTMLAttributes<HTMLInputElement>) { return <input {...props} />; }
export const Input = Object.assign(InputBase, { TextArea: (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} /> });
export function Select({ value, options = [], onChange, className }: { value?: string | string[]; options?: Array<{ value: string; label: ReactNode } | string>; onChange?: (value: string) => void; className?: string }) {
  return <select className={className} value={value} onChange={(event) => onChange?.(event.target.value)}>{options.map((option) => <option key={typeof option === "string" ? option : option.value} value={typeof option === "string" ? option : option.value}>{typeof option === "string" ? option : option.label}</option>)}</select>;
}
export function Switch({ checked, onChange, className, children }: { checked?: boolean; onChange?: (value: boolean) => void; size?: string; className?: string; indeterminate?: boolean; children?: ReactNode }) { return <button className={className} type="button" role="switch" aria-checked={checked} onClick={() => onChange?.(!checked)}>{children ?? (checked ? "开启" : "关闭")}</button>; }
export function Segmented({ value, options = [], onChange }: { value?: string; options?: Array<{ value: string; label: ReactNode }>; onChange?: (value: string) => void }) { return <div role="group">{options.map((option) => <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange?.(option.value)}>{option.label}</button>)}</div>; }
export function Dropdown({ menu, children, disabled }: { menu: { items?: Array<{ key: string; label: ReactNode; onClick?: () => void }> }; children: ReactNode; disabled?: boolean }) { return <div className="ui-dropdown"><span onClick={(event) => { if (disabled) return; const item = menu.items?.[0]; item?.onClick?.(); event.preventDefault(); }}>{children}</span>{!disabled ? <div className="ui-dropdown__menu">{menu.items?.map((item) => <button type="button" key={item.key} onClick={item.onClick}>{item.label}</button>)}</div> : null}</div>; }
type TableColumn<T> = { title?: ReactNode; children?: ReactNode; dataIndex?: keyof T | string; key?: string; width?: number; ellipsis?: boolean; render?: (value: unknown, record: T, index: number) => ReactNode; [key: string]: unknown };
export function Table<T>({ dataSource = [], columns = [], rowKey, onRow }: { className?: string; dataSource?: T[]; columns?: TableColumn<T>[]; rowKey?: keyof T | string; loading?: boolean; pagination?: unknown; onRow?: (record: T) => { onClick?: () => void; className?: string } }) { return <table><thead><tr>{columns.map((column, index) => <th key={column.key ?? index}>{column.title}</th>)}</tr></thead><tbody>{dataSource.map((record, rowIndex) => { const row = onRow?.(record); return <tr key={String(rowKey ? record[rowKey as keyof T] : rowIndex)} className={row?.className} onClick={row?.onClick}>{columns.map((column, index) => <td key={column.key ?? index}>{column.render ? column.render(column.dataIndex ? record[column.dataIndex as keyof T] : undefined, record, rowIndex) : column.dataIndex ? String(record[column.dataIndex as keyof T] ?? "") : ""}</td>)}</tr>; })}</tbody></table>; }
export const Modal = Object.assign(ModalBase, { confirm: ({ title, content, okText = "确定", cancelText = "取消", onOk }: { title?: string; content?: ReactNode; okText?: ReactNode; cancelText?: ReactNode; okButtonProps?: { danger?: boolean }; onOk?: () => void }) => {
  if (window.confirm(`${title ?? "确认"}\n${typeof content === "string" ? content : ""}`)) onOk?.();
  return null;
} });

function EmptyBase({ description, className }: { description?: ReactNode; className?: string; [key: string]: unknown }) {
  return <div className={`ui-empty ${className ?? ""}`} role="status">{description ?? "暂无数据"}</div>;
}
export const Empty = Object.assign(EmptyBase, { PRESENTED_IMAGE_SIMPLE: null });

type MessageInput = string | { content: string };
const messageText = (input: MessageInput) => typeof input === "string" ? input : input.content;
const messageApi = {
  error: (input: MessageInput) => { console.error(messageText(input)); return Promise.resolve(); },
  success: (input: MessageInput) => { console.info(messageText(input)); return Promise.resolve(); },
  info: (input: MessageInput) => { console.info(messageText(input)); return Promise.resolve(); },
  warning: (input: MessageInput) => { console.warn(messageText(input)); return Promise.resolve(); },
};
export const message = { useMessage: () => [messageApi, null] as const };

export const Typography = {
  Title: ({ level = 2, children, className }: { level?: number; children: ReactNode; className?: string }) => {
    const Tag = `h${Math.min(6, Math.max(1, level))}` as ElementType;
    return <Tag className={className}>{children}</Tag>;
  },
  Paragraph: ({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties; type?: string }) => <p className={className} style={style}>{children}</p>,
  Text: ({ children, className, copyable, strong }: { children: ReactNode; className?: string; type?: string; copyable?: { text: string }; strong?: boolean }) => <span className={className} style={strong ? { fontWeight: 600 } : undefined}>{children}{copyable ? <button type="button" onClick={() => void navigator.clipboard?.writeText(copyable.text)} aria-label="复制">复制</button> : null}</span>,
};

export function Space({ children, className }: { children: ReactNode; className?: string; wrap?: boolean }) {
  return <div className={className ?? "ui-space"}>{children}</div>;
}
