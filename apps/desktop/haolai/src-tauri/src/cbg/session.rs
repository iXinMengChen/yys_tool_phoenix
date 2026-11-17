use super::webview::CBG_CAPTURE_SCRIPT;
use super::{CbgChannel, CBG_BROWSER_LABEL};
use reqwest::Url;
use std::fs;
use std::path::PathBuf;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

#[cfg(windows)]
mod windows_dpapi {
    use std::{ffi::c_void, ptr, slice};

    #[repr(C)]
    struct DataBlob {
        size: u32,
        data: *mut u8,
    }

    #[link(name = "Crypt32")]
    extern "system" {
        fn CryptProtectData(
            input: *const DataBlob,
            description: *const u16,
            entropy: *const DataBlob,
            reserved: *mut c_void,
            prompt: *mut c_void,
            flags: u32,
            output: *mut DataBlob,
        ) -> i32;
        fn CryptUnprotectData(
            input: *const DataBlob,
            description: *mut *mut u16,
            entropy: *const DataBlob,
            reserved: *mut c_void,
            prompt: *mut c_void,
            flags: u32,
            output: *mut DataBlob,
        ) -> i32;
    }

    #[link(name = "Kernel32")]
    extern "system" {
        fn LocalFree(memory: *mut c_void) -> *mut c_void;
    }

    fn transform(input: &[u8], protect: bool) -> Result<Vec<u8>, String> {
        let size = u32::try_from(input.len()).map_err(|_| "登录信息过大".to_owned())?;
        let input = DataBlob {
            size,
            data: input.as_ptr().cast_mut(),
        };
        let mut entropy_bytes = b"com.yys.cbg.inspector.tauri/cbg-session/v1".to_vec();
        let entropy = DataBlob {
            size: entropy_bytes.len() as u32,
            data: entropy_bytes.as_mut_ptr(),
        };
        let mut output = DataBlob {
            size: 0,
            data: ptr::null_mut(),
        };
        let success = unsafe {
            if protect {
                CryptProtectData(
                    &input,
                    ptr::null(),
                    &entropy,
                    ptr::null_mut(),
                    ptr::null_mut(),
                    1,
                    &mut output,
                )
            } else {
                CryptUnprotectData(
                    &input,
                    ptr::null_mut(),
                    &entropy,
                    ptr::null_mut(),
                    ptr::null_mut(),
                    1,
                    &mut output,
                )
            }
        };
        entropy_bytes.fill(0);
        if success == 0 || output.data.is_null() {
            if !output.data.is_null() {
                unsafe {
                    LocalFree(output.data.cast());
                }
            }
            return Err("无法安全读取或保存藏宝阁登录状态".to_owned());
        }

        let result = unsafe { slice::from_raw_parts(output.data, output.size as usize).to_vec() };
        unsafe {
            LocalFree(output.data.cast());
        }
        Ok(result)
    }

    pub fn protect(input: &[u8]) -> Result<Vec<u8>, String> {
        transform(input, true)
    }

    pub fn unprotect(input: &[u8]) -> Result<Vec<u8>, String> {
        transform(input, false)
    }
}

#[cfg(not(windows))]
mod windows_dpapi {
    pub fn protect(_: &[u8]) -> Result<Vec<u8>, String> {
        Err("当前平台不支持加密保存藏宝阁登录状态".to_owned())
    }

    pub fn unprotect(_: &[u8]) -> Result<Vec<u8>, String> {
        Err("当前平台不支持加密读取藏宝阁登录状态".to_owned())
    }
}

fn cbg_cookie_path<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    channel: CbgChannel,
) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|_| "无法获取应用数据目录".to_owned())?
        .join("secrets")
        .join(format!("cbg-{}.bin", channel.label())))
}

fn is_cbg_auth_cookie(name: &str, value: &str) -> bool {
    matches!(
        name,
        "NTES_SESS"
            | "sid"
            | "NTES_PASSPORT"
            | "urs_share_login_token"
            | "urs_share_login_token_h5"
    ) && !value.is_empty()
}

