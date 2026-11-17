// Explicitly synthetic, loopback-only UI fixture. Never used by app runtime.
// Uses an OS-assigned port; never takes the normal API port. Stop after isolated UI checks.
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'

const heroes = JSON.parse(readFileSync(new URL('../../api/src/modules/cbg/data/heroes.json', import.meta.url), 'utf8'))
const relicSuits = JSON.parse(readFileSync(new URL('../../api/src/modules/cbg/data/relic-suits.json', import.meta.url), 'utf8'))
const hero = Object.values(heroes.heroesById).find(item => item.name === '须佐之男') || Object.values(heroes.heroesById)[0]
const positions = Object.fromEntries(Array.from({ length: 6 }, (_, index) => {
  const position = index + 1
  return [String(position), Array.from({ length: 3 }, (_, variant) => ({
    id: `ui-fixture-${position}-${variant}`, position, level: 15, quality: 6,
    suit: { id: variant, name: variant === 0 ? '招财猫' : variant === 1 ? '狂骨' : '荒骷髅', isTwoPieceSet: variant === 2, twoPieceAttribute: variant === 0 ? '防御加成30%' : '攻击加成15%' },
    mainAttribute: { label: position === 2 ? (variant === 0 ? '速度' : '攻击加成') : position === 4 ? '攻击加成' : position === 6 ? '暴击伤害' : position === 1 ? '攻击' : position === 3 ? '防御' : '生命', value: position === 2 ? 57 : position === 6 ? 89 : position === 1 ? 486 : position === 3 ? 104 : position === 5 ? 2052 : 55, isPercent: (position === 2 && variant > 0) || position === 4 || position === 6 },
    subAttributes: [{ label: '速度', value: 15 + variant, isPercent: false }, { label: '暴击', value: 20 + variant, isPercent: true }, { label: '暴击伤害', value: 18, isPercent: true }, { label: '攻击加成', value: 15, isPercent: true }],
  }))]
}))
const tuple = attribute => [attribute.label, `${attribute.value}${attribute.isPercent ? '%' : ''}`]
const product = { schemaVersion: 1, channel: 'official', sourceUrl: 'https://yys.cbg.163.com/cgi/mweb/equip/1/ui-fixture', equip: {
  equip_name: 'UI 验证专用，不是真实商品', server_name: '测试区', price: 123400, status_desc: '测试数据', equip_desc: {
    name: 'UI 验证 · 合成账号', lv: 60, goyu: 1000, strength: 2000, gameble_card: 99, damo_count_dict: { all: { 411: 12 } },
    heroes: { sample: { heroUid: 'ui-fixture-hero', heroId: hero.id, name: hero.name, rarity: 4, level: 40, skinfo: [[1, 5], [2, 5], [3, 5]] } },
    inventory: Object.fromEntries(Object.values(positions).flat().map(relic => [relic.id, { uuid: relic.id, pos: relic.position, level: relic.level, qua: relic.quality, name: relic.suit.name, suitid: relic.suit.id, attrs: [tuple(relic.mainAttribute), ...relic.subAttributes.map(tuple)] }])),
  },
} }
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1')
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  let data
  if (url.pathname.endsWith('/cbg/session')) data = { configured: true, refreshedAt: null }
  else if (url.pathname.endsWith('/cbg/static')) data = { heroes, relicSuits }
  else if (url.pathname.endsWith('/cbg/product')) {
    if (url.searchParams.get('ordersn') === 'ui-error') { response.statusCode = 429; response.end(JSON.stringify({ code: 429, message: '请求过于频繁', data: null })); return }
    if (url.searchParams.get('ordersn') !== 'ui-fixture') { response.statusCode = 400; response.end(JSON.stringify({ code: 400, message: '验证服务仅接受 ui-fixture', data: null })); return }
    data = product
  } else { response.statusCode = 404; response.end('{}'); return }
  response.end(JSON.stringify({ code: 200, message: 'success', data }))
})
server.listen(0, '127.0.0.1', () => console.log(`Synthetic browser fixture: http://127.0.0.1:${server.address().port}; not a real API.`))
