use serde_json::Value;
use std::time::Duration;

pub(crate) const CBG_CAPTURE_SCRIPT: &str = r#"(() => {
  const allowedHosts = new Set([
    "yys.cbg.163.com", "cbg.163.com", "yys-huawei.cbg.163.com",
    "yys-oppo.cbg.163.com", "yys-vivo.cbg.163.com", "yys-xiaomi.cbg.163.com"
  ]);
  const capture = (url, status, body, pageUrl) => {
    if (pageUrl !== location.href) return;
    try {
      const requestUrl = new URL(url, location.href);
      if (allowedHosts.has(requestUrl.hostname) &&
          requestUrl.pathname === "/cgi/api/get_equip_detail" &&
          typeof body === "string") {
        window.__yysCbgEquipCapture = { status, body, pageUrl };
      }
    } catch {}
  };
  const rememberSafeCode = headers => {
    try {
      const value = new Headers(headers).get("cbg-safe-code");
      if (value) window.__yysCbgSafeCode = value;
    } catch {}
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    this.__yysCbgRequestUrl = String(url);
    return originalOpen.apply(this, arguments);
  };
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    if (String(name).toLowerCase() === "cbg-safe-code") {
      window.__yysCbgSafeCode = String(value);
    }
    return originalSetRequestHeader.apply(this, arguments);
  };
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function() {
    const pageUrl = location.href;
    this.addEventListener("loadend", () => {
      try {
        let body;
        try { body = this.responseText; }
        catch { body = JSON.stringify(this.response); }
        capture(this.__yysCbgRequestUrl, this.status, body, pageUrl);
      } catch {}
    }, { once: true });
    return originalSend.apply(this, arguments);
  };

  const originalFetch = window.fetch;
  window.fetch = function(input, init) {
    const pageUrl = location.href;
    const url = input instanceof Request ? input.url : String(input);
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    if (init && init.headers) {
      new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    }
    rememberSafeCode(headers);
    // 发出时固定归属：主动请求完成/超时后也不得流入页面自动同步。
    const isProductRequest = Boolean(init?.signal &&
      init.signal === window.__yysCbgProductRequest?.controller.signal);
    return originalFetch.apply(this, arguments).then(response => {
      if (!isProductRequest) {
        response.clone().text().then(body => capture(url, response.status, body, pageUrl)).catch(() => {});
      }
      return response;
    });
  };
})()"#;

pub(crate) async fn evaluate_cbg_webview(
    webview: &tauri::Webview,
    script: &str,
) -> Result<Value, String> {
    let (sender, receiver) = std::sync::mpsc::channel();
    webview
        .eval_with_callback(script, move |result| {
            let _ = sender.send(result);
        })
        .map_err(|_| "无法读取藏宝阁页面数据".to_owned())?;
    let result =
        tauri::async_runtime::spawn_blocking(move || receiver.recv_timeout(Duration::from_secs(3)))
            .await
            .map_err(|_| "读取藏宝阁页面数据失败".to_owned())?
            .map_err(|_| "读取藏宝阁页面数据超时".to_owned())?;
    serde_json::from_str(&result).map_err(|_| "藏宝阁页面返回的数据格式异常".to_owned())
}
