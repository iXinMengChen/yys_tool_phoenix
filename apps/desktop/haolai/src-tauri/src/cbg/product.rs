use super::session::{ensure_cbg_login_window, has_cbg_login_cookie, save_cbg_cookies};
use super::webview::evaluate_cbg_webview;
use super::{CbgChannel, CBG_BROWSER_LABEL};
use crate::static_data::API_TIMEOUT;
use reqwest::{Client, Url};
use serde::Deserialize;
use serde_json::Value;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};
use tauri::Manager;

static CBG_PRODUCT_REQUEST_ID: AtomicU64 = AtomicU64::new(1);

const CBG_PAGE_TIMEOUT: Duration = Duration::from_secs(30);
const CBG_EQUIP_DESC_BASE_URL: &str =
    "https://cbg-other-desc.res.netease.com/yys/static/equipdesc/";

const MAX_CBG_EQUIP_DESC_BYTES: usize = 32 * 1024 * 1024;

// 主动读取独占带身份的槽位；被动页面 capture 不得满足商品读取轮询。
const CBG_PRODUCT_REQUEST_SCRIPT: &str = r#"(request => {
  window.__yysCbgProductRequest?.controller.abort();
  const pending = { id: request.requestId, controller: new AbortController(), capture: null };
  window.__yysCbgProductRequest = pending;
  const form = new URLSearchParams({
    client_type: 'h5', serverid: request.serverid, ordersn: request.ordersn,
    h5_device: 'other', app_client: 'other', exclude_equip_desc: '1',
    view_loc: request.viewLoc, exter: 'direct',
    page_session_id: crypto.randomUUID().toUpperCase(),
    traffic_trace: JSON.stringify({ field_id: request.tfid, content_id: request.tcid })
  });
  const headers = {
    accept: 'application/json, text/javascript, */*; q=0.01',
    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'x-requested-with': 'XMLHttpRequest',
    'cbg-request-id': crypto.randomUUID().toUpperCase()
  };
  if (window.__yysCbgSafeCode) headers['cbg-safe-code'] = window.__yysCbgSafeCode;
  const finish = capture => {
    if (window.__yysCbgProductRequest === pending) pending.capture = capture;
  };
  Promise.resolve().then(() => fetch(request.apiUrl, {
    method: 'POST', credentials: 'include', referrer: request.sourceUrl, headers, body: form,
    signal: pending.controller.signal
  })).then(async response => {
    finish({ status: response.status, body: await response.text() });
  }).catch(error => {
    finish({ status: 0, body: JSON.stringify({ message: String(error) }) });
  });
  return true;
})"#;

fn cbg_product_ordersn(page_url: &str) -> Result<String, String> {
    let url = Url::parse(page_url).map_err(|_| "藏宝阁商品链接格式无效".to_owned())?;
    let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
    let supported_host = matches!(
        host.as_str(),
        "yys.cbg.163.com"
            | "cbg.163.com"
            | "yys-huawei.cbg.163.com"
            | "yys-oppo.cbg.163.com"
            | "yys-vivo.cbg.163.com"
            | "yys-xiaomi.cbg.163.com"
    );
    if url.scheme() != "https" || !supported_host {
        return Err("请复制阴阳师藏宝阁的完整商品链接。".to_owned());
    }
    let segments = url
        .path_segments()
        .ok_or_else(|| "藏宝阁商品链接无效".to_owned())?
        .collect::<Vec<_>>();
    if segments.len() != 5
        || segments[0] != "cgi"
        || segments[1] != "mweb"
        || segments[2] != "equip"
        || segments[3].parse::<u32>().is_err()
    {
        return Err("链接中没有找到商品编号".to_owned());
    }
    cbg_equip_desc_url(segments[4])?;
    Ok(segments[4].to_owned())
}

#[cfg(test)]
mod cbg_page_tests {
    use super::cbg_product_ordersn;

