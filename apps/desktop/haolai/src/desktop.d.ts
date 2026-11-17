export {};

import type { CbgChannel } from "./types";
import type { CbgPanelBounds } from "./types/layout";
import type { AccountMatcherCriteria } from "./lib/accountMatcher";
import type { StaticAssetUpdateRequest, StaticAssetUpdateResult } from "./types/assets";

declare global {
  interface Window {
    desktop?: {
      getAppVersion(): Promise<string>;
      getDesktopRelease(endpoint: string): Promise<unknown>;
      openDesktopDownload(url: string): Promise<void>;
      hideMainWindow(): Promise<void>;
      scheduleBackgroundSearch(
        intervalMinutes: number,
        taskId: number,
      ): Promise<void>;
      setBackgroundSearchRunning(running: boolean): Promise<void>;
      getComputeCapacity(): Promise<{
        logicalCores: number;
        totalMemoryMb: number;
        freeMemoryMb: number;
      }>;
      loadProduct(request: {
        serverid: string;
        ordersn: string;
        channel: CbgChannel;
        sourceUrl: string;
        viewLoc?: string;
        tfid?: string;
        tcid?: string;
      }): Promise<unknown>;
      loadProductRaw(request: {
        serverid: string;
        ordersn: string;
        channel: CbgChannel;
        sourceUrl: string;
        viewLoc?: string;
        tfid?: string;
        tcid?: string;
      }): Promise<unknown>;
      toggleCbgWindow(channel: CbgChannel): Promise<boolean>;
      setCbgWebview(channel: CbgChannel, bounds: CbgPanelBounds): Promise<void>;
      setCbgWindowFullscreen(
        channel: CbgChannel,
        fullscreen: boolean,
      ): Promise<void>;
      getCbgLoginStatus(channel: CbgChannel): Promise<boolean | null>;
      applyCbgRoleSearch(
        criteria: AccountMatcherCriteria,
        options?: { background?: boolean },
      ): Promise<{
        status: "submitted";
        applied: string[];
        url?: string;
        localOnlyCriteria?: boolean;
      }>;
      readCbgRoleResults(): Promise<{
        status:
          | "ready"
          | "empty"
          | "loading"
          | "login_required"
          | "security_check"
          | "not_role_search";
        pageUrl?: string;
        pageKey?: string;
        siteNotice?: string;
        candidates?: { url: string; summary?: string }[];
        hasNext?: boolean;
      }>;
      nextCbgRoleResultsPage(): Promise<boolean>;
      takeCbgPageCapture(): Promise<{
        pageUrl: string;
        payload: unknown;
      } | null>;
      readStaticData(endpoint: string): Promise<unknown>;
      updateStaticData(endpoint: string): Promise<unknown>;
      saveStaticData(endpoint: string, data: unknown): Promise<unknown>;
      updateStaticAssets(request: StaticAssetUpdateRequest): Promise<StaticAssetUpdateResult>;
      openDownloadsFolder(): Promise<void>;
      onOpenMaintenance(listener: () => void): () => void;
    };
  }
}
