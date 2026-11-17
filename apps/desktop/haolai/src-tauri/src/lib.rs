#[cfg(debug_assertions)]
macro_rules! log_api {
    ($message:expr) => {
        println!("[Tauri API] {}", $message);
    };
}

#[cfg(not(debug_assertions))]
macro_rules! log_api {
    ($message:expr) => {};
}

mod assets;
mod cbg;
mod platform;
mod release;
mod static_data;

use assets::serve_asset;
use platform::{show_main_window, BACKGROUND_SEARCH_RUNNING};
use std::sync::atomic::Ordering;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if BACKGROUND_SEARCH_RUNNING.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                } else {
                    window.app_handle().exit(0);
                }
            }
        })
        .register_asynchronous_uri_scheme_protocol(
            "yys-cbg-assets",
            |context, request, responder| {
                let app = context.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    responder.respond(serve_asset(&app, request).await);
                });
            },
        )
        .setup(|app| {
            let show_item = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出程序", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;
            let icon = app.default_window_icon().cloned().ok_or_else(|| {
                std::io::Error::new(std::io::ErrorKind::NotFound, "缺少默认窗口图标")
            })?;
            TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .tooltip("号来")
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => show_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if matches!(
                        event,
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        }
                    ) {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                // 开发模式默认打开控制台，方便排查本地资源、接口和页面运行时问题；生产包不主动打开。
                window.open_devtools();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            release::get_app_version,
            release::get_desktop_release,
            release::open_desktop_download,
            platform::get_compute_capacity,
            cbg::windows::toggle_cbg_window,
            platform::hide_main_window,
            platform::schedule_background_search,
            platform::set_background_search_running,
            cbg::windows::set_cbg_webview,
            cbg::windows::set_cbg_window_fullscreen,
            cbg::product::take_cbg_page_capture,
            cbg::session::get_cbg_login_status,
            cbg::search::apply_cbg_role_search,
            cbg::search::read_cbg_role_results,
            cbg::search::next_cbg_role_results_page,
            cbg::product::load_product,
            cbg::product::load_product_raw,
            static_data::read_static_data,
            static_data::update_static_data,
            static_data::save_static_data,
            assets::update_static_assets,
            platform::open_downloads_folder,
            platform::get_installed_browsers,
        ])
        .run(tauri::generate_context!())
        .expect("Tauri 应用启动失败");
}