    #[test]
    fn accepts_only_supported_https_product_pages() {
        assert_eq!(
            cbg_product_ordersn(
                "https://yys.cbg.163.com/cgi/mweb/equip/20/202610231401616-20-BR7HJ8KCSGFQQ?view_loc=home"
            )
            .unwrap(),
            "202610231401616-20-BR7HJ8KCSGFQQ"
        );
        assert!(cbg_product_ordersn("http://yys.cbg.163.com/cgi/mweb/equip/20/abc").is_err());
        assert!(cbg_product_ordersn("https://example.com/cgi/mweb/equip/20/abc").is_err());
        assert!(cbg_product_ordersn("https://yys.cbg.163.com/cgi/mweb/equip/20/../abc").is_err());
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProductRequest {
    serverid: Option<String>,
    ordersn: Option<String>,
    #[serde(default)]
    channel: CbgChannel,
    source_url: Option<String>,
    view_loc: Option<String>,
    tfid: Option<String>,
    tcid: Option<String>,
}

#[tauri::command]
pub(crate) async fn take_cbg_page_capture(app: tauri::AppHandle) -> Result<Option<Value>, String> {
    let channels = [
        CbgChannel::Official,
        CbgChannel::Huawei,
        CbgChannel::Oppo,
        CbgChannel::Vivo,
        CbgChannel::Xiaomi,
    ];
    let mut webviews = Vec::new();
    if let Some(webview) = app.get_webview(CBG_BROWSER_LABEL) {
        webviews.push(webview);
    }
    for channel in channels {
        if let Some(window) = app.get_webview_window(&channel.login_window_label()) {
            webviews.push(window.as_ref().clone());
        }
    }
    for webview in webviews {
        let capture = evaluate_cbg_webview(
            &webview,
            r#"(() => {
              const capture = window.__yysCbgEquipCapture;
              if (!capture || !capture.pageUrl) return null;
              if (capture.pageUrl !== location.href) {
                window.__yysCbgEquipCapture = null;
                return null;
              }
              try {
                const path = new URL(capture.pageUrl).pathname;
                if (!/^\/cgi\/mweb\/equip\/\d+\/[^/]+$/.test(path)) return null;
              } catch { return null; }
              window.__yysCbgEquipCapture = null;
              return capture;
            })()"#,
        )
        .await;
        let Ok(capture) = capture else {
            continue;
        };
        if capture.is_null() {
            continue;
        }
        let page_url = capture
            .get("pageUrl")
            .and_then(Value::as_str)
            .ok_or_else(|| "藏宝阁商品链接格式无效".to_owned())?;
        let ordersn = cbg_product_ordersn(page_url)?;
        let status = capture
            .get("status")
            .and_then(Value::as_u64)
            .and_then(|status| u16::try_from(status).ok())
            .ok_or_else(|| "藏宝阁商品响应状态无效".to_owned())?;
        if !(200..300).contains(&status) {
            return Err("藏宝阁页面没有返回商品数据".to_owned());
        }
        let body = capture
            .get("body")
            .and_then(Value::as_str)
            .filter(|body| body.len() <= MAX_CBG_EQUIP_DESC_BYTES)
            .ok_or_else(|| "藏宝阁商品响应内容无效".to_owned())?;
        let mut payload = serde_json::from_str::<Value>(body)
            .map_err(|_| "藏宝阁商品资料无法识别，请重新读取商品。".to_owned())?;
        attach_cbg_equip_desc(&mut payload, &ordersn).await?;
        return Ok(Some(serde_json::json!({
            "pageUrl": page_url,
            "payload": payload,
        })));
    }
    Ok(None)
}

fn cbg_equip_desc_url(ordersn: &str) -> Result<String, String> {
    if ordersn.is_empty()
        || ordersn.len() > 128
        || !ordersn
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err("藏宝阁返回的御魂数据编号无效".to_owned());
    }
    Ok(format!("{CBG_EQUIP_DESC_BASE_URL}{ordersn}.json"))
}

fn parse_cbg_equip_desc(body: &str) -> Result<Value, String> {
    let file =
        serde_json::from_str::<Value>(body).map_err(|_| "藏宝阁御魂详情格式异常".to_owned())?;
    let detail = file
        .get("equip_desc")
        .cloned()
        .ok_or_else(|| "藏宝阁御魂详情缺少数据".to_owned())?;
    if !detail.is_object() && !detail.is_string() {
        return Err("藏宝阁御魂详情格式无效".to_owned());
    }
    Ok(detail)
}

#[cfg(test)]
mod cbg_equip_desc_tests {
    use super::{cbg_equip_desc_url, parse_cbg_equip_desc};
    use serde_json::Value;

    #[test]
    fn builds_detail_url_from_product_order_id() {
        assert_eq!(
            cbg_equip_desc_url("202610231401616-20-BR7HJ8KCSGFQQ").unwrap(),
            "https://cbg-other-desc.res.netease.com/yys/static/equipdesc/202610231401616-20-BR7HJ8KCSGFQQ.json"
        );
        assert!(cbg_equip_desc_url("../../other-host/file").is_err());
    }

