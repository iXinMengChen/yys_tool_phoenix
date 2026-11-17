import type { DesktopReleaseInfo } from '@phoenix/types'

const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

function parseVersion(version: string) {
  const match = semver.exec(version)
  if (!match || match[0] !== version) throw new Error('版本信息无法识别，请稍后重新检查更新。')
  const prerelease = match[4]?.split('.') ?? []
  if (prerelease.some((part) => /^\d+$/.test(part) && part.length > 1 && part[0] === '0')) {
    throw new Error('测试版版本信息无法识别，请稍后重新检查更新。')
  }
  return { core: match.slice(1, 4).map(BigInt), prerelease }
}

/** SemVer precedence, including arbitrarily large numeric identifiers. */
export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left)
  const b = parseVersion(right)
  for (let index = 0; index < 3; index++) {
    if (a.core[index] !== b.core[index]) return a.core[index] > b.core[index] ? 1 : -1
  }
  if (!a.prerelease.length || !b.prerelease.length) {
    return Number(!a.prerelease.length) - Number(!b.prerelease.length)
  }
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index++) {
    const x = a.prerelease[index]
    const y = b.prerelease[index]
    if (x === y) continue
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1
    const numericX = /^\d+$/.test(x)
    const numericY = /^\d+$/.test(y)
    if (numericX && numericY) return BigInt(x) > BigInt(y) ? 1 : -1
    if (numericX !== numericY) return numericX ? -1 : 1
    return x > y ? 1 : -1
  }
  return 0
}

export function validateDownloadUrl(value: string): string {
  const url = new URL(value)
  if (value.length > 2048 || url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
    throw new Error('下载链接不符合安全要求，请稍后重新检查更新。')
  }
  return url.href
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Validate the API envelope and discriminated release contract at the IPC boundary. */
export function parseDesktopReleaseResponse(value: unknown): DesktopReleaseInfo {
  if (!isRecord(value) || value.code !== 200 || value.message !== 'success' || !isRecord(value.data)) {
    throw new Error('更新信息无法识别，请稍后重新检查更新。')
  }
  const data = value.data
  if (data.configured === false && Object.keys(data).length === 1) return { configured: false }
  if (data.configured !== true || typeof data.version !== 'string' || typeof data.downloadUrl !== 'string' ||
      typeof data.notes !== 'string' || data.notes.length > 16000 || Object.keys(data).some((key) => !['configured', 'version', 'downloadUrl', 'notes'].includes(key))) {
    throw new Error('更新信息不完整，请稍后重新检查更新。')
  }
  parseVersion(data.version)
  return { configured: true, version: data.version, downloadUrl: validateDownloadUrl(data.downloadUrl), notes: data.notes }
}
