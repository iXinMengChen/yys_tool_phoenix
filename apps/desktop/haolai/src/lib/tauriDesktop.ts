import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { CbgPanelBounds } from "@/types/layout";
import type { CbgChannel } from "@/types";
import type { AccountMatcherCriteria } from "@/lib/accountMatcher";
import type { StaticAssetUpdateResult } from "@/types/assets";

type ComputeCapacity = {
  logicalCores: number;
  totalMemoryMb: number;
  freeMemoryMb: number;
};

const isTauriRuntime =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function browserCapacity(): ComputeCapacity {
  return {
    logicalCores: Math.max(1, navigator.hardwareConcurrency || 1),
    totalMemoryMb: 0,
    freeMemoryMb: 0,
  };
}

function unsupportedInBrowser(operation: string): Promise<never> {
  return Promise.reject(new Error(`${operation}仅支持桌面版，请在桌面应用中使用。`));
}

function logDevIpc(command: string, payload?: unknown): void {
  if (import.meta.env.DEV) {
    console.info(`[Tauri IPC] ${command}`, payload ?? "");
  }
}

/**
 * 商品读取共用藏宝阁登录窗口，用串行队列限制同一时刻只执行一次主动读取。
 * Rust 为每次读取分配 requestId，使用独立于被动页面捕获的取数槽位；
 * 超时后即使旧响应迟到，也不能满足下一次读取。队列失败后仍继续放行。
 */
let productRequestTail: Promise<unknown> = Promise.resolve();

