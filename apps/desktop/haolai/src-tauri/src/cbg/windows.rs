use super::session::{has_saved_cbg_login_cookie, load_cbg_cookies, restore_cbg_cookies};
use super::webview::CBG_CAPTURE_SCRIPT;
use super::{CbgChannel, CBG_BROWSER_LABEL, CBG_SHELL_LABEL};
use reqwest::Url;
use serde::Deserialize;
use std::sync::Mutex;
use tauri::{
    Emitter, LogicalPosition, LogicalSize, Manager, Position, Size, WebviewBuilder, WebviewUrl,
    WebviewWindowBuilder,
};

static CBG_WINDOW_CREATION_LOCK: Mutex<()> = Mutex::new(());
static CBG_BROWSER_CHANNEL: Mutex<Option<CbgChannel>> = Mutex::new(None);

fn should_navigate_cbg_browser(active_channel: Option<CbgChannel>, channel: CbgChannel) -> bool {
    active_channel != Some(channel)
}

#[derive(Debug, Deserialize)]
pub(crate) struct CbgPanelBounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

impl CbgPanelBounds {
    fn is_valid(&self) -> bool {
        self.x.is_finite()
            && self.y.is_finite()
            && self.width.is_finite()
            && self.height.is_finite()
            && self.x >= 0.0
            && self.y >= 0.0
            && self.width >= 1.0
            && self.height >= 1.0
    }
}

pub(crate) fn should_create_cbg_window(window_exists: bool) -> bool {
    !window_exists
}

fn cbg_window_position(app: &tauri::AppHandle) -> Option<(f64, f64)> {
    let main = app.get_webview_window("main")?;
    let monitor = main.current_monitor().ok().flatten()?;
    let main_position = main.outer_position().ok()?;
    let main_size = main.outer_size().ok()?;
    let scale = main.scale_factor().ok()?;
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let width = (960.0 * scale).round() as i32;
    let height = (800.0 * scale).round() as i32;
    let right_edge = monitor_position.x + monitor_size.width as i32;
    let bottom_edge = monitor_position.y + monitor_size.height as i32;
    let x = (main_position.x + main_size.width as i32).clamp(
        monitor_position.x,
        (right_edge - width).max(monitor_position.x),
    );
    let y = main_position.y.clamp(
        monitor_position.y,
        (bottom_edge - height).max(monitor_position.y),
    );
    Some((x as f64 / scale, y as f64 / scale))
}

#[tauri::command]
pub(crate) async fn toggle_cbg_window(
    app: tauri::AppHandle,
    channel: CbgChannel,
) -> Result<bool, String> {
    if let Some(window) = app.get_window(CBG_SHELL_LABEL) {
        if window
            .is_visible()
            .map_err(|error| format!("无法读取藏宝阁窗口状态：{error}"))?
        {
            let fullscreen = window
                .is_fullscreen()
                .map_err(|error| format!("无法读取藏宝阁全屏状态：{error}"))?;
            window
                .hide()
                .map_err(|error| format!("无法收起藏宝阁窗口：{error}"))?;
            return Ok(fullscreen);
        }
        window
            .emit("cbg-window:channel", channel.label())
            .map_err(|error| format!("无法切换藏宝阁区服：{error}"))?;
        window
            .show()
            .and_then(|()| window.set_focus())
            .map_err(|error| format!("无法显示藏宝阁窗口：{error}"))?;
        return window
            .is_fullscreen()
            .map_err(|error| format!("无法读取藏宝阁全屏状态：{error}"));
    }

    create_cbg_window(&app, channel, true).map(|_| false)
}

