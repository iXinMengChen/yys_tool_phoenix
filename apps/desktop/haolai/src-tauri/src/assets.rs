use http::{header::CONTENT_TYPE, Request, Response, StatusCode};
use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

const STATIC_ASSET_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, Deserialize)]
pub(crate) struct StaticAssetUpdateRequest {
    #[serde(default, rename = "heroIds")]
    hero_ids: Vec<u64>,
    #[serde(default, rename = "suitIds")]
    suit_ids: Vec<u64>,
    #[serde(default, rename = "currencyIds")]
    currency_ids: Vec<u64>,
    #[serde(default, rename = "decoCardHouseIds")]
    deco_card_house_ids: Vec<u64>,
    #[serde(default, rename = "headSkinIds")]
    head_skin_ids: Vec<u64>,
    #[serde(default, rename = "sceneSkinIds")]
    scene_skin_ids: Vec<u64>,
    #[serde(default, rename = "badgeIds")]
    badge_ids: Vec<u64>,
    #[serde(default, rename = "yingyuanIds")]
    yingyuan_ids: Vec<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StaticAssetUpdateResult {
    hero_icons: u32,
    suit_icons: u32,
    catalog_icons: u32,
    failed: u32,
}

fn positive_asset_id(text: &str) -> Option<u64> {
    if text.is_empty() || !text.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    text.parse::<u64>().ok().filter(|id| *id > 0)
}

/// 协议读取、缓存写入和官方 URL 共用白名单；皮肤必须恰好有两级正整数。
/// 不解码百分号或接受平台分隔符，避免两级目录引入路径穿越和 Windows 特殊路径。
fn is_static_asset_path(path: &str) -> bool {
    let parts = path.split('/').collect::<Vec<_>>();
    let valid_file = |name: &str| {
        name.strip_suffix(".png")
            .and_then(positive_asset_id)
            .is_some()
    };
    match parts.as_slice() {
        ["heroes" | "suits" | "currency" | "decocardhouse" | "headskin" | "sceneskin" | "badge"
        | "yingyuan", file] => valid_file(file),
        ["skins", hero, file] => positive_asset_id(hero).is_some() && valid_file(file),
        _ => false,
    }
}

fn static_asset_path(relative: &str) -> Result<PathBuf, String> {
    if !is_static_asset_path(relative) {
        return Err("图标路径无效".to_owned());
    }
    Ok(crate::static_data::resource_root()?
        .join("assets")
        .join(relative))
}

fn bundled_asset_roots<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Vec<PathBuf> {
    let mut roots = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        roots.push(resource_dir.join("static-data").join("assets"));
    }

    // 免安装版把 static-data 放在可执行文件同级，补充该路径以兼容直接复制运行的目录结构。
    if let Ok(executable) = std::env::current_exe() {
        if let Some(app_dir) = executable.parent() {
            roots.push(app_dir.join("static-data").join("assets"));
        }
    }

    // 开发模式直接读取仓库的共享资源，不依赖启动时的工作目录。
    #[cfg(debug_assertions)]
    roots.push(
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .ancestors()
            .nth(4)
            .expect("桌面 crate 必须位于 apps/<应用目录>/src-tauri")
            .join("packages/assets/haolai"),
    );

    roots
}

fn is_png(bytes: &[u8]) -> bool {
    bytes.len() >= 8 && bytes[0..8] == [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
}

fn read_valid_png(path: &Path) -> Option<Vec<u8>> {
    let bytes = fs::read(path).ok()?;
    is_png(&bytes).then_some(bytes)
}

fn read_static_asset<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    relative: &str,
) -> Option<Vec<u8>> {
    // 先校验，再拼接所有缓存及内置目录；不能只保护可写缓存路径。
    let path = static_asset_path(relative).ok()?;
    if let Some(bytes) = read_valid_png(&path) {
        return Some(bytes);
    }
    bundled_asset_roots(app)
        .into_iter()
        .map(|root| root.join(relative))
        .find_map(|path| read_valid_png(&path))
}

