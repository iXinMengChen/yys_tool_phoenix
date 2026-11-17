import { readFile } from 'node:fs/promises'

const heroColumns = [
  ['id', 'id'], ['name', 'string'], ['slug', 'string'], ['level', 'level'],
  ['attack', 'number'], ['health', 'number'], ['defense', 'number'], ['speed', 'number'],
  ['critRate', 'number'], ['critDamage', 'number'], ['effectHit', 'number'], ['effectResistance', 'number'],
  ['lowestRank', 'string'], ['isCollaboration', 'boolean'],
  ['additionalAttributes', 'nullableString'], ['additionalAttributesValue', 'integer'],
]
const relicSuitColumns = [
  ['id', 'id'], ['name', 'string'], ['slug', 'string'],
  ['twoPieceAttribute', 'string'], ['twoPieceEffect', 'string'], ['isOma', 'boolean'],
]
const escapes = { '0': '\0', b: '\b', n: '\n', r: '\r', t: '\t', Z: '\x1a', "'": "'", '"': '"', '\\': '\\', '%': '\\%', _: '\\_' }

// Only split the Navicat wrapper and INSERTs; never interpret or execute SQL.
function* statements(text) {
  let statement = ''
  let quote = null
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quote) {
      statement += char
      if (char === '\\' && quote === "'") {
        if (++i === text.length) throw new Error('SQL: unfinished escape')
        statement += text[i]
      } else if (char === quote) {
        if (text[i + 1] === quote) statement += text[++i]
        else quote = null
      }
    } else if (char === "'" || char === '`') {
      quote = char
      statement += char
    } else if (char === '#' || (text.startsWith('--', i) && /\s/.test(text[i + 2] ?? ''))) {
      const end = text.indexOf('\n', i)
      i = end === -1 ? text.length : end
      statement += ' '
    } else if (text.startsWith('/*', i)) {
      if (text[i + 2] === '!') throw new Error('SQL: executable comments are not allowed')
      const end = text.indexOf('*/', i + 2)
      if (end === -1) throw new Error('SQL: unfinished comment')
      i = end + 1
      statement += ' '
    } else if (char === ';') {
      if (statement.trim()) yield statement.trim()
      statement = ''
    } else {
      statement += char
    }
  }
  if (quote) throw new Error('SQL: unfinished quoted value')
  if (statement.trim()) throw new Error('SQL: missing final semicolon')
}

function parseValues(text, table) {
  let position = 0
  const rows = []
  const fail = () => { throw new Error(`${table}: invalid VALUES literal or delimiter at offset ${position}`) }
  const skipSpace = () => { while (/\s/.test(text[position] ?? '') && position < text.length) position++ }
  const expect = (char) => {
    skipSpace()
    if (text[position++] !== char) fail()
  }
  function literal() {
    skipSpace()
    if (text[position] !== "'") {
      const match = /^(?:NULL\b|[+-]?\d+(?:\.\d+)?)/i.exec(text.slice(position))
      if (!match) fail()
      position += match[0].length
      return match[0].toUpperCase() === 'NULL' ? null : Number(match[0])
    }
    position++
    let value = ''
    while (position < text.length) {
      const char = text[position++]
      if (char === "'") {
        if (text[position] !== "'") return value
        position++
        value += "'"
      } else if (char === '\\') {
        const escaped = text[position++]
        if (!Object.hasOwn(escapes, escaped)) fail()
        value += escapes[escaped]
      } else {
        value += char
      }
    }
    fail()
  }
  do {
    expect('(')
    const values = [literal()]
    skipSpace()
    while (text[position] === ',') {
      position++
      values.push(literal())
      skipSpace()
    }
    expect(')')
    rows.push(values)
    skipSpace()
    if (position === text.length) return rows
    expect(',')
  } while (position < text.length)
  fail()
}

