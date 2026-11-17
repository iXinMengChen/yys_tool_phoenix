use reqwest::Client;
use serde_json::Value;
use std::{fs, path::PathBuf, time::Duration};

const REMOTE_API_BASE_URL: &str = "https://mxtsl8.cn:12377/yys-cbg-inspector";
pub(crate) const API_TIMEOUT: Duration = Duration::from_secs(20);

const CBG_SERVER_LIST_URL: &str = "https://cbg-yys.res.netease.com/js/server_list_data.js";
const CBG_GAME_CONFIG_URL: &str = "https://cbg-yys.res.netease.com/js/game_auto_config.js";

fn invalid_endpoint(endpoint: &str) -> Result<PathBuf, String> {
    Err(format!("数据类型无效：{endpoint}"))
}

pub(crate) fn resource_root() -> Result<PathBuf, String> {
    let executable =
        std::env::current_exe().map_err(|error| format!("无法获取程序安装目录：{error}"))?;
    let directory = executable
        .parent()
        .ok_or_else(|| "程序安装目录无效".to_owned())?;
    Ok(directory.join("static-data"))
}

fn static_data_path<R: tauri::Runtime>(
    _app: &tauri::AppHandle<R>,
    endpoint: &str,
) -> Result<PathBuf, String> {
    let file_name = match endpoint {
        "/static/heroes" => "heroes.json",
        "/static/relic-suits" => "relic-suits.json",
        "/static/server-list" => "server-list.json",
        "/static/server-groups" => "server-groups.json",
        "/static/game-config" => "cbg-game-config.json",
        _ => return invalid_endpoint(endpoint),
    };
    Ok(resource_root()?.join(file_name))
}

fn write_static_json<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    endpoint: &str,
    data: &Value,
) -> Result<(), String> {
    let file_path = static_data_path(app, endpoint)?;
    let parent = file_path
        .parent()
        .ok_or_else(|| "静态数据目录无效".to_owned())?;
    fs::create_dir_all(parent)
        .map_err(|_| "资源目录创建失败，请将程序放在当前用户可写的安装目录。".to_owned())?;
    let content = serde_json::to_vec_pretty(data).map_err(|_| "静态数据格式异常".to_owned())?;
    fs::write(file_path, content).map_err(|_| "静态数据保存失败".to_owned())
}

// Public static scripts are JSON assignments, never executable JavaScript.
fn parse_game_config_script(script: &str) -> Result<Value, String> {
    let raw = script
        .trim()
        .strip_prefix("var CBG_GAME_CONFIG")
        .and_then(|tail| tail.trim_start().strip_prefix('='))
        .ok_or_else(|| "官方游戏资料脚本格式异常".to_owned())?
        .trim()
        .trim_end_matches(';')
        .trim_end();
    let config: Value = serde_json::from_str(raw)
        .map_err(|_| "官方游戏资料无法识别，请稍后重新更新资料。".to_owned())?;
    if !config
        .get("hero_list")
        .and_then(Value::as_array)
        .is_some_and(|rows| !rows.is_empty())
        || !config
            .get("yuhun_list")
            .and_then(Value::as_array)
            .is_some_and(|rows| !rows.is_empty())
        || !config.get("two_suit_yuhun").is_some_and(Value::is_object)
    {
        return Err("官方游戏资料缺少必需目录".to_owned());
    }
    Ok(config)
}

