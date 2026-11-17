/** 静态图标由 Tauri 自定义协议映射到用户数据目录或安装包内资源。 */
export function assetUrl(path: string): string {
  const normalized = path.replace(/^\/+/, "");
  const iconMatch = normalized.match(
    /^(?:heroes|suits|currency|decocardhouse|headskin|sceneskin|badge|yingyuan)\/(\d+)\.png$/,
  );
  const skinMatch = normalized.match(/^skins\/(\d+)\/(\d+)\.png$/);
  // 兼容历史裸 UI 文件名，但不能把未知目录、URL、穿越路径兜底到 ui。
  const uiMatch = normalized.match(/^(?:ui\/)?([a-z0-9_-]+\.(?:png|svg))$/);
  const ids = iconMatch?.slice(1) ?? skinMatch?.slice(1);
  const validIds = ids?.every((id) => {
    const value = BigInt(id);
    return value > 0n && value <= 18_446_744_073_709_551_615n;
  });
  const relative = validIds ? normalized : uiMatch ? `ui/${uiMatch[1]}` : "";
  if (!relative) return "";

  const inTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  // Windows WebView2 会把 Tauri 自定义协议映射为 http://<scheme>.localhost；
  // 其他桌面端继续使用标准的 <scheme>://localhost 形式。
  const tauriAssetBaseUrl =
    typeof navigator !== "undefined" && navigator.userAgent.includes("Windows")
      ? "http://yys-cbg-assets.localhost"
      : "yys-cbg-assets://localhost";
  // 原生模式缓存优先，开发时协议也回退到共享资源；浏览器预览由 Vite 提供。
  const base = inTauri ? tauriAssetBaseUrl : "/haolai";
  const resourcePath = base === "/haolai" && relative.startsWith("ui/")
    ? relative.slice(3)
    : relative;
  return `${base}/${resourcePath}`;
}
