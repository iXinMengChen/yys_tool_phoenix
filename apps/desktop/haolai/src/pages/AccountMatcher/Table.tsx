import { Fragment, useState } from 'react'
import type { ReactNode } from 'react'
import { Pagination } from '@phoenix/ui/components/Pagination'

type Column<T> = {
  title?: ReactNode
  key?: string
  dataIndex?: keyof T
  width?: number
  fixed?: string
  ellipsis?: boolean
  children?: Column<T>[]
  render?: (value: unknown, record: T, index: number) => ReactNode
}
type TableProps<T> = {
  className?: string
  dataSource?: T[]
  columns?: Column<T>[]
  rowKey?: string | ((record: T) => string)
  pagination?: false | {
    current?: number
    pageSize?: number
    onChange?: (page: number) => void
    [key: string]: unknown
  }
  locale?: { emptyText?: ReactNode }
  expandable?: {
    expandRowByClick?: boolean
    expandedRowKeys?: string[]
    onExpand?: (expanded: boolean, record: T) => void
    expandedRowRender?: (record: T) => ReactNode
    [key: string]: unknown
  }
  [key: string]: unknown
}

// Both result sources use grouped account / speed / resource columns.
export function Table<T>({ className = '', dataSource = [], columns = [], rowKey, pagination, expandable, locale }: TableProps<T>) {
  const [page, setPage] = useState(1)
  const size = pagination ? pagination.pageSize ?? 10 : Math.max(1, dataSource.length)
  const pages = Math.max(1, Math.ceil(dataSource.length / size))
  const current = Math.min(pages, pagination ? pagination.current ?? page : 1)
  const visible = dataSource.slice((current - 1) * size, current * size)
  const leaves = columns.flatMap(column => column.children ?? [column])
  const grouped = columns.some(column => column.children?.length)
  const changePage = (next: number) => {
    setPage(next)
    if (pagination) pagination.onChange?.(next)
  }

  return (
    <div className={`matcher-table ${className}`}>
      <div className="matcher-table-scroll" tabIndex={0} role="region" aria-label="账号搜索结果，可横向滚动查看全部属性">
        <table style={{ minWidth: leaves.reduce((sum, column) => sum + (column.width ? Math.max(64, Math.round(column.width * 0.8)) : 120), expandable ? 64 : 0) }}>
          <colgroup>
            {expandable && <col style={{ width: 64 }} />}
            {leaves.map((column, index) => (
              <col key={column.key ?? index} style={{ width: column.width ? Math.max(64, Math.round(column.width * 0.8)) : 120 }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {expandable && <th scope="col" rowSpan={grouped ? 2 : 1}>详情</th>}
              {columns.map((column, index) => (
                <th key={column.key ?? index} className={column.fixed === 'right' ? 'matcher-cell-fixed' : undefined} scope={column.children ? 'colgroup' : 'col'} colSpan={column.children?.length} rowSpan={grouped && !column.children ? 2 : 1}>
                  {column.title}
                </th>
              ))}
            </tr>
            {grouped && <tr>{columns.flatMap(column => column.children ?? []).map((column, index) => <th scope="col" key={column.key ?? index}>{column.title}</th>)}</tr>}
          </thead>
          <tbody>
            {visible.length === 0 && <tr><td colSpan={leaves.length + (expandable ? 1 : 0)}>{locale?.emptyText ?? '暂无记录'}</td></tr>}
            {visible.map((record, index) => {
              const key = typeof rowKey === 'function' ? rowKey(record) : rowKey ? String((record as Record<string, unknown>)[rowKey]) : String(index)
              const expanded = expandable?.expandedRowKeys?.includes(key) ?? false
              return (
                <Fragment key={key}>
                  <tr onClick={expandable?.expandRowByClick ? event => {
                    if (event.target instanceof Element && event.target.closest('button,a,input')) return
                    expandable.onExpand?.(!expanded, record)
                  } : undefined}>
                    {expandable && <td><button type="button" aria-expanded={expanded} onClick={() => expandable.onExpand?.(!expanded, record)}>{expanded ? '收起' : '展开'}</button></td>}
                    {leaves.map((column, columnIndex) => <td className={column.fixed === 'right' ? 'matcher-cell-fixed' : column.ellipsis ? 'matcher-cell-ellipsis' : undefined} key={column.key ?? columnIndex}>{column.render ? column.render(column.dataIndex ? record[column.dataIndex] : undefined, record, index) : column.dataIndex ? String(record[column.dataIndex] ?? '') : null}</td>)}
                  </tr>
                  {expanded && <tr className="matcher-table-detail"><td colSpan={leaves.length + (expandable ? 1 : 0)}>{expandable?.expandedRowRender?.(record)}</td></tr>}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      {pagination && (
        <Pagination className="matcher-table-pagination" label="搜索结果分页" page={current} pageCount={pages} onPageChange={changePage} summary={`共 ${dataSource.length} 条`} />
      )}
    </div>
  )
}