pub(crate) fn has_cbg_login_cookie(cookies: &[tauri::webview::Cookie<'_>]) -> bool {
    cookies
        .iter()
        .any(|cookie| is_cbg_auth_cookie(cookie.name(), cookie.value()))
}

pub(crate) fn has_saved_cbg_login_cookie(cookies: &[String]) -> bool {
    cookies.iter().any(|value| {
        value
            .parse::<tauri::webview::Cookie<'static>>()
            .is_ok_and(|cookie| is_cbg_auth_cookie(cookie.name(), cookie.value()))
    })
}

fn saved_cbg_login_status(cookies: Option<&[String]>) -> Option<bool> {
    if cookies.is_some_and(has_saved_cbg_login_cookie) {
        None
    } else {
        Some(false)
    }
}

#[cfg(test)]
mod cbg_login_tests {
    use super::{cbg_cookies_to_restore, is_cbg_auth_cookie, saved_cbg_login_status, CbgChannel};

    #[test]
    fn saved_snapshot_never_overwrites_a_shared_live_login() {
        let saved = vec!["sid=old-session; Domain=yys.cbg.163.com; Path=/".to_owned()];
        let live = vec![tauri::webview::Cookie::new("sid", "current-session")];
        assert!(cbg_cookies_to_restore(CbgChannel::Official, &saved, &live)
            .unwrap()
            .is_empty());
        let visitor = vec![tauri::webview::Cookie::new("NTES_P_UTID", "visitor")];
        let restored = cbg_cookies_to_restore(CbgChannel::Official, &saved, &visitor).unwrap();
        assert_eq!(restored.len(), 1);
        assert_eq!(restored[0].value(), "old-session");
        assert_eq!(restored[0].domain(), Some("yys.cbg.163.com"));
    }

    #[test]
    fn recognizes_cbg_login_session_cookies_only_when_nonempty() {
        assert!(is_cbg_auth_cookie("NTES_SESS", "session"));
        assert!(is_cbg_auth_cookie("urs_share_login_token_h5", "token"));
        assert!(!is_cbg_auth_cookie("NTES_SESS", ""));
        assert!(!is_cbg_auth_cookie("NTES_P_UTID", "visitor"));
    }

    #[test]
    fn saved_login_cookie_is_unverified_without_a_live_cbg_page() {
        let cookies = vec!["NTES_SESS=session; Domain=yys.cbg.163.com; Path=/".to_owned()];
        assert_eq!(saved_cbg_login_status(Some(&cookies)), None);
        assert_eq!(saved_cbg_login_status(None), Some(false));
    }
}

pub(crate) fn load_cbg_cookies<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    channel: CbgChannel,
) -> Result<Option<Vec<String>>, String> {
    let path = cbg_cookie_path(app, channel)?;
    let encrypted = match fs::read(path) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("无法读取加密的藏宝阁登录状态".to_owned()),
    };
    let mut plaintext = windows_dpapi::unprotect(&encrypted)?;
    let cookies =
        serde_json::from_slice(&plaintext).map_err(|_| "加密的藏宝阁登录状态格式无效".to_owned());
    plaintext.fill(0);
    cookies.map(Some)
}

pub(crate) fn save_cbg_cookies<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    channel: CbgChannel,
    cookies: &[tauri::webview::Cookie<'_>],
) -> Result<(), String> {
    let values = cookies.iter().map(ToString::to_string).collect::<Vec<_>>();
    if !has_saved_cbg_login_cookie(&values) {
        return Err("未检测到藏宝阁登录凭据".to_owned());
    }
    if load_cbg_cookies(app, channel).ok().flatten().as_ref() == Some(&values) {
        return Ok(());
    }

    let path = cbg_cookie_path(app, channel)?;
    let parent = path
        .parent()
        .ok_or_else(|| "无法获取登录状态保存目录".to_owned())?;
    fs::create_dir_all(parent).map_err(|_| "无法创建加密登录状态目录".to_owned())?;
    let mut plaintext =
        serde_json::to_vec(&values).map_err(|_| "无法序列化藏宝阁登录状态".to_owned())?;
    let encrypted = windows_dpapi::protect(&plaintext);
    plaintext.fill(0);
    fs::write(path, encrypted?).map_err(|_| "无法保存加密的藏宝阁登录状态".to_owned())
}

fn clear_cbg_cookies<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    channel: CbgChannel,
) -> Result<(), String> {
    match fs::remove_file(cbg_cookie_path(app, channel)?) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("无法清除已失效的藏宝阁登录状态".to_owned()),
    }
}

fn cbg_cookies_to_restore(
    channel: CbgChannel,
    values: &[String],
    live_cookies: &[tauri::webview::Cookie<'_>],
) -> Result<Vec<tauri::webview::Cookie<'static>>, String> {
    // 所有藏宝阁窗口共用浏览器会话；旧快照不能覆盖正在使用的登录凭据。
    if has_cbg_login_cookie(live_cookies) {
        return Ok(Vec::new());
    }
    let mut cookies = Vec::new();
    for value in values {
        let mut cookie = value
            .parse::<tauri::webview::Cookie<'static>>()
            .map_err(|_| "加密的藏宝阁登录状态格式无效".to_owned())?;
        if cookie.domain().is_none() {
            cookie.set_domain(channel.host());
        }
        let domain = cookie.domain().unwrap_or_default();
        let host = channel.host();
        if domain != host && !host.ends_with(&format!(".{domain}")) {
            continue;
        }
        cookies.push(cookie);
    }
    Ok(cookies)
}

