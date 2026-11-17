import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const root = new URL('../../../../', import.meta.url)
const read = path => readFileSync(new URL(path, root), 'utf8')

test('desktop starts at account query and navigation uses direct desktop routes', () => {
  const routes = read('apps/desktop/haolai/src/App.tsx')
  assert.match(routes, /<Route path="\/" element=\{<AccountPage \/>\}/)
  assert.doesNotMatch(routes, /yys-cbg-inspector|feature="home"|path="\/home"/)
  const paths = new Set([...routes.matchAll(/<Route path="([^"]+)"/g)].map(match => match[1]))
  assert.ok(paths.has('/account-matcher'), 'Windows account search must remain reachable')
  assert.match(read('apps/desktop/haolai/src/Workspace/navigation.ts'), /href: '\/account-matcher'/)
  assert.match(read('apps/desktop/haolai/src/Workspace/pageTitleByPath.ts'), /'\/account-matcher': '账号搜索'/)
  for (const [, href] of read('apps/desktop/haolai/src/Workspace/navigation.ts').matchAll(/href: '([^']+)'/g)) {
    assert.ok(paths.has(href), `desktop navigation target ${href} must have a direct route`)
  }
  for (const file of ['Workspace/Shell.tsx', 'Workspace/Sidebar.tsx', 'Workspace/pageTitleByPath.ts', 'pages/FeaturePage.tsx']) {
    assert.doesNotMatch(read(`apps/desktop/haolai/src/${file}`), /yys-cbg-inspector|['"]\/home['"]/, file)
  }
})

test('Web and desktop use one analysis page source and one global stylesheet', () => {
  for (const [app, sourceRoot] of [['web', 'apps/web/src/Haolai'], ['haolai', 'apps/desktop/haolai/src']]) {
    const pageRoot = `${sourceRoot}/pages`
    const feature = read(app === 'web' ? `${sourceRoot}/FeaturePage.tsx` : `${pageRoot}/FeaturePage.tsx`)
    assert.match(feature, /@phoenix\/ui\/pages/)
    const account = read(`${pageRoot}/AccountPage.tsx`)
    assert.match(account, /AccountPage as SharedAccountPage.*from ['"]@phoenix\/ui\/pages['"]/)
    assert.doesNotMatch(account, /<form|useForm|buildAccountSummary/)
    for (const page of ['SpeedPage', 'PvePage', 'HeroSkillsPage', 'CalculatorPage', 'RelicsPage', 'CollectionsPage']) {
      assert.equal(existsSync(new URL(`${pageRoot}/${page}.tsx`, root)), false, `${app}/${page} must not duplicate shared pages`)
      assert.ok(existsSync(new URL(`packages/ui/src/pages/${page}.tsx`, root)))
    }
  }
  const styles = read('packages/ui/src/styles/globals.css')
  const sources = [...styles.matchAll(/@source "([^"]+)";/g)].map(match => match[1])
  assert.ok(sources.includes('../pages'), 'shared page utilities must be included in Tailwind scanning')
  for (const source of sources) {
    assert.ok(existsSync(new URL(`packages/ui/src/styles/${source}`, root)), `Tailwind source ${source} must exist`)
  }
  assert.match(read('apps/desktop/haolai/main.tsx'), /@phoenix\/ui\/styles\/globals.css/)
  assert.match(read('apps/web/src/styles/globals.css'), /@phoenix\/ui\/styles\/globals.css/)
  assert.equal(existsSync(new URL('apps/desktop/haolai/src/styles/web.css', root)), false)
  assert.match(read('apps/desktop/haolai/src/features/account/context.tsx'), /window\.desktop/)
  assert.doesNotMatch(read('apps/desktop/haolai/src/features/account/context.tsx'), /apiClient|@phoenix\/api-client/)
})
