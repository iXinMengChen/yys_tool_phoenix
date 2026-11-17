import { useState } from 'react'
import { useLocation, useOutlet } from 'react-router-dom'
import { pageTitleByPath } from './pageTitleByPath'

export default function CachedOutlet() {
  const { pathname } = useLocation()
  const outlet = useOutlet()
  const cacheable = Object.hasOwn(pageTitleByPath, pathname)
  const [pages, setPages] = useState(() => new Map(cacheable ? [[pathname, outlet]] : []))
  if (cacheable && !pages.has(pathname)) {
    setPages(new Map(pages).set(pathname, outlet))
  }
  // Redirect routes must unmount after navigation rather than redirecting from a hidden cache.
  const visiblePages = cacheable ? pages : new Map(pages).set(pathname, outlet)

  return <>{Array.from(visiblePages, ([path, page]) => (
    <div key={path} hidden={path !== pathname}>{page}</div>
  ))}</>
}