fn parse_server_groups_script(script: &str) -> Result<Value, String> {
    let tail = script
        .trim()
        .strip_prefix("var product_name")
        .and_then(|tail| tail.trim_start().strip_prefix('='))
        .ok_or_else(|| "官方区服脚本格式异常".to_owned())?;
    let (product, tail) = tail
        .split_once(';')
        .ok_or_else(|| "官方区服脚本格式异常".to_owned())?;
    if serde_json::from_str::<String>(product.trim())
        .ok()
        .as_deref()
        != Some("yys")
    {
        return Err("官方区服游戏名称无效".to_owned());
    }
    let raw = tail
        .trim_start()
        .strip_prefix("var server_data")
        .and_then(|tail| tail.trim_start().strip_prefix('='))
        .ok_or_else(|| "官方区服脚本格式异常".to_owned())?
        .trim()
        .trim_end_matches(';')
        .trim_end();
    let data: Value = serde_json::from_str(raw)
        .map_err(|_| "官方区服资料无法识别，请稍后重新更新资料。".to_owned())?;
    let groups = data
        .as_object()
        .filter(|groups| !groups.is_empty())
        .ok_or_else(|| "官方区服分组格式异常".to_owned())?;
    let mut result = Vec::new();
    for (id, entry) in groups {
        if id.is_empty() || !id.bytes().all(|byte| byte.is_ascii_digit()) {
            return Err("官方区服分组 ID 无效".to_owned());
        }
        let name = entry
            .get(0)
            .and_then(|header| header.get(0))
            .and_then(Value::as_str)
            .filter(|name| !name.is_empty())
            .ok_or_else(|| "官方区服分组名称无效".to_owned())?;
        let rows = entry
            .get(1)
            .and_then(Value::as_array)
            .filter(|rows| !rows.is_empty())
            .ok_or_else(|| "官方区服列表格式异常".to_owned())?;
        let mut servers = Vec::new();
        for row in rows {
            let name = row
                .get(1)
                .and_then(Value::as_str)
                .filter(|name| !name.is_empty())
                .ok_or_else(|| "官方区服名称无效".to_owned())?;
            // 与 Web 公共契约一致：第三列为商品所属区服 ID，不能使用展示序号。
            let server_id = match row.get(2) {
                Some(Value::String(id)) => id.clone(),
                Some(Value::Number(id)) if id.is_i64() || id.is_u64() => id.to_string(),
                _ => return Err("官方区服 ID 无效".to_owned()),
            };
            if server_id.is_empty() || !server_id.bytes().all(|byte| byte.is_ascii_digit()) {
                return Err("官方区服 ID 无效".to_owned());
            }
            servers.push(serde_json::json!({ "id": server_id, "name": name }));
        }
        result.push(serde_json::json!({ "id": id, "name": name, "servers": servers }));
    }
    Ok(Value::Array(result))
}

#[cfg(test)]
mod public_static_tests {
    use super::{parse_game_config_script, parse_server_groups_script};