    #[test]
    fn extracts_the_wrapped_equip_description() {
        assert_eq!(
            parse_cbg_equip_desc(r#"{"version":"sample","equip_desc":"{\"hero_history\":{}}"}"#)
                .unwrap(),
            Value::String(r#"{"hero_history":{}}"#.to_owned())
        );
    }
}

async fn attach_cbg_equip_desc(payload: &mut Value, ordersn: &str) -> Result<(), String> {
    let equip_key = if payload.get("equip").is_some() {
        "equip"
    } else {
        "equip_data"
    };
    let equip = payload
        .get(equip_key)
        .and_then(Value::as_object)
        .ok_or_else(|| "藏宝阁没有返回商品数据".to_owned())?;
    if equip.get("equip_desc").is_some_and(|value| {
        value.is_object() || value.as_str().is_some_and(|text| !text.is_empty())
    }) {
        return Ok(());
    }
    let url = cbg_equip_desc_url(ordersn)?;
    let client = Client::builder()
        .timeout(API_TIMEOUT)
        .build()
        .map_err(|_| "无法初始化御魂数据请求".to_owned())?;
    let mut response = client
        .get(url)
        .header("accept", "application/json")
        .header("referer", "https://yys.cbg.163.com/")
        .header("user-agent", "Mozilla/5.0")
        .send()
        .await
        .map_err(|_| "藏宝阁御魂详情暂时无法连接，请稍后重试".to_owned())?;
    let status = response.status();
    if !status.is_success() {
        log_api!(&format!("御魂详情文件请求失败：HTTP {}", status.as_u16()));
        return Err("藏宝阁御魂详情暂时无法获取，请稍后重试".to_owned());
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_CBG_EQUIP_DESC_BYTES as u64)
    {
        return Err("藏宝阁御魂详情文件过大".to_owned());
    }
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "读取藏宝阁御魂详情失败".to_owned())?
    {
        if body.len() + chunk.len() > MAX_CBG_EQUIP_DESC_BYTES {
            return Err("藏宝阁御魂详情文件过大".to_owned());
        }
        body.extend_from_slice(&chunk);
    }
    let body = std::str::from_utf8(&body).map_err(|_| "藏宝阁御魂详情格式异常".to_owned())?;
    let detail = parse_cbg_equip_desc(body)?;
    let equip = payload
        .get_mut(equip_key)
        .and_then(Value::as_object_mut)
        .ok_or_else(|| "藏宝阁商品数据格式异常".to_owned())?;
    equip.insert("equip_desc".to_owned(), detail);
    Ok(())
}

async fn load_product_payload(
    app: tauri::AppHandle,
    request: ProductRequest,
) -> Result<Value, String> {
    let ProductRequest {
        serverid,
        ordersn,
        channel,
        source_url,
        view_loc,
        tfid,
        tcid,
    } = request;
    let serverid = serverid.unwrap_or_default();
    let ordersn = ordersn.unwrap_or_default();
    if serverid.is_empty()
        || !serverid.chars().all(|character| character.is_ascii_digit())
        || !ordersn
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
        || ordersn.is_empty()
    {
        return Err("商品链接参数无效".to_owned());
    }

    if source_url.as_ref().is_some_and(|value| value.len() > 4096)
        || view_loc.as_ref().is_some_and(|value| value.len() > 2048)
        || tfid.as_ref().is_some_and(|value| value.len() > 128)
        || tcid.as_ref().is_some_and(|value| value.len() > 128)
    {
        return Err("商品链接参数过长".to_owned());
    }

    let source_url = source_url
        .as_deref()
        .and_then(|value| Url::parse(value).ok())
        .filter(|url| {
            url.scheme() == "https"
                && url.username().is_empty()
                && url.password().is_none()
                && url
                    .host_str()
                    .is_some_and(|host| channel.accepts_source_host(host))
                && url.path_segments().is_some_and(|segments| {
                    let segments = segments.collect::<Vec<_>>();
                    segments.len() == 5
                        && segments[0..3] == ["cgi", "mweb", "equip"]
                        && segments[3] == serverid
                        && segments[4] == ordersn
                })
        })
        .ok_or_else(|| "商品链接参数无效，请重新粘贴藏宝阁链接".to_owned())?;
    let login_window_label = channel.login_window_label();
    if app.get_webview_window(&login_window_label).is_none() {
        ensure_cbg_login_window(app.clone(), channel).await?;
    }
    let login_window = app
        .get_webview_window(&login_window_label)
        .ok_or_else(|| "无法恢复藏宝阁登录窗口".to_owned())?;
    let cookie_url = Url::parse(&format!("https://{}/", channel.host()))
        .map_err(|_| "藏宝阁登录地址无效".to_owned())?;
    let cookie_window = login_window.clone();
    let cookies =
        tauri::async_runtime::spawn_blocking(move || cookie_window.cookies_for_url(cookie_url))
            .await
            .map_err(|_| "读取藏宝阁登录状态失败".to_owned())?
            .map_err(|_| "读取藏宝阁登录状态失败".to_owned())?;
    if !has_cbg_login_cookie(&cookies) {
        return Err("没有找到藏宝阁登录状态，请在登录窗口完成登录后重试".to_owned());
    }
    save_cbg_cookies(&app, channel, &cookies)?;

    log_api!(&format!(
        "load_product 请求藏宝阁商品数据（channel={}）",
        channel.label()
    ));
    let ready_script = format!(
        "location.hostname === '{}' && document.readyState === 'complete'",
        channel.host()
    );
    let ready_deadline = Instant::now() + CBG_PAGE_TIMEOUT;
    loop {
        if evaluate_cbg_webview(login_window.as_ref(), &ready_script)
            .await?
            .as_bool()
            == Some(true)
        {
            break;
        }
        if Instant::now() >= ready_deadline {
            return Err("藏宝阁登录页面尚未就绪，请稍后重试".to_owned());
        }
        tauri::async_runtime::spawn_blocking(|| {
            std::thread::sleep(Duration::from_millis(200));
        })
        .await
        .map_err(|_| "等待藏宝阁登录页面失败".to_owned())?;
    }

    let request_id = CBG_PRODUCT_REQUEST_ID
        .fetch_add(1, Ordering::Relaxed)
        .to_string();
    let request_data = serde_json::json!({
        "requestId": request_id,
        "apiUrl": format!("https://{}/cgi/api/get_equip_detail?client_type=h5", channel.host()),
        "serverid": serverid,
        "ordersn": ordersn,
        "sourceUrl": source_url.as_str(),
        "viewLoc": view_loc.unwrap_or_default(),
        "tfid": tfid.unwrap_or_else(|| "f_equip_list".to_owned()),
        "tcid": tcid.unwrap_or_else(|| "c_equip_detail".to_owned()),
    });
    let request_data =
        serde_json::to_string(&request_data).map_err(|_| "无法准备藏宝阁商品请求".to_owned())?;
    let request_script = format!("{CBG_PRODUCT_REQUEST_SCRIPT}({request_data})");
    login_window
        .eval(&request_script)
        .map_err(|_| "无法发送藏宝阁商品请求".to_owned())?;

    let poll_script = format!(
        "window.__yysCbgProductRequest?.id === '{request_id}' ? window.__yysCbgProductRequest.capture : null"
    );
    let deadline = Instant::now() + CBG_PAGE_TIMEOUT;
    let capture_result: Result<Value, String> = async {
        loop {
            let capture = evaluate_cbg_webview(login_window.as_ref(), &poll_script).await?;
            if capture.is_object() {
                break Ok(capture);
            }
            if Instant::now() >= deadline {
                break Err("藏宝阁页面未返回商品数据，请确认登录窗口能正常打开该商品".to_owned());
            }
            let _ = tauri::async_runtime::spawn_blocking(|| {
                std::thread::sleep(Duration::from_millis(200));
            })
            .await;
        }
    }
    .await;
    // 成功、超时和读取异常都撤销当前请求；即使撤销失败，下一次请求仍按身份隔离。
    let cleanup_script = format!(
        "if (window.__yysCbgProductRequest?.id === '{request_id}') {{ window.__yysCbgProductRequest.controller.abort(); window.__yysCbgProductRequest = null; }}"
    );
    let _ = login_window.eval(&cleanup_script);
    let capture = capture_result?;

    let status = capture
        .get("status")
        .and_then(Value::as_u64)
        .unwrap_or_default();
    let response_text = capture
        .get("body")
        .and_then(Value::as_str)
        .ok_or_else(|| "藏宝阁商品响应内容为空".to_owned())?;
    let mut payload = serde_json::from_str::<Value>(response_text).map_err(|_| {
        log_api!("load_product 响应不是有效 JSON");
        "商品数据格式异常，请稍后重试".to_owned()
    })?;
    if !(200..300).contains(&status) {
        log_api!(&format!("load_product 页面响应异常：HTTP {status}"));
        return Err(payload
            .get("msg")
            .or_else(|| payload.get("message"))
            .and_then(Value::as_str)
            .unwrap_or("商品数据暂时无法获取，请稍后重试")
            .to_owned());
    }
    if !payload
        .get("equip")
        .or_else(|| payload.get("equip_data"))
        .is_some_and(Value::is_object)
    {
        return Err(payload
            .get("msg")
            .or_else(|| payload.get("message"))
            .and_then(Value::as_str)
            .unwrap_or("藏宝阁没有返回商品数据，请确认登录状态后重试")
            .to_owned());
    }
    attach_cbg_equip_desc(&mut payload, &ordersn).await?;
    log_api!(&format!(
        "load_product 页面响应成功：HTTP {status}，{} 字节",
        response_text.len()
    ));
    Ok(payload)
}

#[tauri::command]
pub(crate) async fn load_product(
    app: tauri::AppHandle,
    request: ProductRequest,
) -> Result<Value, String> {
    load_product_payload(app, request).await
}

#[tauri::command]
pub(crate) async fn load_product_raw(
    app: tauri::AppHandle,
    request: ProductRequest,
) -> Result<String, String> {
    let payload = load_product_payload(app, request).await?;
    serde_json::to_string(&payload).map_err(|_| "无法整理商品资料，请重新读取商品。".to_owned())
}
