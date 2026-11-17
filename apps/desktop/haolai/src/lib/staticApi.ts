async function loadBundledData(name: 'heroes' | 'relic-suits') {
  return name === 'heroes'
    ? (await import('../data/heroes.json')).default
    : (await import('../data/relic-suits.json')).default
}

function applyBundledHeroFlags(data: unknown, bundled: unknown): unknown {
  const document = data as { heroesById?: Record<string, Record<string, unknown>> }
  const bundledDocument = bundled as { heroesById?: Record<string, { isCollaboration?: boolean }> }
  if (!document?.heroesById || !bundledDocument.heroesById) return data
  return {
    ...document,
    heroesById: Object.fromEntries(Object.entries(document.heroesById).map(([id, hero]) => [
      id,
      typeof hero.isCollaboration === 'boolean' ? hero : {
        ...hero, isCollaboration: Boolean(bundledDocument.heroesById?.[id]?.isCollaboration),
      },
    ])),
  }
}

/** 资料首次使用时读取安装目录，缺失时下载；普通读取保留内置离线回退。 */
async function loadStaticData<T>(name: 'heroes' | 'relic-suits', endpoint: string, refresh = false): Promise<T> {
  let data: unknown
  try {
    data = refresh ? await window.desktop!.updateStaticData(endpoint) : await window.desktop!.readStaticData(endpoint)
    if (data == null && !refresh) data = await window.desktop!.updateStaticData(endpoint)
  } catch (cause) {
    if (refresh) throw cause
  }
  const bundled = name === 'heroes' || data == null ? await loadBundledData(name) : undefined
  return (name === 'heroes' ? applyBundledHeroFlags(data ?? bundled, bundled) : data ?? bundled) as T
}

export function loadHeroPanels<T = unknown>(refresh = false): Promise<T> {
  return loadStaticData<T>('heroes', '/static/heroes', refresh)
}

export function loadRelicSuits<T = unknown>(refresh = false): Promise<T> {
  return loadStaticData<T>('relic-suits', '/static/relic-suits', refresh)
}

export function saveStaticData(name: 'heroes' | 'relic-suits', data: unknown): Promise<unknown> {
  return window.desktop!.saveStaticData(`/static/${name}`, data)
}