pub(crate) fn restore_cbg_cookies(
    webview: &tauri::Webview,
    channel: CbgChannel,
    values: &[String],
) -> Result<(), String> {
    let url = Url::parse(&format!("https://{}/", channel.host()))
        .map_err(|_| "藏宝阁登录地址无效".to_owned())?;
    let live_cookies = webview
        .cookies_for_url(url)
        .map_err(|_| "无法读取藏宝阁登录状态".to_owned())?;
    for cookie in cbg_cookies_to_restore(channel, values, &live_cookies)? {
        webview
            .set_cookie(cookie)
            .map_err(|_| "无法恢复藏宝阁登录状态".to_owned())?;
    }
    Ok(())
}

async fn cbg_cookies_for_window(
    window: &tauri::WebviewWindow,
    channel: CbgChannel,
) -> Result<Vec<tauri::webview::Cookie<'static>>, String> {
    let window = window.clone();
    let url = Url::parse(&format!("https://{}/", channel.host()))
        .map_err(|_| "藏宝阁登录地址无效".to_owned())?;
    tauri::async_runtime::spawn_blocking(move || window.cookies_for_url(url))
        .await
        .map_err(|_| "读取藏宝阁登录状态失败".to_owned())?
        .map_err(|_| "读取藏宝阁登录状态失败".to_owned())
}

async fn cbg_cookies_for_webview(
    webview: &tauri::Webview,
    channel: CbgChannel,
) -> Result<Vec<tauri::webview::Cookie<'static>>, String> {
    let webview = webview.clone();
    let url = Url::parse(&format!("https://{}/", channel.host()))
        .map_err(|_| "藏宝阁登录地址无效".to_owned())?;
    tauri::async_runtime::spawn_blocking(move || webview.cookies_for_url(url))
        .await
        .map_err(|_| "读取藏宝阁登录状态失败".to_owned())?
        .map_err(|_| "读取藏宝阁登录状态失败".to_owned())
}

pub(crate) async fn ensure_cbg_login_window(
    app: tauri::AppHandle,
    channel: CbgChannel,
) -> Result<(), String> {
    let label = channel.login_window_label();
    let url = Url::parse(&format!("https://{}/", channel.host()))
        .map_err(|_| "藏宝阁登录地址无效".to_owned())?;
    if let Some(window) = app.get_webview_window(&label) {
        let cookies = cbg_cookies_for_window(&window, channel).await?;
        if has_cbg_login_cookie(&cookies) {
            save_cbg_cookies(&app, channel, &cookies)?;
        } else if let Some(cookies) = load_cbg_cookies(&app, channel).ok().flatten() {
            if has_saved_cbg_login_cookie(&cookies) {
                restore_cbg_cookies(window.as_ref(), channel, &cookies)?;
                window
                    .navigate(url)
                    .map_err(|_| "无法恢复藏宝阁登录页面".to_owned())?;
            }
        }
        return Ok(());
    }

    let saved_cookies = load_cbg_cookies(&app, channel)
        .ok()
        .flatten()
        .filter(|cookies| has_saved_cbg_login_cookie(cookies));
    let initial_url = if saved_cookies.is_some() {
        Url::parse("about:blank").map_err(|_| "藏宝阁登录地址无效".to_owned())?
    } else {
        url.clone()
    };
    let window = WebviewWindowBuilder::new(&app, label, WebviewUrl::External(initial_url))
        .title("藏宝阁登录")
        .inner_size(1050.0, 780.0)
        .initialization_script(CBG_CAPTURE_SCRIPT)
        .visible(false)
        .center()
        .build()
        .map_err(|error| format!("无法打开藏宝阁登录窗口：{error}"))?;
    if let Some(cookies) = saved_cookies {
        restore_cbg_cookies(window.as_ref(), channel, &cookies)?;
        window
            .navigate(url)
            .map_err(|_| "无法恢复藏宝阁登录页面".to_owned())?;
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn get_cbg_login_status(
    app: tauri::AppHandle,
    channel: CbgChannel,
) -> Result<Option<bool>, String> {
    let mut checked_live_view = false;
    if let Some(webview) = app.get_webview(CBG_BROWSER_LABEL) {
        let is_channel_page = webview
            .url()
            .ok()
            .and_then(|url| url.host_str().map(str::to_owned))
            .is_some_and(|host| channel.accepts_source_host(&host));
        if is_channel_page {
            checked_live_view = true;
            let cookies = cbg_cookies_for_webview(&webview, channel).await?;
            if has_cbg_login_cookie(&cookies) {
                save_cbg_cookies(&app, channel, &cookies)?;
                return Ok(Some(true));
            }
        }
    }

    if let Some(window) = app.get_webview_window(&channel.login_window_label()) {
        checked_live_view = true;
        let cookies = cbg_cookies_for_window(&window, channel).await?;
        if has_cbg_login_cookie(&cookies) {
            save_cbg_cookies(&app, channel, &cookies)?;
            return Ok(Some(true));
        }
    }

    if checked_live_view {
        clear_cbg_cookies(&app, channel)?;
        return Ok(Some(false));
    }

    let saved_cookies = load_cbg_cookies(&app, channel)?;
    Ok(saved_cbg_login_status(saved_cookies.as_deref()))
}