function runProductRequest<T>(task: () => Promise<T>): Promise<T> {
  // 上一个请求无论成功还是失败都要继续放行，避免一次失败把队列堵死。
  const result = productRequestTail.then(task, task);
  productRequestTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/** 将页面需要的桌面能力集中映射到 Tauri command。 */
export function installTauriDesktopBridge(): void {
  if (window.desktop) return;

  if (!isTauriRuntime) {
    window.desktop = {
      getAppVersion: () => unsupportedInBrowser("读取桌面版本"),
      getDesktopRelease: () => unsupportedInBrowser("检查桌面版本"),
      openDesktopDownload: () => unsupportedInBrowser("打开桌面下载页面"),
      hideMainWindow: () => unsupportedInBrowser("隐藏主程序窗口"),
      scheduleBackgroundSearch: () => unsupportedInBrowser("安排后台搜索时间"),
      setBackgroundSearchRunning: () =>
        unsupportedInBrowser("设置后台搜索状态"),
      getComputeCapacity: async () => browserCapacity(),
      loadProduct: (request) =>
        unsupportedInBrowser(`读取藏宝阁商品（${request.ordersn}）`),
      loadProductRaw: (request) =>
        unsupportedInBrowser(`读取藏宝阁商品（${request.ordersn}）`),
      toggleCbgWindow: () => unsupportedInBrowser("打开藏宝阁窗口"),
      setCbgWebview: () => unsupportedInBrowser("显示藏宝阁页面"),
      setCbgWindowFullscreen: () => unsupportedInBrowser("切换藏宝阁全屏"),
      getCbgLoginStatus: async () => null,
      applyCbgRoleSearch: () => unsupportedInBrowser("自动填写藏宝阁筛选条件"),
      readCbgRoleResults: () => unsupportedInBrowser("读取藏宝阁筛选结果"),
      nextCbgRoleResultsPage: () =>
        unsupportedInBrowser("翻页读取藏宝阁筛选结果"),
      takeCbgPageCapture: async () => null,
      readStaticData: async () => null,
      updateStaticData: () => unsupportedInBrowser("更新资料"),
      saveStaticData: () => unsupportedInBrowser("保存静态资料"),
      updateStaticAssets: () => unsupportedInBrowser("更新资料"),
      openDownloadsFolder: () => unsupportedInBrowser("打开下载目录"),
      onOpenMaintenance: () => () => undefined,
    };
    return;
  }

  window.desktop = {
    getAppVersion: () => invoke<string>("get_app_version"),
    getDesktopRelease: (endpoint) => invoke<unknown>("get_desktop_release", { endpoint }),
    openDesktopDownload: (url) => invoke<void>("open_desktop_download", { url }),
    hideMainWindow: () => invoke<void>("hide_main_window"),
    scheduleBackgroundSearch: (intervalMinutes, taskId) =>
      invoke<void>("schedule_background_search", { intervalMinutes, taskId }),
    setBackgroundSearchRunning: (running) =>
      invoke<void>("set_background_search_running", { running }),
    getComputeCapacity: () => invoke<ComputeCapacity>("get_compute_capacity"),
    loadProduct: (request) => {
      logDevIpc("load_product", { channel: request.channel });
      return runProductRequest(() =>
        invoke<unknown>("load_product", { request }),
      );
    },
    loadProductRaw: (request) => {
      logDevIpc("load_product_raw", { channel: request.channel });
      return runProductRequest(() =>
        invoke<string>("load_product_raw", { request }).catch((error) => {
          const message =
            error instanceof Error ? error.message : String(error);
          if (!/command\s+load_product_raw\s+not found/i.test(message)) {
            throw error;
          }
          logDevIpc("load_product_raw unavailable; using load_product");
          return invoke<unknown>("load_product", { request });
        }),
      );
    },
    toggleCbgWindow: (channel) =>
      invoke<boolean>("toggle_cbg_window", { channel }),
    setCbgWebview: (channel: CbgChannel, bounds: CbgPanelBounds) =>
      invoke<void>("set_cbg_webview", { channel, bounds }),
    setCbgWindowFullscreen: (channel, fullscreen) =>
      invoke<void>("set_cbg_window_fullscreen", { channel, fullscreen }),
    getCbgLoginStatus: (channel) =>
      invoke<boolean | null>("get_cbg_login_status", { channel }),
    applyCbgRoleSearch: (
      criteria: AccountMatcherCriteria,
      options?: { background?: boolean },
    ) =>
      invoke<{
        status: "submitted";
        applied: string[];
        url?: string;
        localOnlyCriteria?: boolean;
      }>("apply_cbg_role_search", {
        criteria,
        background: options?.background ?? false,
      }),
    readCbgRoleResults: () =>
      invoke<
        Awaited<
          ReturnType<NonNullable<Window["desktop"]>["readCbgRoleResults"]>
        >
      >("read_cbg_role_results"),
    nextCbgRoleResultsPage: () => invoke<boolean>("next_cbg_role_results_page"),
    takeCbgPageCapture: () =>
      invoke<{ pageUrl: string; payload: unknown } | null>(
        "take_cbg_page_capture",
      ),
    readStaticData: (endpoint) =>
      invoke<unknown>("read_static_data", { endpoint }),
    updateStaticData: (endpoint) => {
      logDevIpc("update_static_data", endpoint);
      return invoke<unknown>("update_static_data", { endpoint });
    },
    saveStaticData: (endpoint, data) =>
      invoke<unknown>("save_static_data", { endpoint, data }),
    updateStaticAssets: (request) => {
      logDevIpc("update_static_assets", {
        heroCount: request.heroIds.length,
        suitCount: request.suitIds.length,
      });
      return invoke<StaticAssetUpdateResult>("update_static_assets", {
        request,
      });
    },
    openDownloadsFolder: () => invoke<void>("open_downloads_folder"),
    onOpenMaintenance(listener) {
      let disposed = false;
      let unlisten: (() => void) | undefined;

      void listen("maintenance:open", () => {
        if (!disposed) listener();
      }).then((cleanup) => {
        if (disposed) {
          cleanup();
        } else {
          unlisten = cleanup;
        }
      });

      return () => {
        disposed = true;
        unlisten?.();
      };
    },
  };
}