fn official_asset_url(relative: &str) -> Result<String, String> {
    if !is_static_asset_path(relative) {
        return Err("图标路径无效".to_owned());
    }
    let parts = relative.split('/').collect::<Vec<_>>();
    let path = match parts.as_slice() {
        ["heroes", file] => format!("hero/{}/{}", file.trim_end_matches(".png"), file),
        ["suits", file] => format!("suit/{file}"),
        ["skins", hero, file] => format!("hero/{hero}/skin/{file}"),
        _ => relative.to_owned(),
    };
    Ok(format!("https://cbg-yys.res.netease.com/game_res/{path}"))
}

async fn download_static_asset<R: tauri::Runtime>(
    _app: &tauri::AppHandle<R>,
    client: &Client,
    relative: &str,
) -> Result<(), String> {
    let response = client
        .get(official_asset_url(relative)?)
        .send()
        .await
        .map_err(|_| "图标请求失败".to_owned())?;
    if !response.status().is_success() {
        return Err(format!("图标请求失败：{}", response.status()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|_| "图标内容读取失败".to_owned())?
        .to_vec();
    if !is_png(&bytes) {
        return Err("图标内容不是有效 PNG".to_owned());
    }

    let target = static_asset_path(relative)?;
    let parent = target.parent().ok_or_else(|| "图标目录无效".to_owned())?;
    fs::create_dir_all(parent).map_err(|_| "图标目录创建失败".to_owned())?;

    // 先写临时文件再替换，避免更新过程中页面读到半截 PNG。
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let file_name = target
        .file_name()
        .ok_or_else(|| "图标文件名无效".to_owned())?
        .to_string_lossy();
    let temporary = parent.join(format!(
        "{file_name}.{}.{}.tmp",
        std::process::id(),
        timestamp
    ));
    fs::write(&temporary, bytes).map_err(|_| "图标保存失败".to_owned())?;
    if let Err(error) = fs::rename(&temporary, &target) {
        let _ = fs::remove_file(&temporary);
        return Err(format!("图标替换失败：{error}"));
    }

    Ok(())
}

fn unique_asset_ids(ids: Vec<u64>) -> Vec<u64> {
    let mut seen = HashSet::new();
    ids.into_iter()
        .filter(|id| *id > 0 && seen.insert(*id))
        .collect()
}

async fn update_static_asset_group<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    client: &Client,
    kind: &str,
    ids: Vec<u64>,
) -> (u32, u32) {
    let mut updated = 0;
    let mut failed = 0;

    for id in ids {
        // 内置资源或用户目录已有有效图标时不访问官方图床。
        let relative = format!("{kind}/{id}.png");
        if read_static_asset(app, &relative).is_some() {
            continue;
        }
        match download_static_asset(app, client, &relative).await {
            Ok(()) => updated += 1,
            Err(_) => failed += 1,
        }
    }

    (updated, failed)
}

#[cfg(test)]
mod static_asset_tests {
    use super::{
        is_png, is_safe_ui_name, is_static_asset_path, official_asset_url, read_valid_png,
        unique_asset_ids, StaticAssetUpdateRequest,
    };
    use serde_json::json;

    #[test]
    fn whitelists_exact_numeric_paths_and_official_templates() {
        for (path, remote) in [
            ("heroes/200.png", "hero/200/200.png"),
            ("suits/300001.png", "suit/300001.png"),
            ("skins/200/200001.png", "hero/200/skin/200001.png"),
            ("currency/900273.png", "currency/900273.png"),
            ("decocardhouse/12.png", "decocardhouse/12.png"),
            ("headskin/34.png", "headskin/34.png"),
            ("sceneskin/56.png", "sceneskin/56.png"),
            ("yingyuan/269.png", "yingyuan/269.png"),
        ] {
            assert!(is_static_asset_path(path), "{path}");
            assert_eq!(
                official_asset_url(path).unwrap(),
                format!("https://cbg-yys.res.netease.com/game_res/{remote}")
            );
        }
        for path in [
            "skins/200001.png",
            "skins/0/1.png",
            "skins/1/0.png",
            "skins/+1/2.png",
            "skins/1/-2.png",
            "skins/1.1/2.png",
            "skins/1/2/3.png",
            "skins/../2.png",
            "skins/1/../../2.png",
            "skins/1/%2e%2e.png",
            "skins/1%2f2/3.png",
            "skins/1\\2/3.png",
            "skins/1/2.png?x=1",
            "heroes/18446744073709551616.png",
            "heroes/0.png",
            "unknown/1.png",
            "/currency/1.png",
            "currency/1.svg",
            "C:/currency/1.png",
            "currency/1.png:stream",
            "https://example.com/1.png",
        ] {
            assert!(!is_static_asset_path(path), "{path}");
            assert!(official_asset_url(path).is_err(), "{path}");
        }
    }

    #[test]
    fn keeps_catalog_ids_beyond_one_thousand_without_zero_or_duplicates() {
        // 头像框目录已超过 1000 项，不能静默丢弃后面的新头像框。
        let expected: Vec<u64> = (9_010_001..=9_011_375).collect();
        let mut ids = vec![0];
        ids.extend(expected.iter().copied());
        ids.extend([expected[0], 0, expected[1_000], 9_011_740]);
        let mut expected = expected;
        expected.push(9_011_740);
        assert_eq!(unique_asset_ids(ids), expected);
    }

    #[test]
    fn legacy_asset_update_request_remains_valid_and_catalog_ids_are_explicit() {
        let legacy: StaticAssetUpdateRequest =
            serde_json::from_value(json!({"heroIds": [200], "suitIds": []})).unwrap();
        assert!(legacy.currency_ids.is_empty());
        assert!(legacy.yingyuan_ids.is_empty());
        let cheering: StaticAssetUpdateRequest =
            serde_json::from_value(json!({"yingyuanIds": [269]})).unwrap();
        assert_eq!(cheering.yingyuan_ids, vec![269]);
        let catalog: StaticAssetUpdateRequest = serde_json::from_value(json!({"currencyIds": [900273], "decoCardHouseIds": [12], "headSkinIds": [34], "sceneSkinIds": [56]})).unwrap();
        assert_eq!(catalog.currency_ids, vec![900273]);
        assert_eq!(catalog.deco_card_house_ids, vec![12]);
        assert_eq!(catalog.head_skin_ids, vec![34]);
        assert_eq!(catalog.scene_skin_ids, vec![56]);
    }

    #[test]
    fn only_valid_cached_images_can_skip_a_download() {
        let path = std::env::temp_dir().join(format!(
            "phoenix-asset-{}-{}.png",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        assert!(read_valid_png(&path).is_none());
        std::fs::write(&path, b"<html>failed download</html>").unwrap();
        assert!(read_valid_png(&path).is_none());
        let png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
        std::fs::write(&path, png).unwrap();
        assert_eq!(read_valid_png(&path).unwrap(), png);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn retains_png_validation_and_safe_ui_filenames() {
        assert!(is_png(&[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        assert!(!is_png(b"<html>not a png</html>"));
        assert!(!is_png(&[0x89, 0x50]));
        assert!(is_safe_ui_name("relic-slot-pointer.png"));
        assert!(is_safe_ui_name("icon_money.svg"));
        for name in [
            ".png",
            "../icon.png",
            "%2e.png",
            "icon..png",
            "icon.png:stream",
        ] {
            assert!(!is_safe_ui_name(name));
        }
    }
}

fn not_found_response() -> Response<Vec<u8>> {
    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .body(Vec::new())
        .expect("固定的 404 响应必须有效")
}

fn is_safe_ui_name(name: &str) -> bool {
    let Some(stem) = name
        .strip_suffix(".png")
        .or_else(|| name.strip_suffix(".svg"))
    else {
        return false;
    };
    !stem.is_empty()
        && stem.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'-' | b'_')
        })
}

pub(crate) async fn serve_asset<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    request: Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let Ok(url) = Url::parse(&request.uri().to_string()) else {
        return not_found_response();
    };
    let Some(host) = url.host_str() else {
        return not_found_response();
    };
    // 用原始 URI 路径校验，避免 URL 解析器先折叠 ../ 或编码的点段。
    let mut segments = request
        .uri()
        .path()
        .trim_start_matches('/')
        .split('/')
        .collect::<Vec<_>>();
    // Windows WebView2 会把自定义协议改写为 http://yys-cbg-assets.localhost/...；
    // localhost 和旧版直接把资源类型放在 host 中的格式也一并兼容。
    let kind = match host {
        "yys-cbg-assets.localhost" | "localhost" => {
            let Some((kind, remaining)) = segments.split_first() else {
                return not_found_response();
            };
            let kind = *kind;
            segments = remaining.to_vec();
            kind
        }
        "ui" | "heroes" | "suits" | "skins" | "currency" | "decocardhouse" | "headskin"
        | "sceneskin" | "badge" | "yingyuan" => host,
        _ => return not_found_response(),
    };

    let (file_path, content_type) = if kind == "ui" {
        let Some(name) = segments.first().copied() else {
            return not_found_response();
        };
        if segments.len() != 1 || !is_safe_ui_name(name) {
            return not_found_response();
        }
        let candidates = bundled_asset_roots(app)
            .into_iter()
            .map(|root| root.join(name))
            .collect::<Vec<_>>();
        let Some(path) = candidates.into_iter().find(|path| path.is_file()) else {
            return not_found_response();
        };
        let content_type = if name.ends_with(".svg") {
            "image/svg+xml"
        } else {
            "image/png"
        };
        (path, content_type)
    } else {
        let relative = format!("{kind}/{}", segments.join("/"));
        let bytes = match read_static_asset(app, &relative) {
            Some(bytes) => bytes,
            None => {
                let Ok(client) = Client::builder().timeout(STATIC_ASSET_TIMEOUT).build() else {
                    return not_found_response();
                };
                if download_static_asset(app, &client, &relative)
                    .await
                    .is_err()
                {
                    return not_found_response();
                }
                let Some(bytes) = read_static_asset(app, &relative) else {
                    return not_found_response();
                };
                bytes
            }
        };
        // 异步协议仅在实际请求缺图时下载；后续请求复用安装目录的有效 PNG。
        return asset_response(bytes, "image/png");
    };

    let Ok(bytes) = fs::read(file_path) else {
        return not_found_response();
    };
    asset_response(bytes, content_type)
}

fn asset_response(bytes: Vec<u8>, content_type: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(StatusCode::OK)
        .header(CONTENT_TYPE, content_type)
        .header("Cache-Control", "public, max-age=31536000")
        .body(bytes)
        .expect("固定的资源响应头必须有效")
}

#[tauri::command]
pub(crate) async fn update_static_assets(
    app: tauri::AppHandle,
    request: StaticAssetUpdateRequest,
) -> Result<StaticAssetUpdateResult, String> {
    let client = Client::builder()
        .timeout(STATIC_ASSET_TIMEOUT)
        .build()
        .map_err(|_| "图标请求客户端初始化失败".to_owned())?;
    let (hero_icons, hero_failed) =
        update_static_asset_group(&app, &client, "heroes", unique_asset_ids(request.hero_ids))
            .await;
    let (suit_icons, suit_failed) =
        update_static_asset_group(&app, &client, "suits", unique_asset_ids(request.suit_ids)).await;
    let mut catalog_icons = 0;
    let mut failed = hero_failed + suit_failed;
    for (kind, ids) in [
        ("currency", request.currency_ids),
        ("decocardhouse", request.deco_card_house_ids),
        ("headskin", request.head_skin_ids),
        ("sceneskin", request.scene_skin_ids),
        ("badge", request.badge_ids),
        ("yingyuan", request.yingyuan_ids),
    ] {
        let (updated, errors) =
            update_static_asset_group(&app, &client, kind, unique_asset_ids(ids)).await;
        catalog_icons += updated;
        failed += errors;
    }
    Ok(StaticAssetUpdateResult {
        hero_icons,
        suit_icons,
        catalog_icons,
        failed,
    })
}
