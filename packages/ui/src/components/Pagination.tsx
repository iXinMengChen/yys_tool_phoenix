'use client'

import { useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

type PaginationProps = {
  page: number
  pageCount: number
  onPageChange: (page: number) => void
  label?: string
  summary?: ReactNode
  className?: string
}

export function Pagination({ page, pageCount, onPageChange, label = '分页', summary, className = '' }: PaginationProps) {
  const total = Math.max(1, pageCount)
  const current = Math.max(1, Math.min(page, total))
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<{ page: number; value: string } | null>(null)
  const start = Math.max(2, Math.min(current - 1, total - 3))
  const end = Math.min(total - 1, Math.max(current + 1, 4))
  const pages: (number | 'before' | 'after')[] = [1]
  if (start > 2) pages.push('before')
  for (let value = start; value <= end; value++) pages.push(value)
  if (end < total - 1) pages.push('after')
  if (total > 1) pages.push(total)

  function changePage(next: number) {
    setDraft(null)
    if (next !== current) onPageChange(next)
  }

  function jumpToPage() {
    const input = inputRef.current
    if (input?.reportValidity()) changePage(input.valueAsNumber)
  }

  return (
    <nav aria-label={label} className={`pagination ${className}`}>
      <span className="pagination-summary" aria-live="polite" aria-atomic="true">
        {summary && <>{summary} · </>}第 {current} / {total} 页
      </span>
      <div className="pagination-pages">
        <button type="button" aria-label="上一页" title="上一页" disabled={current === 1} onClick={() => changePage(current - 1)}>
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <div className="pagination-numbers">
          {pages.map(value => typeof value === 'number' ? (
            <button
              type="button"
              key={value}
              aria-label={`第 ${value} 页`}
              aria-current={value === current ? 'page' : undefined}
              onClick={() => changePage(value)}
            >
              {value}
            </button>
          ) : <span key={value} className="pagination-ellipsis" aria-hidden="true">…</span>)}
        </div>
        <button type="button" aria-label="下一页" title="下一页" disabled={current === total} onClick={() => changePage(current + 1)}>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="pagination-jump">
        <label>
          前往
          <input
            ref={inputRef}
            type="number"
            inputMode="numeric"
            min={1}
            max={total}
            step={1}
            required
            aria-label="跳转页码"
            title={`输入 1 至 ${total} 的整数页码`}
            value={draft?.page === current ? draft.value : String(current)}
            onChange={event => setDraft({ page: current, value: event.target.value })}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault()
                jumpToPage()
              }
            }}
          />
          页
        </label>
        <button type="button" onClick={jumpToPage}>跳转</button>
      </div>
    </nav>
  )
}
