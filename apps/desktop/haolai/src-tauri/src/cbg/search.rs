use super::webview::evaluate_cbg_webview;
use super::windows::{create_cbg_window, should_create_cbg_window};
use super::{is_supported_cbg_source_host, CbgChannel, CBG_BROWSER_LABEL, CBG_SHELL_LABEL};
use crate::static_data::read_static_data;
use reqwest::Url;
use serde_json::Value;
use std::time::{Duration, Instant};
use tauri::Manager;

#[tauri::command]
pub(crate) async fn apply_cbg_role_search(
    app: tauri::AppHandle,
    criteria: Value,
    background: Option<bool>,
) -> Result<Value, String> {
    let background = background.unwrap_or(false);
    let missing_shell = should_create_cbg_window(app.get_window(CBG_SHELL_LABEL).is_some());
    if missing_shell {
        if let Err(error) = create_cbg_window(&app, CbgChannel::Official, !background) {
            if app.get_window(CBG_SHELL_LABEL).is_none() {
                return Err(error);
            }
        }
    }
    if !background {
        if let Some(window) = app.get_webview_window(CBG_SHELL_LABEL) {
            window
                .unminimize()
                .and_then(|()| window.show())
                .and_then(|()| window.set_focus())
                .map_err(|error| format!("无法显示藏宝阁窗口：{error}"))?;
        } else if let Some(window) = app.get_window(CBG_SHELL_LABEL) {
            window
                .unminimize()
                .and_then(|()| window.show())
                .and_then(|()| window.set_focus())
                .map_err(|error| format!("无法显示藏宝阁窗口：{error}"))?;
        } else {
            return Err("藏宝阁窗口创建后仍不可用".to_owned());
        }
    } else if let Some(window) = app.get_webview_window(CBG_SHELL_LABEL) {
        window
            .hide()
            .map_err(|error| format!("无法隐藏藏宝阁窗口：{error}"))?;
    } else if let Some(window) = app.get_window(CBG_SHELL_LABEL) {
        window
            .hide()
            .map_err(|error| format!("无法隐藏藏宝阁窗口：{error}"))?;
    } else {
        return Err("藏宝阁窗口创建后仍不可用".to_owned());
    }

    let deadline = Instant::now() + Duration::from_secs(8);
    let webview = loop {
        if let Some(webview) = app.get_webview(CBG_BROWSER_LABEL) {
            break webview;
        }
        if Instant::now() >= deadline {
            return Err("藏宝阁窗口已打开，但页面尚未就绪；请稍后重试".to_owned());
        }
        tauri::async_runtime::spawn_blocking(|| {
            std::thread::sleep(Duration::from_millis(150));
        })
        .await
        .map_err(|_| "等待藏宝阁页面时发生错误".to_owned())?;
    };
    let host_deadline = Instant::now() + Duration::from_secs(8);
    let host = loop {
        let host = webview
            .url()
            .ok()
            .and_then(|url| url.host_str().map(str::to_owned))
            .filter(|host| !host.is_empty());
        if let Some(host) = host {
            break host;
        }
        if Instant::now() >= host_deadline {
            return Err("藏宝阁页面尚未就绪，请稍后重试".to_owned());
        }
        tauri::async_runtime::spawn_blocking(|| {
            std::thread::sleep(Duration::from_millis(150));
        })
        .await
        .map_err(|_| "等待藏宝阁页面时发生错误".to_owned())?;
    };
    let allowed_channels = [
        CbgChannel::Official,
        CbgChannel::Huawei,
        CbgChannel::Oppo,
        CbgChannel::Vivo,
        CbgChannel::Xiaomi,
    ];
    if !allowed_channels
        .iter()
        .any(|channel| channel.accepts_source_host(&host))
    {
        return Err("当前页面不是受支持的藏宝阁页面".to_owned());
    }

    let criteria_json =
        serde_json::to_string(&criteria).map_err(|_| "筛选条件格式无效".to_owned())?;
    if criteria_json.len() > 64 * 1024 {
        return Err("筛选条件过多，请删减后重试".to_owned());
    }
    let criteria_literal =
        serde_json::to_string(&criteria_json).map_err(|_| "筛选条件格式无效".to_owned())?;
    let server_ids = read_static_data(app.clone(), "/static/server-list".to_owned())?
        .filter(Value::is_object)
        .unwrap_or_else(|| {
            serde_json::from_str(include_str!("../cbg_server_ids.json"))
                .expect("内置区服映射必须是有效 JSON")
        });
    let server_ids_json =
        serde_json::to_string(&server_ids).map_err(|_| "区服映射格式无效".to_owned())?;
    let server_ids_literal =
        serde_json::to_string(&server_ids_json).map_err(|_| "区服映射格式无效".to_owned())?;
    let script = include_str!("../cbg_role_search.js")
        .replace("__CRITERIA_JSON__", &criteria_literal)
        .replace("__SERVER_IDS_JSON__", &server_ids_literal);

    let result = evaluate_cbg_webview(&webview, &script).await?;
    match result.get("status").and_then(Value::as_str) {
        Some("submitted") => {
            let target = result
                .get("url")
                .and_then(Value::as_str)
                .and_then(|value| Url::parse(value).ok())
                .filter(|url| {
                    url.scheme() == "https"
                        && url.host_str() == Some(host.as_str())
                        && url.port().is_none()
                        && url.username().is_empty()
                        && url.password().is_none()
                        && url.fragment().is_none()
                        && url.path() == "/cgi/mweb/pl"
                })
                .ok_or_else(|| "藏宝阁搜索结果地址无效，未执行跳转".to_owned())?;
            webview
                .navigate(target)
                .map_err(|error| format!("无法打开藏宝阁搜索结果：{error}"))?;
            Ok(result)
        }
        Some("login_required") => Err("藏宝阁要求先登录；请在藏宝阁窗口手动登录后重试".to_owned()),
        Some("security_check") => {
            Err("藏宝阁出现安全验证或风险提示；请在窗口中手动处理后重试".to_owned())
        }
        Some("role_filter_not_open") => {
            Err("没有找到可见的“角色筛选”入口，请先在藏宝阁窗口打开角色筛选页".to_owned())
        }
        Some("unsupported") => {
            let fields = result
                .get("unsupported")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(Value::as_str)
                        .collect::<Vec<_>>()
                        .join("、")
                })
                .unwrap_or_default();
            Err(format!("藏宝阁页面暂未匹配这些条件，未提交：{fields}"))
        }
        Some("no_conditions") => Err("请先设置至少一个藏宝阁筛选条件".to_owned()),
        Some("submit_not_found") => Err("没有找到筛选页的“完成”按钮，条件未提交".to_owned()),
        _ => Err("没有识别到藏宝阁角色筛选页，请在窗口中打开“角色筛选”后重试".to_owned()),
    }
}