    #[test]
    fn game_config_is_json_only_and_requires_core_catalogs() {
        assert!(parse_game_config_script(r#"var CBG_GAME_CONFIG = {"hero_list":[[200,"桃花妖",3,"taohuayao"]],"yuhun_list":[[1,"雪幽魂","x","防御",""]],"two_suit_yuhun":{}};"#).is_ok());
        assert!(parse_game_config_script("var CBG_GAME_CONFIG = {}; alert(1)").is_err());
        assert!(parse_game_config_script("var CBG_GAME_CONFIG = {};").is_err());
    }

    #[test]
    fn server_groups_keep_official_group_and_product_server_ids() {
        let groups = parse_server_groups_script(r#"var product_name = "yys"; var server_data = {"10":[["网易-双平台"],[[0,"网易-桂花香","1001"]]]};"#).unwrap();
        assert_eq!(groups[0]["id"], "10");
        assert_eq!(groups[0]["servers"][0]["id"], "1001");
        assert_eq!(groups[0]["servers"][0]["name"], "网易-桂花香");
        assert!(
            parse_server_groups_script(r#"var product_name = "other"; var server_data = {};"#)
                .is_err()
        );
    }
}

fn parse_server_list_script(script: &str) -> Result<Value, String> {
    let declaration = script
        .find("server_data")
        .ok_or_else(|| "区服脚本中缺少 server_data".to_owned())?;
    let tail = &script[declaration..];
    let start = tail
        .find('{')
        .ok_or_else(|| "区服脚本数据格式异常".to_owned())?;
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escaped = false;
    let mut end = None;
    for (offset, character) in tail[start..].char_indices() {
        if in_string {
            if escaped {
                escaped = false;
            } else if character == '\\' {
                escaped = true;
            } else if character == '"' {
                in_string = false;
            }
        } else {
            match character {
                '"' => in_string = true,
                '{' => depth += 1,
                '}' => {
                    depth = depth.saturating_sub(1);
                    if depth == 0 {
                        end = Some(start + offset + character.len_utf8());
                        break;
                    }
                }
                _ => {}
            }
        }
    }
    let end = end.ok_or_else(|| "区服脚本数据不完整".to_owned())?;
    let raw = &tail[start..end];
    let source_data: Value =
        serde_json::from_str(raw).map_err(|_| "区服脚本数据格式异常".to_owned())?;
    let groups = source_data
        .as_object()
        .ok_or_else(|| "区服脚本数据格式异常".to_owned())?;
    let mut result = serde_json::Map::new();
    for entry in groups.values() {
        let metadata = entry
            .get(0)
            .and_then(Value::as_array)
            .ok_or_else(|| "区服分组格式异常".to_owned())?;
        let group_name = metadata
            .first()
            .and_then(Value::as_str)
            .ok_or_else(|| "区服分组名称无效".to_owned())?;
        let server_rows = entry
            .get(1)
            .and_then(Value::as_array)
            .ok_or_else(|| "区服列表格式异常".to_owned())?;
        let mut servers = serde_json::Map::new();
        for row in server_rows {
            let fields = row
                .as_array()
                .ok_or_else(|| "区服条目格式异常".to_owned())?;
            let id = match fields.first() {
                Some(Value::String(value)) => value.clone(),
                Some(Value::Number(value)) => value.to_string(),
                _ => return Err("区服 ID 无效".to_owned()),
            };
            let name = fields
                .get(1)
                .and_then(Value::as_str)
                .ok_or_else(|| "区服名称无效".to_owned())?;
            let name = if group_name == "网易-双平台" {
                name.strip_prefix("网易-").unwrap_or(name)
            } else {
                name
            };
            if id.is_empty() || !id.chars().all(|character| character.is_ascii_digit()) {
                return Err("区服 ID 无效".to_owned());
            }
            servers.insert(name.to_owned(), Value::String(id));
        }
        if servers.is_empty() {
            return Err("区服列表为空".to_owned());
        }
        result.insert(group_name.to_owned(), Value::Object(servers));
    }
    if result.is_empty() {
        return Err("区服列表为空".to_owned());
    }
    Ok(Value::Object(result))
}

#[tauri::command]
pub(crate) fn read_static_data(
    app: tauri::AppHandle,
    endpoint: String,
) -> Result<Option<Value>, String> {
    let file_path = static_data_path(&app, &endpoint)?;
    let Ok(content) = fs::read_to_string(file_path) else {
        return Ok(None);
    };
    Ok(serde_json::from_str(&content).ok())
}

#[tauri::command]
pub(crate) async fn update_static_data(
    app: tauri::AppHandle,
    endpoint: String,
) -> Result<Value, String> {
    static_data_path(&app, &endpoint)?;
    let is_server_list = endpoint == "/static/server-list" || endpoint == "/static/server-groups";
    let is_game_config = endpoint == "/static/game-config";
    let url = if is_server_list {
        CBG_SERVER_LIST_URL.to_owned()
    } else if is_game_config {
        CBG_GAME_CONFIG_URL.to_owned()
    } else {
        format!("{REMOTE_API_BASE_URL}{endpoint}")
    };
    log_api!(&format!("update_static_data 请求：GET {url}"));
    let client = Client::builder()
        .timeout(API_TIMEOUT)
        .build()
        .map_err(|_| "远程请求客户端初始化失败".to_owned())?;
    let response = match client
        .get(&url)
        .header(
            "accept",
            if is_server_list || is_game_config {
                "application/javascript, text/javascript, */*"
            } else {
                "application/json"
            },
        )
        .header("user-agent", "YYS-CBG-Inspector/1.0")
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            log_api!(&format!("update_static_data 请求失败：{error}"));
            return Err("远程数据暂时无法获取，请稍后重试".to_owned());
        }
    };

    let status = response.status();
    let response_text = response
        .text()
        .await
        .map_err(|_| "远程响应内容读取失败".to_owned())?;
    if !status.is_success() {
        log_api!(&format!("update_static_data 响应异常：HTTP {status}"));
        let message = serde_json::from_str::<Value>(&response_text)
            .ok()
            .and_then(|payload| {
                payload
                    .get("msg")
                    .and_then(Value::as_str)
                    .map(str::to_owned)
            });
        return Err(message.unwrap_or_else(|| "远程数据暂时无法获取，请稍后重试".to_owned()));
    }

    let data = if endpoint == "/static/server-groups" {
        parse_server_groups_script(&response_text)?
    } else if is_server_list {
        parse_server_list_script(&response_text)?
    } else if is_game_config {
        parse_game_config_script(&response_text)?
    } else {
        serde_json::from_str::<Value>(&response_text).map_err(|_| {
            log_api!("update_static_data 响应不是有效 JSON");
            "远程数据格式异常，请稍后重试".to_owned()
        })?
    };
    write_static_json(&app, &endpoint, &data)?;
    log_api!(&format!(
        "update_static_data 响应成功：HTTP {status}，{} 字节，已写入本地缓存",
        response_text.len()
    ));
    Ok(data)
}

#[tauri::command]
pub(crate) fn save_static_data(
    app: tauri::AppHandle,
    endpoint: String,
    data: Value,
) -> Result<Value, String> {
    if !data.is_object() && !data.is_array() {
        return Err("游戏资料无法保存，请重新更新资料。".to_owned());
    }
    write_static_json(&app, &endpoint, &data)?;
    Ok(data)
}
