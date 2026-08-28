mod app_files;
mod credentials;
mod downloads;
mod introdb;
mod m3u_cache;
#[cfg(target_os = "macos")]
mod macos_embed;
mod native_player;
mod native_player_diagnostics;
mod native_player_options;
mod native_player_property;
mod remote_media;
mod source_secrets;
mod twitch_resolver;
mod window_commands;
#[cfg(target_os = "windows")]
mod windows_window;
mod xmltv;

use std::path::Path;
use tauri::{Manager, State};

const MAX_M3U_BYTES: usize = 64 * 1024 * 1024;
const MAX_XMLTV_BYTES: usize = 128 * 1024 * 1024;
const XMLTV_CACHE_FRESH_MS: u64 = 6 * 60 * 60 * 1000;
#[cfg(not(feature = "desktop-e2e"))]
const CREDENTIAL_SERVICE: &str = "com.movena.desktop";
#[cfg(feature = "desktop-e2e")]
const CREDENTIAL_SERVICE: &str = "com.movena.desktop.e2e";
const CREDENTIAL_ACCOUNT: &str = "xtream-provider";

fn remove_cached_app_data(app_data: &Path, app_cache: &Path) -> Result<(), String> {
    for path in [
        app_data.join("m3u-cache"),
        app_data.join("xmltv-cache"),
        app_cache.join("twitch-resolver"),
    ] {
        match std::fs::remove_dir_all(path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err("Could not remove cached application data".to_string()),
        }
    }
    Ok(())
}