#[tauri::command]
pub(crate) async fn read_cbg_role_results(app: tauri::AppHandle) -> Result<Value, String> {
    let webview = app
        .get_webview(CBG_BROWSER_LABEL)
        .ok_or_else(|| "藏宝阁窗口当前不可用".to_owned())?;
    let host = webview
        .url()
        .ok()
        .and_then(|url| url.host_str().map(str::to_owned))
        .unwrap_or_default();
    if !is_supported_cbg_source_host(&host) {
        return Err("当前页面不是受支持的藏宝阁页面".to_owned());
    }
    let script = include_str!("../cbg_role_results.js").replace("__ACTION__", "\"read\"");
    evaluate_cbg_webview(&webview, &script).await
}

#[tauri::command]
pub(crate) async fn next_cbg_role_results_page(app: tauri::AppHandle) -> Result<bool, String> {
    let webview = app
        .get_webview(CBG_BROWSER_LABEL)
        .ok_or_else(|| "藏宝阁窗口当前不可用".to_owned())?;
    let host = webview
        .url()
        .ok()
        .and_then(|url| url.host_str().map(str::to_owned))
        .unwrap_or_default();
    if !is_supported_cbg_source_host(&host) {
        return Err("当前页面不是受支持的藏宝阁页面".to_owned());
    }

    let read_script = include_str!("../cbg_role_results.js").replace("__ACTION__", "\"read\"");
    let before = evaluate_cbg_webview(&webview, &read_script).await?;
    match before.get("status").and_then(Value::as_str) {
        Some("ready" | "empty") => {}
        Some("login_required") => {
            return Err("藏宝阁要求先登录；请在藏宝阁窗口手动登录后重试".to_owned());
        }
        Some("security_check") => {
            return Err("藏宝阁出现安全验证或风险提示；请在窗口中手动处理后重试".to_owned());
        }
        _ => return Err("藏宝阁角色结果页尚未就绪".to_owned()),
    }
    let before_key = before
        .get("pageKey")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    let candidate_signature = |page: &Value| {
        let candidates = page.get("candidates").and_then(Value::as_array);
        let first = candidates
            .and_then(|items| items.first())
            .and_then(|item| item.get("url"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned();
        let last = candidates
            .and_then(|items| items.last())
            .and_then(|item| item.get("url"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned();
        (candidates.map_or(0, Vec::len), first, last)
    };
    let before_candidates = candidate_signature(&before);
    let next_script = include_str!("../cbg_role_results.js").replace("__ACTION__", "\"next\"");
    let action = evaluate_cbg_webview(&webview, &next_script).await?;
    let action_status = action.get("status").and_then(Value::as_str);
    match action_status {
        Some("done") => return Ok(false),
        Some("clicking" | "scrolling" | "waiting") => {}
        _ => return Err("没有找到藏宝阁结果页的下一页按钮".to_owned()),
    }

    let deadline = Instant::now() + Duration::from_secs(15);
    while Instant::now() < deadline {
        let page = evaluate_cbg_webview(&webview, &read_script).await?;
        let page_key = page
            .get("pageKey")
            .and_then(Value::as_str)
            .unwrap_or_default();
        match page.get("status").and_then(Value::as_str) {
            Some("login_required") => {
                return Err("藏宝阁要求先登录；请在藏宝阁窗口手动登录后重试".to_owned());
            }
            Some("security_check") => {
                return Err("藏宝阁出现安全验证或风险提示；请在窗口中手动处理后重试".to_owned());
            }
            _ => {}
        }
        if matches!(
            page.get("status").and_then(Value::as_str),
            Some("ready" | "empty")
        ) {
            if action_status == Some("clicking") && page_key != before_key {
                return Ok(true);
            }
            if action_status != Some("clicking") {
                if candidate_signature(&page) != before_candidates {
                    return Ok(true);
                }
                if page.get("hasNext").and_then(Value::as_bool) == Some(false) {
                    return Ok(false);
                }
            }
        }
        tauri::async_runtime::spawn_blocking(|| {
            std::thread::sleep(Duration::from_millis(350));
        })
        .await
        .map_err(|_| "等待藏宝阁下一页时发生错误".to_owned())?;
    }
    Err("藏宝阁下一页加载超时，请确认页面仍可正常浏览".to_owned())
}
