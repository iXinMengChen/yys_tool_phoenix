/** 公开的桌面版本公告；仅引导下载，不是 Tauri 自动更新清单。 */
export type DesktopReleaseInfo =
  | { configured: false }
  | { configured: true; version: string; downloadUrl: string; notes: string }
