import assert from 'node:assert/strict'
import test from 'node:test'

// Run against an existing dev server: node apps/web/checks/routes.mjs http://localhost:24974
const origin = process.argv[2] ?? 'http://localhost:24974'
const prefix = '/yys-cbg-inspector'
const pages = ['home', 'speed', 'pve', 'hero-skills', 'calculator', 'relics']
const request = path => fetch(new URL(path, origin), { redirect: 'manual', signal: AbortSignal.timeout(30_000) })

for (const page of pages) {
  test(`${prefix}/${page} renders`, async () => {
    const response = await request(`${prefix}/${page}`)
    assert.equal(response.status, 200)
    const html = await response.text()
    assert.match(html, /aria-label="主导航"/)
    assert.match(html, /href="\/"/)
    assert.match(html, /工具箱首页/)
    assert.equal((html.match(/<aside\b/g) ?? []).length, 1)
    assert.equal((html.match(/<main\b/g) ?? []).length, 1)
  })

  test(`/${page} redirects with query parameters`, async () => {
    const response = await request(`/${page}?from=legacy&label=a%20b`)
    assert.equal(response.status, 308)
    const destination = new URL(response.headers.get('location'), origin)
    assert.equal(destination.pathname, `${prefix}/${page}`)
    assert.equal(destination.searchParams.get('from'), 'legacy')
    assert.equal(destination.searchParams.get('label'), 'a b')
    await response.body?.cancel()
  })
}

test('tool root opens lookup; toolbox home shares the workspace navigation', async () => {
  const response = await request(prefix)
  assert.equal(response.status, 308)
  assert.equal(new URL(response.headers.get('location'), origin).pathname, `${prefix}/home`)
  await response.body?.cancel()
  const homepage = await request('/')
  assert.equal(homepage.status, 200)
  const html = await homepage.text()
  assert.match(html, /aria-label="主导航"/)
  assert.equal((html.match(/<aside\b/g) ?? []).length, 1)
  for (const page of pages) assert.match(html, new RegExp(`href="${prefix}/${page}"`))
})

test('unrelated routes are not captured by legacy redirects', async () => {
  for (const path of ['/not-a-tool', `${prefix}/not-a-tool`]) {
    const response = await request(path)
    assert.equal(response.status, 404)
    await response.body.cancel()
  }
})
