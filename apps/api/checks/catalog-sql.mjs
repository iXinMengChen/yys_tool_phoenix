import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { parseHeroesSql, parseRelicSuitsSql, readCatalogSqlFiles } from '../scripts/catalog-sql.mjs'

const heroValues = ['200', "'桃花妖'", "'taohuayao'", "'SR'", '2385.1250', '12532.7600', '490.9200', '100.0000', '5.0000', '150.0000', '0.0000', '20.0000', "'155'", '0', 'NULL', '0']
const suitValues = ['300002', "'雪幽魂'", "'xueyouhun'", "'防御加成30%'", "'造成伤害时，冰冻1回合。'", '0']
const tuple = (values, overrides = {}) => `(${values.map((value, index) => overrides[index] ?? value).join(', ')})`
const hero = (overrides) => `INSERT INTO \`heroes\` VALUES ${tuple(heroValues, overrides)};`
const suit = (overrides) => `INSERT INTO \`relic_suits\` VALUES ${tuple(suitValues, overrides)};`

function wrapper(table, inserts) {
  return `\uFEFF/* Navicat: INSERT INTO \`${table}\` VALUES (999); */
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
-- Records wrapper
DROP TABLE IF EXISTS \`${table}\`;
CREATE TABLE \`${table}\` (
  \`id\` int(10) UNSIGNED NOT NULL COMMENT 'not data; INSERT INTO \`${table}\` VALUES (999);',
  PRIMARY KEY (\`id\`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;
${inserts}
SET FOREIGN_KEY_CHECKS = 1;`
}

test('Hero retains every field, finite decimals, percentages, string rank and nullable attributes', () => {
  assert.deepEqual(parseHeroesSql(wrapper('heroes', hero())), [{
    id: 200, name: '桃花妖', slug: 'taohuayao', level: 'SR',
    attack: 2385.125, health: 12532.76, defense: 490.92, speed: 100,
    critRate: 5, critDamage: 150, effectHit: 0, effectResistance: 20,
    lowestRank: '155', isCollaboration: false, additionalAttributes: null, additionalAttributesValue: 0,
  }])
  const [row] = parseHeroesSql(hero({ 3: "'UR'", 12: "'015'", 13: '1', 14: "'health'", 15: '15' }))
  assert.equal(row.level, 'UR')
  assert.equal(row.lowestRank, '015')
  assert.equal(row.isCollaboration, true)
  assert.equal(row.additionalAttributes, 'health')
  assert.equal(row.additionalAttributesValue, 15)
  assert.equal(parseHeroesSql(hero({ 14: "''" }))[0].additionalAttributes, '')
  assert.equal(parseHeroesSql(hero({ 14: "'NULL'" }))[0].additionalAttributes, 'NULL')
})

test('RelicSuit retains every field including empty attribute and strict boolean', () => {
  assert.deepEqual(parseRelicSuitsSql(wrapper('relic_suits', suit())), [{
    id: 300002, name: '雪幽魂', slug: 'xueyouhun',
    twoPieceAttribute: '防御加成30%', twoPieceEffect: '造成伤害时，冰冻1回合。', isOma: false,
  }])
  const [oma] = parseRelicSuitsSql(suit({ 3: "''", 5: '1' }))
  assert.equal(oma.twoPieceAttribute, '')
  assert.equal(oma.isOma, true)
})

test('SQL strings decode doubled quotes and MySQL escapes without interpreting their content', () => {
  const raw = String.raw`'雪''幽\'魂,); -- # /* not comment */\n\r\t\b\Z\\\"\%\_'`
  assert.equal(parseRelicSuitsSql(suit({ 1: raw }))[0].name, "雪'幽'魂,); -- # /* not comment */\n\r\t\b\x1a\\\"\\%\\_")
  const sqlLike = "'x''); DROP TABLE secrets; SELECT pg_sleep(1); --'"
  assert.equal(parseRelicSuitsSql(suit({ 4: sqlLike }))[0].twoPieceEffect, "x'); DROP TABLE secrets; SELECT pg_sleep(1); --")
})

test('supports multiple VALUES tuples, statement whitespace, comments and CRLF', () => {
  const sql = `# INSERT INTO \`heroes\` VALUES (0);\r\n insert\ninto \`heroes\` values\n${tuple(heroValues)},\n${tuple(heroValues, { 0: '201', 2: "'second'" })}; -- end`
  assert.deepEqual(parseHeroesSql(sql).map(({ id }) => id), [200, 201])
})

test('rejects missing/extra columns rather than returning partial rows', () => {
  for (const [parse, table, values, expected] of [[parseHeroesSql, 'heroes', heroValues, 16], [parseRelicSuitsSql, 'relic_suits', suitValues, 6]]) {
    for (const tokens of [values.slice(1), [...values, '0']]) {
      assert.throws(() => parse(`INSERT INTO \`${table}\` VALUES ${tuple(tokens)};`), new RegExp(`expected ${expected} columns`))
    }
  }
  assert.throws(() => parseHeroesSql(`${hero()}\nINSERT INTO \`heroes\` VALUES (201);`), /row 2: expected 16 columns/)
})