#[tauri::command(async)]
fn app_data_clear(
    app: tauri::AppHandle,
    player: State<'_, native_player::NativePlayerManager>,
    source_ids: Vec<String>,
) -> Result<(), String> {
    // Enforce resolver ownership at the native boundary too. The frontend
    // normally stops playback first, but direct IPC must not remove the
    // resolver cache while an active session still owns its process/listener.
    player.stop(&app)?;

    for source_id in source_ids {
        match source_secrets::source_secret_entry(&source_id)?.delete_credential() {
            Ok(()) | Err(keyring::v1::Error::NoEntry) => {}
            Err(error) => return Err(format!("Failed to delete source credential: {error}")),
        }
    }
    credentials::credential_delete()?;

    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|_| "Application data is unavailable".to_string())?;
    let app_cache = app
        .path()
        .app_cache_dir()
        .map_err(|_| "Application cache is unavailable".to_string())?;
    remove_cached_app_data(&app_data, &app_cache)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    // Test-only WebDriver support is feature-gated so release builds cannot
    // accidentally expose automation commands or a listening driver.
    #[cfg(feature = "desktop-e2e")]
    let builder = builder
        .plugin(tauri_plugin_wdio::init())
        .plugin(tauri_plugin_wdio_webdriver::init());

    builder
        .manage(native_player::NativePlayerManager::default())
        .manage(downloads::DownloadManager::default())
        .invoke_handler(tauri::generate_handler![
            window_commands::player_set_fullscreen,
            window_commands::player_set_cursor_hidden,
            credentials::credential_store,
            credentials::credential_load,
            credentials::credential_delete,
            source_secrets::source_secret_store,
            source_secrets::source_secret_load,
            source_secrets::source_secret_delete,
            remote_media::m3u_fetch,
            remote_media::m3u_probe_stream,
            xmltv::xmltv_fetch,
            introdb::introdb_fetch_segments,
            downloads::download_media_start,
            downloads::download_media_pause,
            downloads::download_media_resume,
            downloads::download_media_cancel,
            downloads::download_media_delete,
            remote_media::m3u_read_file,
            app_files::m3u_write_file,
            m3u_cache::m3u_cache_store,
            m3u_cache::m3u_cache_load,
            m3u_cache::m3u_cache_delete,
            app_data_clear,
            app_files::settings_config_read,
            app_files::settings_config_write,
            native_player::mpv_start,
            native_player::mpv_stop,
            native_player::mpv_play_pause,
            native_player::mpv_seek,
            native_player::mpv_seek_relative,
            native_player::mpv_set_volume,
            native_player::mpv_set_speed,
            native_player::mpv_set_audio_track,
            native_player::mpv_set_sub_track,
            native_player::mpv_set_recording,
            native_player::mpv_set_property,
        ])
        .on_window_event(|_window, _event| {
            // Keep the embedded mpv window glued to the main window's content area.
            #[cfg(target_os = "macos")]
            {
                use tauri::{Manager, WindowEvent};
                if matches!(
                    _event,
                    WindowEvent::Resized(_)
                        | WindowEvent::Moved(_)
                        | WindowEvent::ScaleFactorChanged { .. }
                ) {
                    macos_embed::sync(_window.app_handle());
                    // A fullscreen transition animates, and AppKit can drop the
                    // child window relationship after the last resize event.
                    macos_embed::sync_after_settle(_window.app_handle());
                }
            }
        })
        .setup(|_app| {
            // Claim the dock icon before any stream can start, and take native
            // fullscreen off the table — see macos_embed.
            #[cfg(target_os = "macos")]
            macos_embed::prepare_main_window(_app.handle());

            // The WebDriver plugin installs its own logger so it can forward
            // backend output to the runner. Registering both panics at startup.
            #[cfg(all(debug_assertions, not(feature = "desktop-e2e")))]
            {
                _app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod source_tests {
    use super::remote_media::{
        apply_conditional_headers, decode_m3u, remote_cache_key, validate_remote_url,
        HttpValidators, M3uFetchOptions,
    };
    use super::remove_cached_app_data;
    use std::collections::HashMap;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn removes_playlist_guide_and_twitch_resolver_caches() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "movena-app-data-clear-{}-{unique}",
            std::process::id()
        ));
        let app_data = root.join("data");
        let app_cache = root.join("cache");
        for path in [
            app_data.join("m3u-cache"),
            app_data.join("xmltv-cache"),
            app_cache.join("twitch-resolver"),
        ] {
            std::fs::create_dir_all(&path).unwrap();
            std::fs::write(path.join("private-cache"), b"private").unwrap();
        }

        remove_cached_app_data(&app_data, &app_cache).unwrap();

        assert!(!app_data.join("m3u-cache").exists());
        assert!(!app_data.join("xmltv-cache").exists());
        assert!(!app_cache.join("twitch-resolver").exists());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn validates_source_ids_and_remote_schemes() {
        assert!(validate_remote_url("https://list.test/main.m3u").is_ok());
        assert!(validate_remote_url("file:///private/list.m3u").is_err());
        assert!(validate_remote_url("http://list.test/main.m3u").is_ok());
    }

    #[test]
    fn decodes_legacy_playlists() {
        assert_eq!(decode_m3u(&[b'#', 0x80]), "#€");
    }

    #[test]
    fn builds_opaque_stable_remote_cache_keys() {
        let first = M3uFetchOptions {
            url: "https://guide.test/epg.xml?token=secret".to_string(),
            headers: HashMap::from([
                ("Referer".to_string(), "https://portal.test".to_string()),
                ("Authorization".to_string(), "Bearer private".to_string()),
            ]),
            cache_key: None,
        };
        let reordered = M3uFetchOptions {
            url: first.url.clone(),
            headers: HashMap::from([
                ("Authorization".to_string(), "Bearer private".to_string()),
                ("referer".to_string(), "https://portal.test".to_string()),
            ]),
            cache_key: None,
        };
        let key = remote_cache_key(&first);
        assert_eq!(key, remote_cache_key(&reordered));
        assert_eq!(key.len(), 16);
        assert!(!key.contains("secret"));
    }

    #[test]
    fn applies_http_cache_validators() {
        let mut headers = reqwest::header::HeaderMap::new();
        apply_conditional_headers(
            &mut headers,
            Some(&HttpValidators {
                etag: Some("\"guide-v2\"".to_string()),
                last_modified: Some("Wed, 12 Aug 2026 08:00:00 GMT".to_string()),
            }),
            "XMLTV guide",
        )
        .unwrap();
        assert_eq!(headers[reqwest::header::IF_NONE_MATCH], "\"guide-v2\"");
        assert_eq!(
            headers[reqwest::header::IF_MODIFIED_SINCE],
            "Wed, 12 Aug 2026 08:00:00 GMT"
        );
    }
}
