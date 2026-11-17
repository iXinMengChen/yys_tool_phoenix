import {
  Download,
  ExternalLink,
  Info,
  LoaderCircle,
  Monitor,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DesktopReleaseInfo } from "@phoenix/types";
import { compareVersions, parseDesktopReleaseResponse } from "@/lib/desktopRelease";

const releaseEndpoint = import.meta.env.VITE_DESKTOP_VERSION_URL?.trim();
type ReleaseState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "error"; message: string }
  | { status: "ready"; release: DesktopReleaseInfo; hasUpdate: boolean };
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
const updateReminderKey = "phoenix-desktop-update-reminders";
const readUpdateReminders = () => { try { return localStorage.getItem(updateReminderKey) !== "false"; } catch { return true; } };

/** 展示由 Tauri 读取的应用版本，避免与打包版本号重复维护。 */
export function AboutSection() {
  const [version, setVersion] = useState<string | null>(null);
  const isDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  const [releaseState, setReleaseState] = useState<ReleaseState>({ status: "idle" });
  const [versionError, setVersionError] = useState("");
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState("");
  const [updateReminders, setUpdateReminders] = useState(readUpdateReminders);
  const mounted = useRef(true);
  const busy = useRef(false);

  async function checkRelease() {
    if (!releaseEndpoint || !isDesktop || !window.desktop || busy.current) return;
    busy.current = true;
    setReleaseState({ status: "checking" });
    setOpenError("");
    try {
      const current = await window.desktop.getAppVersion();
      const release = parseDesktopReleaseResponse(await window.desktop.getDesktopRelease(releaseEndpoint));
      const hasUpdate = release.configured && compareVersions(release.version, current) > 0;
      if (mounted.current) {
        setVersion(current);
        setVersionError("");
        setReleaseState({ status: "ready", release, hasUpdate });
      }
    } catch (error) {
      if (mounted.current) setReleaseState({ status: "error", message: errorText(error) });
    } finally {
      busy.current = false;
    }
  }

  async function openDownload() {
    if (releaseState.status !== "ready" || !releaseState.hasUpdate || !releaseState.release.configured || !window.desktop || busy.current) return;
    busy.current = true;
    setOpening(true);
    setOpenError("");
    try {
      await window.desktop.openDesktopDownload(releaseState.release.downloadUrl);
    } catch (error) {
      if (mounted.current) setOpenError(errorText(error));
    } finally {
      busy.current = false;
      if (mounted.current) setOpening(false);
    }
  }

  useEffect(() => {
    let isMounted = true;
    mounted.current = true;
    const desktop = window.desktop;
    if (!desktop || !isDesktop) return;

    void desktop
      .getAppVersion()
      .then((nextVersion) => {
        if (isMounted) setVersion(nextVersion);
      })
      .catch((error: unknown) => {
        if (isMounted) setVersionError(errorText(error));
      });

    return () => {
      isMounted = false;
      mounted.current = false;
    };
  }, [isDesktop]);

  const releaseSummary = !releaseEndpoint
    ? "此版本暂不支持在线检查更新。"
    : !isDesktop
      ? "请在桌面版中检查更新。"
      : releaseState.status === "checking"
        ? "正在检查版本…"
        : releaseState.status === "idle"
          ? "点击检查更新，获取最新发布版本。"
          : releaseState.status === "error"
            ? `检查更新失败，请检查网络后重试。`
            : !releaseState.release.configured
              ? "暂未发布可用的更新信息。"
              : `最新版本 v${releaseState.release.version} · ${releaseState.hasUpdate ? "有新版本可用" : "当前版本无需更新"}`;

  return (
    <section className="space-y-4" aria-labelledby="settings-about-title">
      <h2 id="settings-about-title" className="text-xl font-semibold tracking-tight">
        关于号来 Phoenix
      </h2>
      <div className="space-y-6 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
            <Monitor size={24} strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold">号来 Phoenix</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              号来是一款用于查看阴阳师藏宝阁账号的桌面工具，将账号资料、式神、御魂库存与御魂计算集中呈现，帮助你更直观地判断账号练度与御魂潜力。
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-y border-border py-3 text-sm">
          <Info size={16} className="text-muted-foreground" aria-hidden="true" />
          <span className="text-muted-foreground">当前版本</span>
          <strong className="tabular-nums">{!isDesktop ? "开发环境" : version ? `v${version}` : versionError ? "读取失败" : "读取中…"}</strong>
        </div>

        {versionError && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">读取当前版本失败：{versionError}。请重新打开关于页重试。</p>}
        <section className="space-y-4" aria-label="软件更新">
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={updateReminders} onChange={(event) => {
            const enabled = event.target.checked
            setUpdateReminders(enabled)
            localStorage.setItem(updateReminderKey, String(enabled))
            window.dispatchEvent(new Event("phoenix-update-reminders-changed"))
          }} />启动时提醒新版本</label>
          <div aria-live="polite" aria-busy={releaseState.status === "checking"}>
            <h3 className="text-base font-semibold">软件更新</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{releaseSummary}</p>
            {releaseState.status === "ready" && releaseState.release.configured && (
              <>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">{releaseState.release.notes || "本版本未提供更新说明。"}</p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">点击后将打开下载页面，请手动下载并安装。</p>
              </>
            )}
            {openError && <p role="alert" className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">打开下载页面失败：{openError}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              disabled={!releaseEndpoint || !isDesktop || opening}
              onClick={() => void checkRelease()}
            >
              {releaseState.status === "checking" ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
              {releaseState.status === "checking" ? "检查中…" : "检查更新"}
            </button>
            {releaseState.status === "ready" && releaseState.hasUpdate && (
              <button
                type="button"
                className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                disabled={opening}
                onClick={() => void openDownload()}
              >
                {opening ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
                {opening ? "正在打开…" : "打开下载页面（手动安装）"}
              </button>
            )}
          </div>
        </section>

        {isDesktop && (
          <section className="rounded-xl bg-muted/50 p-4" aria-labelledby="cbg-window-title">
            <div className="flex items-start gap-3">
              <ExternalLink size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <h3 id="cbg-window-title" className="text-base font-semibold">藏宝阁独立窗口</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  在账号查询页选择登录渠道，再点击“打开藏宝阁登录”；顶部“藏宝阁登录”按钮也可打开当前渠道。登录后浏览商品详情，开启“自动读取”时会同步到主窗口。
                </p>
              </div>
            </div>
          </section>
        )}

        <section className="space-y-3" aria-labelledby="about-privacy-title">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-primary" aria-hidden="true" />
            <h2 id="about-privacy-title" className="text-base font-semibold">数据处理与加密</h2>
          </div>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
            <li>登录、读取商品、更新资料和下载图片需要联网。账号分析与御魂计算在本机完成，商品链接和账号摘要不会自动上传。</li>
            <li>账号记录、历史和应用偏好保存在本机；这些资料不会额外加密。</li>
            <li>Windows 版会加密保存登录信息，以便下次继续使用藏宝阁；加密由当前 Windows 账户保护，登录信息不会发送到本项目的服务器。</li>
          </ul>
        </section>

        <section className="border-t border-border pt-5" aria-labelledby="about-prologue-title">
          <h2 id="about-prologue-title" className="text-base font-semibold">《号来》</h2>
          <div className="mt-3 max-w-3xl space-y-3 text-sm leading-7 text-muted-foreground">
            <p>藏宝阁的页面刷新了。</p>
            <p>我，又一次出现在“已上架”列表里。</p>
            <p>“号来”——他们渴望我，他们点开我的式神录，查我的皮肤、头像框、签到天数，像翻阅一具古董的铭文。</p>
            <p>可他们不知道，我是活的。</p>
            <p>我记得每一个把我“挂上去”的人：熬夜挖土的，氪金抽卡骂策划的，最后一秒反悔又下架的。他们以为交易的是数据，其实，是我在挑选下一个宿主。</p>
            <p>“已售出”三个字亮起时，不是我被买走了，是我决定——再活一次。</p>
            <p>号来。来者不拒。来者，皆是过客。</p>
          </div>
        </section>
      </div>
    </section>
  );
}