test('rejects incorrect Hero types, invalid enum/flags, nonfinite numbers and PostgreSQL integer overflow', () => {
  for (const [index, token] of [
    [0, "'200'"], [0, '0'], [0, '1.5'], [0, '2147483648'], [0, '9007199254740993'],
    [1, 'NULL'], [1, "''"], [2, "' '"], [3, "'INVALID'"],
    [4, "'2385.1250'"], [4, 'NULL'], [4, '9'.repeat(400)],
    [12, '155'], [13, '2'], [13, "'1'"], [14, '15'], [15, '1.5'], [15, '2147483648'], [15, 'NULL'],
  ]) assert.throws(() => parseHeroesSql(hero({ [index]: token })), /row 1:/, `${index}: ${token}`)
})

test('rejects incorrect RelicSuit types and NULL in non-nullable fields', () => {
  for (const index of [0, 1, 2, 3, 4, 5]) assert.throws(() => parseRelicSuitsSql(suit({ [index]: 'NULL' })), /row 1:/)
  for (const token of ['-1', '2', "'0'", '0.5']) assert.throws(() => parseRelicSuitsSql(suit({ 5: token })), /isOma: expected boolean/)
})

test('rejects duplicate IDs and slugs across tuples/statements for both tables', () => {
  assert.throws(() => parseHeroesSql(hero() + hero({ 2: "'other'" })), /duplicate id 200/)
  assert.throws(() => parseHeroesSql(hero() + hero({ 0: '201' })), /duplicate slug taohuayao/)
  assert.throws(() => parseRelicSuitsSql(`INSERT INTO \`relic_suits\` VALUES ${tuple(suitValues)},${tuple(suitValues, { 2: "'other'" })};`), /duplicate id 300002/)
  assert.throws(() => parseRelicSuitsSql(suit() + suit({ 0: '300003' })), /duplicate slug xueyouhun/)
})

test('rejects expressions, wrong tables, explicit columns, executable comments and injection statements', () => {
  for (const token of ['1+1', 'NaN', 'Infinity', '1e309', '0x10', 'TRUE', 'NOW()', '(SELECT 1)', 'globalThis.injected = 1']) {
    assert.throws(() => parseHeroesSql(hero({ 4: token })), /invalid VALUES/)
  }
  for (const sql of [
    suit(), hero().replace('`heroes`', '`other`'),
    hero().replace('`heroes` VALUES', '`heroes` (`id`) VALUES'),
    hero() + 'DELETE FROM `heroes`;', hero() + 'DROP TABLE `secrets`;',
    hero().replace('INSERT INTO', 'REPLACE INTO'),
    `/*!50000 ${hero()} */`,
    hero({ 1: "'x'); DELETE FROM heroes; --" }),
  ]) assert.throws(() => parseHeroesSql(sql))
})

test('rejects malformed/truncated input, unsupported escapes, NUL and empty dumps', () => {
  for (const sql of ['', '-- only comment', hero().slice(0, -1), hero() + '/* unfinished', hero({ 1: "'unfinished" }), hero().replace(');', ',);'), hero().replace(');', '),;')]) {
    assert.throws(() => parseHeroesSql(sql))
  }
  assert.throws(() => parseHeroesSql(null), /SQL text must be a string/)
  assert.throws(() => parseHeroesSql(hero({ 1: String.raw`'bad\q'` })), /invalid VALUES/)
  assert.throws(() => parseHeroesSql(hero({ 1: String.raw`'bad\0'` })), /PostgreSQL text cannot contain NUL/)
  assert.throws(() => parseHeroesSql(hero({ 1: "'bad\0'" })), /PostgreSQL text cannot contain NUL/)
})

test('file reader returns both validated catalogs atomically, rejects malformed UTF-8 and leaves sources unchanged', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'phoenix-catalog-sql-'))
  const heroesPath = join(directory, 'heroes.sql')
  const relicSuitsPath = join(directory, 'relic_suits.sql')
  try {
    const heroesText = wrapper('heroes', hero())
    const suitsText = wrapper('relic_suits', suit())
    await writeFile(heroesPath, heroesText)
    await writeFile(relicSuitsPath, suitsText)
    const result = await readCatalogSqlFiles({ heroesPath, relicSuitsPath })
    assert.deepEqual(result, { heroes: parseHeroesSql(heroesText), relicSuits: parseRelicSuitsSql(suitsText) })
    assert.equal(await readFile(heroesPath, 'utf8'), heroesText)
    assert.equal(await readFile(relicSuitsPath, 'utf8'), suitsText)
    await writeFile(relicSuitsPath, suit() + suit({ 2: "'other'" }))
    await assert.rejects(readCatalogSqlFiles({ heroesPath, relicSuitsPath }), /duplicate id/)
    await writeFile(relicSuitsPath, Buffer.from([0xff]))
    await assert.rejects(readCatalogSqlFiles({ heroesPath, relicSuitsPath }), /encoded data/)
    await assert.rejects(readCatalogSqlFiles({ heroesPath: join(directory, 'missing.sql'), relicSuitsPath }), /ENOENT/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