function validateRow(values, columns, table, rowNumber) {
  const fail = (message) => { throw new Error(`${table} row ${rowNumber}: ${message}`) }
  if (values.length !== columns.length) fail(`expected ${columns.length} columns, got ${values.length}`)
  return Object.fromEntries(columns.map(([field, type], index) => {
    const value = values[index]
    const isInteger = Number.isInteger(value) && value >= -2147483648 && value <= 2147483647
    let valid
    switch (type) {
      case 'id': valid = isInteger && value > 0; break
      case 'integer': valid = isInteger; break
      case 'number': valid = typeof value === 'number' && Number.isFinite(value); break
      case 'boolean': valid = value === 0 || value === 1; break
      case 'level': valid = ['UR', 'SP', 'SSR', 'SR', 'R', 'N'].includes(value); break
      case 'nullableString': valid = value === null || typeof value === 'string'; break
      default: valid = typeof value === 'string'
    }
    if (!valid) fail(`${field}: expected ${type}`)
    if (typeof value === 'string' && value.includes('\0')) fail(`${field}: PostgreSQL text cannot contain NUL`)
    if ((field === 'name' || field === 'slug') && value.trim() === '') fail(`${field}: must not be empty`)
    return [field, type === 'boolean' ? value === 1 : value]
  }))
}

function parseDump(text, table, columns) {
  if (typeof text !== 'string') throw new TypeError(`${table}: SQL text must be a string`)
  const rows = []
  const ids = new Set()
  const slugs = new Set()
  const insert = new RegExp(`^INSERT\\s+INTO\\s+\`${table}\`\\s+VALUES\\s+([\\s\\S]+)$`, 'i')
  const drop = new RegExp(`^DROP\\s+TABLE\\s+IF\\s+EXISTS\\s+\`${table}\`$`, 'i')
  const create = new RegExp(`^CREATE\\s+TABLE\\s+\`${table}\`\\s*\\([\\s\\S]*\\)\\s+ENGINE\\s*=\\s*InnoDB\\s+CHARACTER\\s+SET\\s*=\\s*utf8mb4\\s+COLLATE\\s*=\\s*utf8mb4_unicode_ci\\s+ROW_FORMAT\\s*=\\s*Dynamic$`, 'i')
  for (const statement of statements(text)) {
    if (/^SET\s+NAMES\s+utf8mb4$/i.test(statement) || /^SET\s+FOREIGN_KEY_CHECKS\s*=\s*[01]$/i.test(statement) || drop.test(statement) || create.test(statement)) continue
    const match = insert.exec(statement)
    if (!match) throw new Error(`${table}: unsupported SQL statement; only this table's INSERT VALUES and Navicat wrapper are allowed`)
    for (const values of parseValues(match[1], table)) {
      const row = validateRow(values, columns, table, rows.length + 1)
      if (ids.has(row.id)) throw new Error(`${table} row ${rows.length + 1}: duplicate id ${row.id}`)
      if (slugs.has(row.slug)) throw new Error(`${table} row ${rows.length + 1}: duplicate slug ${row.slug}`)
      ids.add(row.id)
      slugs.add(row.slug)
      rows.push(row)
    }
  }
  if (rows.length === 0) throw new Error(`${table}: no INSERT rows found`)
  return rows
}

/** Parse all 16 heroes columns in dump order; percentages remain unchanged numbers. Throws on any error, never returns partial rows. */
export function parseHeroesSql(text) {
  return parseDump(text, 'heroes', heroColumns)
}

/** Parse all 6 relic_suits columns in dump order. Throws on any error, never returns partial rows. */
export function parseRelicSuitsSql(text) {
  return parseDump(text, 'relic_suits', relicSuitColumns)
}

/** Read UTF-8 dumps and return { heroes, relicSuits } only after BOTH validate. No DB, SQL execution, or filesystem writes. */
export async function readCatalogSqlFiles({ heroesPath, relicSuitsPath }) {
  const buffers = await Promise.all([readFile(heroesPath), readFile(relicSuitsPath)])
  const decoder = new TextDecoder('utf-8', { fatal: true })
  const heroes = parseHeroesSql(decoder.decode(buffers[0]))
  const relicSuits = parseRelicSuitsSql(decoder.decode(buffers[1]))
  return { heroes, relicSuits }
}
