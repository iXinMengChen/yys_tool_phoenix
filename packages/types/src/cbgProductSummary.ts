import type { CbgChannel } from './account.ts'

export type CbgProductSummaryUpload = {
  channel?: CbgChannel
  serverid: string
  ordersn: string
  summary: string
}

export type CbgProductSummaryReceipt = {
  id: string
  /** Client text is unverified; do not treat it as authoritative upstream data. */
  source: 'client_upload'
  uploadedAt: string
  expiresAt: string
}
