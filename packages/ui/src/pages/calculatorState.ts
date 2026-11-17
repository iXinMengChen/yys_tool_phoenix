import type { HeroBaseStats, SavedCalculatorConfig } from '@phoenix/types'
import { defaultExtraAttributes, extraAttributeFields, mainAttributeOptions, metricOptions, panelFields } from '@phoenix/utils'

export type MainAttributes = SavedCalculatorConfig['mainAttributes']
export type CalculatorConfig = SavedCalculatorConfig & { heroName: string; baseStats: HeroBaseStats }
export type CalculatorLibrary = { singles: CalculatorConfig[] }
export const calculatorLibraryKey = 'haolai-calculator-library-v1'

export function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10000000
}
function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 200
}
function stringList(value: unknown, limit: number): string[] | null {
  return Array.isArray(value) && value.length <= limit && value.every(isText) ? [...new Set(value)] : null
}

/** localStorage 是外部输入；兼容先前单人配置的嵌套格式，仅提取已知字段。 */
function parseConfig(value: unknown): CalculatorConfig | null {
  if (!isRecord(value) || !isText(value.id) || !isText(value.label) || !isNumber(value.resultLimit) || !Number.isInteger(value.resultLimit) || value.resultLimit < 1 || value.resultLimit > 50) return null
  const legacy = isRecord(value.member) ? value.member : null
  const fields = legacy && isRecord(legacy.config) ? legacy.config : value
  const rawBaseStats = legacy ? legacy.baseStats : value.baseStats
  const heroName = legacy ? legacy.heroName : value.heroName
  const metric = metricOptions.find(option => option.value === (legacy ? fields.targetAttribute : fields.metric))?.value
  if (!isRecord(rawBaseStats) || !isText(heroName) || !metric || !isRecord(fields.constraints) || !isRecord(fields.extraAttributes)) return null
  if (fields.heroId !== undefined && (!isNumber(fields.heroId) || !Number.isInteger(fields.heroId))) return null
  const baseStats: HeroBaseStats = { attack: 0, health: 0, defense: 0, speed: 0, critRate: 0, critDamage: 0, effectHit: 0, effectResistance: 0 }
  const constraints: CalculatorConfig['constraints'] = {}
  for (const { key } of panelFields) {
    const number = rawBaseStats[key]
    if (!isNumber(number)) return null
    baseStats[key] = number
    const range = fields.constraints[key]
    if (range !== undefined) {
      if (!isRecord(range) || (range.min !== undefined && !isNumber(range.min)) || (range.max !== undefined && !isNumber(range.max))) return null
      const min = range.min, max = range.max
      if (typeof min === 'number' && typeof max === 'number' && min > max) return null
      constraints[key] = { min: typeof min === 'number' ? min : undefined, max: typeof max === 'number' ? max : undefined }
    }
  }
  const extraAttributes = { ...defaultExtraAttributes }
  for (const { key } of extraAttributeFields) {
    const number = fields.extraAttributes[key]
    if (!isNumber(number)) return null
    extraAttributes[key] = number
  }
  const mainAttributes: MainAttributes = {}
  if (fields.mainAttributes !== undefined) {
    if (!isRecord(fields.mainAttributes)) return null
    for (const position of [2, 4, 6] as const) {
      if (fields.mainAttributes[position] === undefined) continue
      const labels = stringList(fields.mainAttributes[position], mainAttributeOptions[position].length)
      if (!labels || labels.some(label => !mainAttributeOptions[position].includes(label))) return null
      mainAttributes[position] = labels
    }
  }
  const selection = legacy ? { fourPiece: fields.requiredFourPiece, twoPieceAttributes: fields.requiredTwoPieceAttributes, omaTwoPieces: fields.requiredTwoPieceNames } : value.relicSuitSelection
  if (!isRecord(selection)) return null
  const twoPieceAttributes = stringList(selection.twoPieceAttributes, 3)
  const omaTwoPieces = stringList(selection.omaTwoPieces, 3)
  if (!twoPieceAttributes || !omaTwoPieces || (selection.fourPiece !== undefined && !isText(selection.fourPiece))) return null
  if (twoPieceAttributes.length + omaTwoPieces.length > (selection.fourPiece ? 1 : 3)) return null
  return {
    id: value.id, label: value.label, resultLimit: value.resultLimit, heroName, baseStats,
    heroId: typeof fields.heroId === 'number' ? fields.heroId : undefined, metric, constraints, extraAttributes, mainAttributes,
    relicSuitSelection: { fourPiece: typeof selection.fourPiece === 'string' ? selection.fourPiece : undefined, twoPieceAttributes, omaTwoPieces },
  }
}

export function parseCalculatorLibrary(serialized: string | null): CalculatorLibrary {
  if (!serialized) return { singles: [] }
  const value: unknown = JSON.parse(serialized)
  if (!isRecord(value) || !Array.isArray(value.singles)) throw new Error('配置库格式无效')
  const singles: CalculatorConfig[] = []
  for (const item of value.singles.slice(-50)) {
    const config = parseConfig(item)
    if (config && !singles.some(existing => existing.id === config.id)) singles.push(config)
  }
  return { singles }
}