pub(crate) fn create_cbg_window(
    app: &tauri::AppHandle,
    channel: CbgChannel,
    visible: bool,
) -> Result<(), String> {
    let _creation_guard = CBG_WINDOW_CREATION_LOCK
        .lock()
        .map_err(|_| "藏宝阁窗口状态异常".to_owned())?;
    if let Some(window) = app.get_window(CBG_SHELL_LABEL) {
        window
            .emit("cbg-window:channel", channel.label())
            .map_err(|error| format!("无法显示独立藏宝阁窗口：{error}"))?;
        if visible {
            window
                .show()
                .and_then(|()| window.set_focus())
                .map_err(|error| format!("无法显示独立藏宝阁窗口：{error}"))?;
        }
        return Ok(());
    }

    let url = WebviewUrl::App(std::path::PathBuf::from(format!(
        "index.html#/cbg-window?channel={}",
        channel.label()
    )));
    let builder = WebviewWindowBuilder::new(app, CBG_SHELL_LABEL, url)
        .title("藏宝阁")
        .inner_size(960.0, 800.0)
        .min_inner_size(720.0, 560.0)
        .resizable(true)
        .visible(visible);
    let builder = if let Some((x, y)) = cbg_window_position(&app) {
        builder.position(x, y)
    } else {
        builder.center()
    };
    let window = builder
        .build()
        .map_err(|error| format!("无法打开独立藏宝阁窗口：{error}"))?;

    if visible {
        window
            .show()
            .and_then(|()| window.set_focus())
            .map_err(|error| format!("无法显示独立藏宝阁窗口：{error}"))?;
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn set_cbg_webview(
    app: tauri::AppHandle,
    channel: CbgChannel,
    bounds: CbgPanelBounds,
) -> Result<(), String> {
    if !bounds.is_valid() {
        return Err("藏宝阁页面尺寸无效".to_owned());
    }
    let position = Position::Logical(LogicalPosition::new(bounds.x, bounds.y));
    let size = Size::Logical(LogicalSize::new(bounds.width, bounds.height));
    let url = Url::parse(&format!("https://{}/", channel.host()))
        .map_err(|_| "藏宝阁地址无效".to_owned())?;

    let mut active_channel = CBG_BROWSER_CHANNEL
        .lock()
        .map_err(|_| "藏宝阁渠道状态异常".to_owned())?;
    let webview = if let Some(webview) = app.get_webview(CBG_BROWSER_LABEL) {
        // 登录可跳转到其他网易认证域名；尺寸同步不能以当前域名判断渠道切换。
        if should_navigate_cbg_browser(*active_channel, channel) {
            if let Some(cookies) = load_cbg_cookies(&app, channel).ok().flatten() {
                if has_saved_cbg_login_cookie(&cookies) {
                    restore_cbg_cookies(&webview, channel, &cookies)?;
                }
            }
            webview
                .navigate(url)
                .map_err(|error| format!("无法切换藏宝阁区服：{error}"))?;
        }
        webview
    } else {
        let window = app
            .get_window(CBG_SHELL_LABEL)
            .ok_or_else(|| "找不到藏宝阁独立窗口".to_owned())?;
        let saved_cookies = load_cbg_cookies(&app, channel)
            .ok()
            .flatten()
            .filter(|cookies| has_saved_cbg_login_cookie(cookies));
        let initial_url = if saved_cookies.is_some() {
            Url::parse("about:blank").map_err(|_| "藏宝阁地址无效".to_owned())?
        } else {
            url.clone()
        };
        let webview = window
            .add_child(
                WebviewBuilder::new(CBG_BROWSER_LABEL, WebviewUrl::External(initial_url))
                    .initialization_script(CBG_CAPTURE_SCRIPT),
                position,
                size,
            )
            .map_err(|error| format!("无法创建藏宝阁页面：{error}"))?;
        if let Some(cookies) = saved_cookies {
            restore_cbg_cookies(&webview, channel, &cookies)?;
            webview
                .navigate(url)
                .map_err(|error| format!("无法恢复藏宝阁页面：{error}"))?;
        }
        webview
    };
    *active_channel = Some(channel);

    webview
        .set_bounds(tauri::Rect { position, size })
        .and_then(|()| webview.show())
        .map_err(|error| format!("无法显示藏宝阁页面：{error}"))
}

#[tauri::command]
pub(crate) async fn set_cbg_window_fullscreen(
    app: tauri::AppHandle,
    channel: CbgChannel,
    fullscreen: bool,
) -> Result<(), String> {
    let window = match app.get_window(CBG_SHELL_LABEL) {
        Some(window) => window,
        None if fullscreen => {
            create_cbg_window(&app, channel, true)?;
            app.get_window(CBG_SHELL_LABEL)
                .ok_or_else(|| "藏宝阁窗口创建后仍不可用".to_owned())?
        }
        None => return Ok(()),
    };
    if fullscreen {
        window
            .emit("cbg-window:channel", channel.label())
            .map_err(|error| format!("无法切换藏宝阁区服：{error}"))?;
        window
            .show()
            .and_then(|()| window.set_focus())
            .map_err(|error| format!("无法显示独立藏宝阁窗口：{error}"))?;
    }
    window
        .set_fullscreen(fullscreen)
        .map_err(|error| format!("无法切换藏宝阁全屏状态：{error}"))
}

#[cfg(test)]
mod tests {
    use super::{should_navigate_cbg_browser, CbgChannel, CbgPanelBounds};

    #[test]
    fn resizing_during_login_keeps_the_selected_channel_page() {
        for channel in [
            CbgChannel::Official,
            CbgChannel::Huawei,
            CbgChannel::Oppo,
            CbgChannel::Vivo,
            CbgChannel::Xiaomi,
        ] {
            // 当前 URL 即使变成认证页，也不参与是否导航的判断。
            assert!(!should_navigate_cbg_browser(Some(channel), channel));
        }
        assert!(should_navigate_cbg_browser(
            Some(CbgChannel::Official),
            CbgChannel::Huawei
        ));
        assert!(should_navigate_cbg_browser(None, CbgChannel::Official));
    }

    #[test]
    fn reuses_shell_window_even_when_it_contains_child_webviews() {
        // `get_webview_window` stops matching a shell after `cbg-browser` is added;
        // shell existence must therefore come from the window registry.
        assert!(!super::should_create_cbg_window(true));
        assert!(super::should_create_cbg_window(false));
        // Search must pass existence, not absence, into this predicate.
        assert!(include_str!("search.rs")
            .contains("should_create_cbg_window(app.get_window(CBG_SHELL_LABEL).is_some())"));
    }

    #[test]
    fn accepts_only_finite_positive_panel_bounds() {
        assert!(CbgPanelBounds {
            x: 10.0,
            y: 20.0,
            width: 800.0,
            height: 600.0,
        }
        .is_valid());
        assert!(!CbgPanelBounds {
            x: 0.0,
            y: 0.0,
            width: f64::NAN,
            height: 600.0,
        }
        .is_valid());
    }
}
