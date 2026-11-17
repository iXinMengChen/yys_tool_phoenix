use reqwest::{Client, Url};
use serde_json::Value;
use std::time::Duration;
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub(crate) fn get_app_version(app: tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}

fn validate_release_url(value: &str, allow_dev_http: bool) -> Result<Url, String> {
    if value.len() > 2048 {
        return Err("版本或下载地址过长".to_owned());
    }
    let url = Url::parse(value).map_err(|_| "版本或下载地址无效".to_owned())?;
    let loopback = url.host_str().is_some_and(|host| {
        host == "localhost"
            || host == "[::1]"
            || host
                .parse::<std::net::IpAddr>()
                .is_ok_and(|ip| ip.is_loopback())
    });
    if url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || !(url.scheme() == "https" || (allow_dev_http && url.scheme() == "http" && loopback))
    {
        return Err("更新或下载链接不符合安全要求，请稍后重新检查更新。".to_owned());
    }
    Ok(url)
}

#[tauri::command]
pub(crate) async fn get_desktop_release(endpoint: String) -> Result<Value, String> {
    let url = validate_release_url(&endpoint, cfg!(debug_assertions))?;
    // 专用无会话 client：不复用藏宝阁 Cookie，也不跟随接口重定向。
    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|_| "无法创建版本请求".to_owned())?;
    let mut response = client
        .get(url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|_| "版本检查连接失败或超时，请稍后重试".to_owned())?;
    if !response.status().is_success() {
        return Err("无法获取更新信息，请稍后重试。".to_owned());
    }
    const MAX_RELEASE_BYTES: usize = 64 * 1024;
    if response
        .content_length()
        .is_some_and(|size| size > MAX_RELEASE_BYTES as u64)
    {
        return Err("更新信息超出可读取范围，请稍后重试。".to_owned());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "版本响应读取失败".to_owned())?
    {
        if bytes.len() + chunk.len() > MAX_RELEASE_BYTES {
            return Err("更新信息超出可读取范围，请稍后重试。".to_owned());
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| "更新信息无法识别，请稍后重新检查更新。".to_owned())
}

#[tauri::command]
pub(crate) fn open_desktop_download(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let url = validate_release_url(&url, false)?;
    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|_| "无法打开下载页面，请稍后重试".to_owned())
}
