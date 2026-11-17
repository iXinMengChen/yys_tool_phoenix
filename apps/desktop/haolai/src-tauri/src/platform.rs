use serde::Serialize;
use std::{
    path::PathBuf,
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};
use sysinfo::System;
use tauri::{Emitter, Manager};
use tauri_plugin_opener::OpenerExt;

pub(crate) static BACKGROUND_SEARCH_RUNNING: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ComputeCapacity {
    logical_cores: usize,
    total_memory_mb: u64,
    free_memory_mb: u64,
}

#[tauri::command]
pub(crate) fn get_compute_capacity() -> ComputeCapacity {
    let mut system = System::new();
    system.refresh_memory();
    ComputeCapacity {
        logical_cores: std::thread::available_parallelism()
            .map(|value| value.get())
            .unwrap_or(1),
        total_memory_mb: system.total_memory() / 1024 / 1024,
        free_memory_mb: system.available_memory() / 1024 / 1024,
    }
}

#[tauri::command]
pub(crate) fn hide_main_window(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主程序窗口".to_owned())?;
    window
        .hide()
        .map_err(|error| format!("无法隐藏主程序窗口：{error}"))
}

pub(crate) fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window
            .show()
            .and_then(|()| window.unminimize())
            .and_then(|()| window.set_focus());
    }
}

#[tauri::command]
pub(crate) fn schedule_background_search(
    app: tauri::AppHandle,
    interval_minutes: u64,
    task_id: u64,
) -> Result<(), String> {
    let delay = Duration::from_secs(interval_minutes.clamp(5, 24 * 60) * 60);
    std::thread::Builder::new()
        .name("cbg-background-search-timer".to_owned())
        .spawn(move || {
            // shortcut: 停止时忽略旧任务事件，计时线程会睡到间隔结束；频繁启停时再换可取消调度器。
            std::thread::sleep(delay);
            let _ = app.emit("background-search:tick", task_id);
        })
        .map(|_| ())
        .map_err(|error| format!("无法安排下一轮后台搜索：{error}"))
}

#[tauri::command]
pub(crate) fn set_background_search_running(running: bool) {
    BACKGROUND_SEARCH_RUNNING.store(running, Ordering::Relaxed);
}

#[tauri::command]
pub(crate) fn open_downloads_folder(app: tauri::AppHandle) -> Result<(), String> {
    let downloads = app
        .path()
        .download_dir()
        .map_err(|error| format!("无法获取下载目录：{error}"))?;
    app.opener()
        .open_path(downloads.to_string_lossy().as_ref(), None::<&str>)
        .map_err(|error| format!("打开下载目录失败：{error}"))
}

#[cfg(windows)]
fn is_browser_registered(executable: &str) -> bool {
    // shortcut: 仅识别 Windows App Paths 注册项；需要支持便携版浏览器时再补路径发现。
    let Some(registry_tool) = std::env::var_os("SystemRoot")
        .map(PathBuf::from)
        .map(|root| root.join("System32").join("reg.exe"))
    else {
        return false;
    };
    let registry_keys = [
        format!(r"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\{executable}"),
        format!(r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\{executable}"),
        format!(
            r"HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\{executable}"
        ),
    ];

    registry_keys.iter().any(|key| {
        std::process::Command::new(&registry_tool)
            .args(["query", key])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .is_ok_and(|status| status.success())
    })
}

#[tauri::command]
pub(crate) fn get_installed_browsers() -> Vec<String> {
    #[cfg(windows)]
    {
        [
            ("edge", "msedge.exe"),
            ("chrome", "chrome.exe"),
            ("firefox", "firefox.exe"),
        ]
        .into_iter()
        .filter_map(|(browser, executable)| {
            is_browser_registered(executable).then(|| browser.to_owned())
        })
        .collect()
    }

    #[cfg(not(windows))]
    Vec::new()
}
