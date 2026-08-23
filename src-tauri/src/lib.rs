mod credentials;
#[cfg(target_os = "macos")]
mod macos_embed;
mod native_player;
mod window_commands;
#[cfg(target_os = "windows")]
mod windows_window;

use std::collections::{HashMap, HashSet};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager, State};

const CREDENTIAL_SERVICE: &str = "com.movena.desktop";
const CREDENTIAL_ACCOUNT: &str = "xtream-provider";

const MAX_M3U_BYTES: usize = 64 * 1024 * 1024;
const MAX_XMLTV_BYTES: usize = 128 * 1024 * 1024;
const MAX_SETTINGS_CONFIG_BYTES: u64 = 1024 * 1024;
const XMLTV_CACHE_FRESH_MS: u64 = 6 * 60 * 60 * 1000;

fn validate_settings_path(path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);
    // Reject path traversal
    for component in path.components() {
        if matches!(component, std::path::Component::ParentDir) {
            return Err("Settings file path must not contain '..' segments".to_string());
        }
    }
    // Must be a .json file
    match path.extension().and_then(|ext| ext.to_str()) {
        Some(ext) if ext.eq_ignore_ascii_case("json") => Ok(path),
        _ => Err("Settings files must have a .json extension".to_string()),
    }
}

#[tauri::command(async)]
fn settings_config_read(path: String) -> Result<String, String> {
    let path = validate_settings_path(&path)?;
    let metadata = std::fs::metadata(&path)
        .map_err(|_| "Could not open the selected settings file".to_string())?;
    if !metadata.is_file() || metadata.len() > MAX_SETTINGS_CONFIG_BYTES {
        return Err("The selected settings file is too large or is not a regular file".to_string());
    }
    std::fs::read_to_string(path)
        .map_err(|_| "The selected settings file is not valid UTF-8 text".to_string())
}

#[tauri::command(async)]
fn settings_config_write(path: String, content: String) -> Result<(), String> {
    if content.len() as u64 > MAX_SETTINGS_CONFIG_BYTES {
        return Err("The settings backup is too large to save".to_string());
    }
    let path = validate_settings_path(&path)?;
    if path.file_name().is_none() {
        return Err("Choose a file name for the settings backup".to_string());
    }
    std::fs::write(path, content).map_err(|_| "Could not write the settings backup".to_string())
}

fn validate_m3u_write_path(path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);
    for component in path.components() {
        if matches!(component, std::path::Component::ParentDir) {
            return Err("Playlist file path must not contain '..' segments".to_string());
        }
    }
    match path.extension().and_then(|ext| ext.to_str()) {
        Some(ext)
            if ext.eq_ignore_ascii_case("m3u")
                || ext.eq_ignore_ascii_case("m3u8")
                || ext.eq_ignore_ascii_case("txt") =>
        {
            Ok(path)
        }
        _ => Err("Playlist files must have a .m3u, .m3u8, or .txt extension".to_string()),
    }
}

#[tauri::command(async)]
fn m3u_write_file(path: String, content: String) -> Result<(), String> {
    if content.len() > MAX_M3U_BYTES {
        return Err("The playlist is too large to save".to_string());
    }
    let path = validate_m3u_write_path(&path)?;
    if path.file_name().is_none() {
        return Err("Choose a file name for the playlist".to_string());
    }
    std::fs::write(path, content).map_err(|_| "Could not write the playlist file".to_string())
}

fn validate_source_id(source_id: &str) -> Result<(), String> {
    if source_id.len() < 3
        || source_id.len() > 80
        || !source_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
    {
        return Err("Invalid playlist source id".to_string());
    }
    Ok(())
}

fn source_secret_entry(source_id: &str) -> Result<keyring::v1::Entry, String> {
    validate_source_id(source_id)?;
    keyring::v1::Entry::new(CREDENTIAL_SERVICE, &format!("m3u-source-{source_id}"))
        .map_err(|error| format!("Credential store is unavailable: {error}"))
}

#[tauri::command(async)]
fn source_secret_store(source_id: String, value: String) -> Result<(), String> {
    if value.is_empty() || value.len() > 32 * 1024 {
        return Err("Invalid playlist connection secret".to_string());
    }
    source_secret_entry(&source_id)?
        .set_password(&value)
        .map_err(|error| format!("Failed to store playlist connection: {error}"))
}

#[tauri::command(async)]
fn source_secret_load(source_id: String) -> Result<Option<String>, String> {
    match source_secret_entry(&source_id)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::v1::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("Failed to load playlist connection: {error}")),
    }
}

#[tauri::command(async)]
fn source_secret_delete(source_id: String) -> Result<(), String> {
    match source_secret_entry(&source_id)?.delete_credential() {
        Ok(()) | Err(keyring::v1::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("Failed to delete playlist connection: {error}")),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct M3uFetchOptions {
    url: String,
    #[serde(default)]
    headers: HashMap<String, String>,
    #[serde(default)]
    cache_key: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct M3uProbeOptions {
    url: String,
    #[serde(default)]
    headers: HashMap<String, String>,
    #[serde(default = "default_probe_timeout_ms")]
    timeout_ms: u64,
}

fn default_probe_timeout_ms() -> u64 {
    6_000
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct M3uProbeResult {
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    http_status: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error_message: Option<String>,
    latency_ms: u64,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct M3uDocument {
    content: String,
    base_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    file_name: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TextDocument {
    content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    cache_key: Option<String>,
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct HttpValidators {
    #[serde(skip_serializing_if = "Option::is_none")]
    etag: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    last_modified: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct M3uHttpCache {
    #[serde(default)]
    request_key: String,
    #[serde(flatten)]
    validators: HttpValidators,
}

struct XmltvHttpCache {
    content: String,
    fetched_at_ms: u64,
    validators: HttpValidators,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct XmltvHttpMetadata {
    fetched_at_ms: u64,
    #[serde(flatten)]
    validators: HttpValidators,
}

struct RemoteDownload {
    bytes: Vec<u8>,
    base_url: String,
    validators: HttpValidators,
}

enum RemoteDownloadResult {
    Modified(RemoteDownload),
    NotModified,
}

fn decode_m3u(bytes: &[u8]) -> String {
    match std::str::from_utf8(bytes) {
        Ok(value) => value.to_string(),
        Err(_) => {
            let (decoded, _, _) = encoding_rs::WINDOWS_1252.decode(bytes);
            decoded.into_owned()
        }
    }
}

fn validate_remote_url(value: &str) -> Result<url::Url, String> {
    let parsed = url::Url::parse(value).map_err(|_| "The playlist URL is invalid".to_string())?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("Remote playlists must use HTTP or HTTPS".to_string());
    }
    Ok(parsed)
}

fn same_origin_redirect_policy() -> reqwest::redirect::Policy {
    reqwest::redirect::Policy::custom(|attempt| {
        if attempt.previous().len() >= 8 {
            return attempt.error("too many redirects");
        }
        let Some(previous) = attempt.previous().last() else {
            return attempt.follow();
        };
        let same_origin = previous.scheme() == attempt.url().scheme()
            && previous.host_str() == attempt.url().host_str()
            && previous.port_or_known_default() == attempt.url().port_or_known_default();
        if same_origin {
            attempt.follow()
        } else {
            attempt.stop()
        }
    })
}

fn remote_headers(values: HashMap<String, String>) -> Result<reqwest::header::HeaderMap, String> {
    if values.len() > 16 {
        return Err("Too many request headers".to_string());
    }
    let mut headers = reqwest::header::HeaderMap::new();
    for (name, value) in values {
        let name = reqwest::header::HeaderName::from_bytes(name.as_bytes())
            .map_err(|_| "A request header name is invalid".to_string())?;
        let value = reqwest::header::HeaderValue::from_str(&value)
            .map_err(|_| "A request header value is invalid".to_string())?;
        headers.insert(name, value);
    }
    if !headers.contains_key(reqwest::header::USER_AGENT) {
        headers.insert(
            reqwest::header::USER_AGENT,
            reqwest::header::HeaderValue::from_static("Movena/0.1"),
        );
    }
    Ok(headers)
}

fn apply_conditional_headers(
    headers: &mut reqwest::header::HeaderMap,
    validators: Option<&HttpValidators>,
    resource: &str,
) -> Result<(), String> {
    let Some(validators) = validators else {
        return Ok(());
    };
    if let Some(etag) = &validators.etag {
        if !headers.contains_key(reqwest::header::IF_NONE_MATCH) {
            let value = reqwest::header::HeaderValue::from_str(etag)
                .map_err(|_| format!("The cached {resource} ETag is invalid"))?;
            headers.insert(reqwest::header::IF_NONE_MATCH, value);
        }
    }
    if let Some(last_modified) = &validators.last_modified {
        if !headers.contains_key(reqwest::header::IF_MODIFIED_SINCE) {
            let value = reqwest::header::HeaderValue::from_str(last_modified)
                .map_err(|_| format!("The cached {resource} modification date is invalid"))?;
            headers.insert(reqwest::header::IF_MODIFIED_SINCE, value);
        }
    }
    Ok(())
}

async fn download_remote(
    options: M3uFetchOptions,
    max_bytes: usize,
    resource: &str,
    validators: Option<&HttpValidators>,
) -> Result<RemoteDownloadResult, String> {
    let url = validate_remote_url(&options.url)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .redirect(same_origin_redirect_policy())
        .build()
        .map_err(|_| format!("Could not initialize the {resource} downloader"))?;
    let mut headers = remote_headers(options.headers)?;
    apply_conditional_headers(&mut headers, validators, resource)?;
    let mut response = client
        .get(url)
        .headers(headers)
        .send()
        .await
        .map_err(|_| format!("Could not download the {resource}"))?;
    if response.status() == reqwest::StatusCode::NOT_MODIFIED {
        return Ok(RemoteDownloadResult::NotModified);
    }
    if !response.status().is_success() {
        return Err(format!(
            "The {resource} URL answered {}",
            response.status().as_u16()
        ));
    }
    if response
        .content_length()
        .is_some_and(|length| length > max_bytes as u64)
    {
        return Err(format!("The {resource} is too large"));
    }
    let base_url = response.url().to_string();
    let validators = HttpValidators {
        etag: response
            .headers()
            .get(reqwest::header::ETAG)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned),
        last_modified: response
            .headers()
            .get(reqwest::header::LAST_MODIFIED)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned),
    };
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| format!("The {resource} download was interrupted"))?
    {
        if bytes.len() + chunk.len() > max_bytes {
            return Err(format!("The {resource} is too large"));
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(RemoteDownloadResult::Modified(RemoteDownload {
        bytes,
        base_url,
        validators,
    }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DownloadMediaOptions {
    #[serde(default)]
    id: Option<String>,
    url: String,
    file_name: String,
    #[serde(default)]
    headers: HashMap<String, String>,
    #[serde(default)]
    directory: Option<String>,
}

#[derive(Clone)]
struct DownloadControl {
    paused: Arc<AtomicBool>,
    cancelled: Arc<AtomicBool>,
}

#[derive(Clone, Default)]
struct DownloadManager {
    jobs: Arc<Mutex<HashMap<String, DownloadControl>>>,
    reserved_targets: Arc<Mutex<HashSet<PathBuf>>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadStatusEvent {
    id: String,
    state: String,
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

fn emit_download_event(app: &tauri::AppHandle, event: DownloadStatusEvent) {
    let _ = app.emit("download-event", event);
}

fn download_target(
    app: &tauri::AppHandle,
    manager: &DownloadManager,
    directory: Option<&str>,
    file_name: &str,
) -> Result<PathBuf, String> {
    let downloads = match directory.map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) => PathBuf::from(value),
        None => app
            .path()
            .download_dir()
            .map_err(|error| error.to_string())?,
    };
    std::fs::create_dir_all(&downloads).map_err(|error| error.to_string())?;
    let base_name = safe_media_file_name(file_name);
    let mut target = downloads.join(&base_name);
    let extension = target
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!(".{value}"))
        .unwrap_or_default();
    let stem = target
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Movena download")
        .to_string();
    let mut reserved_targets = manager
        .reserved_targets
        .lock()
        .map_err(|_| "The download manager is unavailable".to_string())?;
    let mut collision = 2;
    while target.exists() || reserved_targets.contains(&target) {
        target = downloads.join(format!("{stem} ({collision}){extension}"));
        collision += 1;
    }
    reserved_targets.insert(target.clone());
    Ok(target)
}

fn valid_download_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 120
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        })
}

async fn run_media_download(
    app: tauri::AppHandle,
    manager: DownloadManager,
    control: DownloadControl,
    options: DownloadMediaOptions,
    id: String,
) {
    let mut partial_for_cleanup = None;
    let mut reserved_target = None;
    let mut downloaded_for_event = 0_u64;
    let mut total_for_event = None;
    let result = async {
        let url = validate_remote_url(&options.url)?;
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(300))
            .redirect(same_origin_redirect_policy())
            .build()
            .map_err(|error| format!("Could not initialize downloader: {error}"))?;
        let response = client
            .get(url)
            .headers(remote_headers(options.headers)?)
            .send()
            .await
            .map_err(|_| "Could not download the media resource".to_string())?;
        if !response.status().is_success() {
            return Err(format!("The media URL answered {}", response.status().as_u16()));
        }
        const MAX_MEDIA_BYTES: u64 = 50 * 1024 * 1024 * 1024;
        if response.content_length().is_some_and(|length| length > MAX_MEDIA_BYTES) {
            return Err("The media resource is larger than Movena's 50 GiB safety limit".to_string());
        }
        let target = download_target(
            &app,
            &manager,
            options.directory.as_deref(),
            &options.file_name,
        )?;
        reserved_target = Some(target.clone());
        let partial = target.with_file_name(format!(".{id}.movena-part"));
        partial_for_cleanup = Some(partial.clone());
        let mut file = std::fs::File::create(&partial).map_err(|error| error.to_string())?;
        let total_bytes = response.content_length();
        total_for_event = total_bytes;
        let mut downloaded_bytes = 0_u64;
        let mut last_emit = Instant::now() - Duration::from_secs(1);
        emit_download_event(&app, DownloadStatusEvent { id: id.clone(), state: "downloading".to_string(), downloaded_bytes, total_bytes, path: None, error: None });
        let mut response = response;
        loop {
            if control.cancelled.load(Ordering::Acquire) {
                let _ = std::fs::remove_file(&partial);
                emit_download_event(&app, DownloadStatusEvent { id: id.clone(), state: "cancelled".to_string(), downloaded_bytes, total_bytes, path: None, error: None });
                return Ok::<(), String>(());
            }
            while control.paused.load(Ordering::Acquire) {
                emit_download_event(&app, DownloadStatusEvent { id: id.clone(), state: "paused".to_string(), downloaded_bytes, total_bytes, path: None, error: None });
                if control.cancelled.load(Ordering::Acquire) {
                    let _ = std::fs::remove_file(&partial);
                    emit_download_event(&app, DownloadStatusEvent { id: id.clone(), state: "cancelled".to_string(), downloaded_bytes, total_bytes, path: None, error: None });
                    return Ok::<(), String>(());
                }
                tokio::time::sleep(Duration::from_millis(150)).await;
            }
            let chunk = tokio::select! {
                _ = tokio::time::sleep(Duration::from_millis(100)) => continue,
                result = response.chunk() => result.map_err(|_| "The media download was interrupted".to_string())?,
            };
            let Some(chunk) = chunk else { break };
            if downloaded_bytes.saturating_add(chunk.len() as u64) > MAX_MEDIA_BYTES {
                return Err("The media resource exceeded Movena's 50 GiB safety limit".to_string());
            }
            file.write_all(&chunk).map_err(|error| error.to_string())?;
            downloaded_bytes = downloaded_bytes.saturating_add(chunk.len() as u64);
            downloaded_for_event = downloaded_bytes;
            if last_emit.elapsed() >= Duration::from_millis(250) {
                emit_download_event(&app, DownloadStatusEvent { id: id.clone(), state: "downloading".to_string(), downloaded_bytes, total_bytes, path: None, error: None });
                last_emit = Instant::now();
            }
        }
        if control.cancelled.load(Ordering::Acquire) {
            let _ = std::fs::remove_file(&partial);
            emit_download_event(&app, DownloadStatusEvent { id: id.clone(), state: "cancelled".to_string(), downloaded_bytes, total_bytes, path: None, error: None });
            return Ok::<(), String>(());
        }
        file.flush().map_err(|error| error.to_string())?;
        std::fs::rename(&partial, &target).map_err(|error| error.to_string())?;
        partial_for_cleanup = None;
        emit_download_event(&app, DownloadStatusEvent { id: id.clone(), state: "completed".to_string(), downloaded_bytes: total_bytes.unwrap_or(downloaded_bytes), total_bytes: total_bytes.or(Some(downloaded_bytes)), path: Some(target.to_string_lossy().into_owned()), error: None });
        Ok::<(), String>(())
    }.await;

    if let Err(error) = result {
        if let Some(partial) = partial_for_cleanup.as_ref() {
            let _ = std::fs::remove_file(partial);
        }
        emit_download_event(
            &app,
            DownloadStatusEvent {
                id: id.clone(),
                state: "failed".to_string(),
                downloaded_bytes: downloaded_for_event,
                total_bytes: total_for_event,
                path: None,
                error: Some(error),
            },
        );
    }
    if let Some(target) = reserved_target.as_ref() {
        if let Ok(mut reserved_targets) = manager.reserved_targets.lock() {
            reserved_targets.remove(target);
        }
    }
    if let Ok(mut jobs) = manager.jobs.lock() {
        jobs.remove(&id);
    }
}

#[tauri::command(async)]
async fn download_media_start(
    app: tauri::AppHandle,
    state: State<'_, DownloadManager>,
    mut options: DownloadMediaOptions,
) -> Result<(), String> {
    let id = options
        .id
        .take()
        .ok_or_else(|| "A download id is required".to_string())?;
    if !valid_download_id(&id) {
        return Err("The download id is invalid".to_string());
    }
    let control = DownloadControl {
        paused: Arc::new(AtomicBool::new(false)),
        cancelled: Arc::new(AtomicBool::new(false)),
    };
    {
        let mut jobs = state
            .jobs
            .lock()
            .map_err(|_| "The download manager is unavailable".to_string())?;
        if jobs.contains_key(&id) {
            return Err("This download is already active".to_string());
        }
        jobs.insert(id.clone(), control.clone());
    }
    let manager = state.inner().clone();
    let cleanup_id = id.clone();
    tauri::async_runtime::spawn(async move {
        run_media_download(
            app,
            manager,
            control,
            DownloadMediaOptions {
                id: Some(cleanup_id),
                ..options
            },
            id,
        )
        .await;
    });
    Ok(())
}

fn download_control(
    state: &State<'_, DownloadManager>,
    id: &str,
) -> Result<DownloadControl, String> {
    state
        .jobs
        .lock()
        .map_err(|_| "The download manager is unavailable".to_string())?
        .get(id)
        .cloned()
        .ok_or_else(|| "The download is no longer active".to_string())
}

#[tauri::command(async)]
async fn download_media_pause(
    app: tauri::AppHandle,
    state: State<'_, DownloadManager>,
    id: String,
) -> Result<(), String> {
    download_control(&state, &id)?
        .paused
        .store(true, Ordering::Release);
    emit_download_event(
        &app,
        DownloadStatusEvent {
            id,
            state: "paused".to_string(),
            downloaded_bytes: 0,
            total_bytes: None,
            path: None,
            error: None,
        },
    );
    Ok(())
}

#[tauri::command(async)]
async fn download_media_resume(
    app: tauri::AppHandle,
    state: State<'_, DownloadManager>,
    id: String,
) -> Result<(), String> {
    download_control(&state, &id)?
        .paused
        .store(false, Ordering::Release);
    emit_download_event(
        &app,
        DownloadStatusEvent {
            id,
            state: "downloading".to_string(),
            downloaded_bytes: 0,
            total_bytes: None,
            path: None,
            error: None,
        },
    );
    Ok(())
}

#[tauri::command(async)]
async fn download_media_cancel(
    app: tauri::AppHandle,
    state: State<'_, DownloadManager>,
    id: String,
) -> Result<(), String> {
    download_control(&state, &id)?
        .cancelled
        .store(true, Ordering::Release);
    emit_download_event(
        &app,
        DownloadStatusEvent {
            id,
            state: "cancelled".to_string(),
            downloaded_bytes: 0,
            total_bytes: None,
            path: None,
            error: None,
        },
    );
    Ok(())
}

fn safe_media_file_name(value: &str) -> String {
    let cleaned = value
        .chars()
        .map(|character| {
            if character.is_control()
                || ['<', '>', ':', '"', '/', '\\', '|', '?', '*'].contains(&character)
            {
                '_'
            } else {
                character
            }
        })
        .collect::<String>()
        .trim_matches([' ', '.'])
        .chars()
        .take(180)
        .collect::<String>();
    if cleaned.is_empty() {
        "Movena download".to_string()
    } else {
        cleaned
    }
}

#[tauri::command]
async fn m3u_fetch(app: tauri::AppHandle, options: M3uFetchOptions) -> Result<M3uDocument, String> {
    let cache_key = options.cache_key.clone();
    let request_key = remote_cache_key(&options);
    let cached = if let Some(source_id) = cache_key.as_deref() {
        validate_source_id(source_id)?;
        load_m3u_http_cache(&app, source_id).unwrap_or(None)
    } else {
        None
    }
    .filter(|cache| cache.request_key == request_key);
    let response = download_remote(
        options,
        MAX_M3U_BYTES,
        "playlist",
        cached.as_ref().map(|cache| &cache.validators),
    )
    .await?;
    match response {
        RemoteDownloadResult::NotModified => {
            let source_id = cache_key
                .as_deref()
                .ok_or_else(|| "The playlist cache is unavailable".to_string())?;
            m3u_cache_load(app.clone(), source_id.to_string())?
                .ok_or_else(|| "The playlist cache is unavailable".to_string())
        }
        RemoteDownloadResult::Modified(download) => {
            let document = M3uDocument {
                content: decode_m3u(&download.bytes),
                base_url: download.base_url,
                file_name: None,
            };
            if let Some(source_id) = cache_key.as_deref() {
                let cache = M3uHttpCache {
                    request_key,
                    validators: download.validators,
                };
                let _ = store_m3u_http_cache(&app, source_id, &cache);
            }
            Ok(document)
        }
    }
}

#[tauri::command]
async fn m3u_probe_stream(options: M3uProbeOptions) -> Result<M3uProbeResult, String> {
    let url = validate_remote_url(&options.url)?;
    let timeout_ms = options.timeout_ms.clamp(1_000, 30_000);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .redirect(same_origin_redirect_policy())
        .build()
        .map_err(|error| format!("Could not initialize the stream probe: {error}"))?;
    let mut headers = remote_headers(options.headers)?;
    headers.insert(
        reqwest::header::RANGE,
        reqwest::header::HeaderValue::from_static("bytes=0-1023"),
    );
    let started = Instant::now();
    let response = client.get(url).headers(headers).send().await;
    let latency_ms = started.elapsed().as_millis().min(u64::MAX as u128) as u64;

    match response {
        Ok(response) => {
            let code = response.status().as_u16();
            let status = if response.status().is_success() || response.status().is_redirection() {
                "online"
            } else if code == 401 || code == 403 {
                "unauthorized"
            } else {
                "offline"
            };
            Ok(M3uProbeResult {
                status: status.to_string(),
                http_status: Some(code),
                error_message: if status == "online" {
                    None
                } else {
                    Some(format!("Stream probe returned HTTP {}.", response.status()))
                },
                latency_ms,
            })
        }
        Err(error) => Ok(M3uProbeResult {
            status: if error.is_timeout() {
                "timeout"
            } else {
                "offline"
            }
            .to_string(),
            http_status: None,
            error_message: Some(error.to_string()),
            latency_ms,
        }),
    }
}

fn decode_xmltv(bytes: &[u8]) -> Result<String, String> {
    if !bytes.starts_with(&[0x1f, 0x8b]) {
        return Ok(decode_m3u(bytes));
    }
    let mut decoder = flate2::read::GzDecoder::new(bytes);
    let mut decoded = Vec::new();
    decoder
        .by_ref()
        .take((MAX_XMLTV_BYTES + 1) as u64)
        .read_to_end(&mut decoded)
        .map_err(|_| "The XMLTV guide could not be decompressed".to_string())?;
    if decoded.len() > MAX_XMLTV_BYTES {
        return Err("The XMLTV guide is too large".to_string());
    }
    Ok(decode_m3u(&decoded))
}

#[tauri::command]
async fn xmltv_fetch(
    app: tauri::AppHandle,
    options: M3uFetchOptions,
) -> Result<TextDocument, String> {
    let cache_key = remote_cache_key(&options);
    let cached = load_xmltv_http_cache(&app, &cache_key).unwrap_or(None);
    let now = unix_time_ms();
    if let Some(cache) = cached.as_ref() {
        if now.saturating_sub(cache.fetched_at_ms) < XMLTV_CACHE_FRESH_MS {
            return Ok(TextDocument {
                content: cache.content.clone(),
                cache_key: None,
            });
        }
    }

    let response = download_remote(
        options,
        MAX_XMLTV_BYTES,
        "XMLTV guide",
        cached.as_ref().map(|cache| &cache.validators),
    )
    .await?;
    let (cache, needs_validation) = match response {
        RemoteDownloadResult::NotModified => {
            let mut cache =
                cached.ok_or_else(|| "The XMLTV guide cache is unavailable".to_string())?;
            cache.fetched_at_ms = now;
            (cache, false)
        }
        RemoteDownloadResult::Modified(download) => {
            let bytes = download.bytes;
            let content = tauri::async_runtime::spawn_blocking(move || decode_xmltv(&bytes))
                .await
                .map_err(|e| format!("XMLTV decompression task failed: {e}"))??;
            (
                XmltvHttpCache {
                    content,
                    fetched_at_ms: now,
                    validators: download.validators,
                },
                true,
            )
        }
    };
    let stored = store_xmltv_http_cache(&app, &cache_key, &cache, needs_validation).is_ok();
    Ok(TextDocument {
        content: cache.content,
        cache_key: (needs_validation && stored).then_some(cache_key),
    })
}

fn read_m3u_path(path: &Path) -> Result<M3uDocument, String> {
    let metadata =
        std::fs::metadata(path).map_err(|_| "The playlist file is unavailable".to_string())?;
    if !metadata.is_file() || metadata.len() > MAX_M3U_BYTES as u64 {
        return Err("The playlist must be a file no larger than 64 MiB".to_string());
    }
    let bytes = std::fs::read(path).map_err(|_| "Could not read the playlist file".to_string())?;
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let base_url = url::Url::from_directory_path(parent)
        .map_err(|_| "Could not resolve the playlist directory".to_string())?
        .to_string();
    Ok(M3uDocument {
        content: decode_m3u(&bytes),
        base_url,
        file_name: path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned()),
    })
}

#[tauri::command(async)]
fn m3u_read_file(path: String) -> Result<M3uDocument, String> {
    read_m3u_path(Path::new(&path))
}

fn m3u_cache_path(app: &tauri::AppHandle, source_id: &str) -> Result<PathBuf, String> {
    validate_source_id(source_id)?;
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|_| "Application data is unavailable".to_string())?
        .join("m3u-cache");
    std::fs::create_dir_all(&directory)
        .map_err(|_| "Could not create the playlist cache".to_string())?;
    Ok(directory.join(format!("{source_id}.json")))
}

fn m3u_http_cache_path(app: &tauri::AppHandle, source_id: &str) -> Result<PathBuf, String> {
    Ok(m3u_cache_path(app, source_id)?.with_extension("http.json"))
}

fn load_m3u_http_cache(
    app: &tauri::AppHandle,
    source_id: &str,
) -> Result<Option<M3uHttpCache>, String> {
    let path = m3u_http_cache_path(app, source_id)?;
    if !path.exists() {
        return Ok(None);
    }
    let bytes =
        std::fs::read(path).map_err(|_| "Could not read the playlist HTTP cache".to_string())?;
    if bytes.len() > 32 * 1024 {
        return Err("The playlist HTTP cache is invalid".to_string());
    }
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|_| "The playlist HTTP cache is invalid".to_string())
}

fn store_m3u_http_cache(
    app: &tauri::AppHandle,
    source_id: &str,
    cache: &M3uHttpCache,
) -> Result<(), String> {
    let bytes = serde_json::to_vec(cache)
        .map_err(|_| "Could not encode the playlist HTTP cache".to_string())?;
    std::fs::write(m3u_http_cache_path(app, source_id)?, bytes)
        .map_err(|_| "Could not store the playlist HTTP cache".to_string())
}

fn remote_cache_key(options: &M3uFetchOptions) -> String {
    let mut identity = options.url.clone();
    let mut headers: Vec<_> = options.headers.iter().collect();
    headers.sort_by(|left, right| {
        left.0
            .to_ascii_lowercase()
            .cmp(&right.0.to_ascii_lowercase())
    });
    for (name, value) in headers {
        identity.push('\n');
        identity.push_str(&name.to_ascii_lowercase());
        identity.push(':');
        identity.push_str(value);
    }
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in identity.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

fn unix_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

fn xmltv_http_cache_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|_| "Application data is unavailable".to_string())?
        .join("xmltv-cache");
    std::fs::create_dir_all(&directory)
        .map_err(|_| "Could not create the XMLTV guide cache".to_string())?;
    Ok(directory)
}

fn validate_remote_cache_key(cache_key: &str) -> Result<(), String> {
    if cache_key.len() != 16
        || !cache_key
            .chars()
            .all(|character| character.is_ascii_hexdigit())
    {
        return Err("Invalid remote cache key".to_string());
    }
    Ok(())
}

fn xmltv_http_cache_paths(
    app: &tauri::AppHandle,
    cache_key: &str,
    pending: bool,
) -> Result<(PathBuf, PathBuf), String> {
    validate_remote_cache_key(cache_key)?;
    let directory = xmltv_http_cache_directory(app)?;
    let qualifier = if pending { ".pending" } else { "" };
    Ok((
        directory.join(format!("{cache_key}{qualifier}.xml")),
        directory.join(format!("{cache_key}{qualifier}.json")),
    ))
}

fn load_xmltv_http_cache(
    app: &tauri::AppHandle,
    cache_key: &str,
) -> Result<Option<XmltvHttpCache>, String> {
    let (content_path, metadata_path) = xmltv_http_cache_paths(app, cache_key, false)?;
    if !metadata_path.exists() || !content_path.exists() {
        return Ok(None);
    }
    let metadata_bytes = std::fs::read(metadata_path)
        .map_err(|_| "Could not read the XMLTV guide cache".to_string())?;
    if metadata_bytes.len() > 32 * 1024 {
        return Err("The XMLTV guide cache is invalid".to_string());
    }
    let metadata: XmltvHttpMetadata = serde_json::from_slice(&metadata_bytes)
        .map_err(|_| "The XMLTV guide cache is invalid".to_string())?;
    let content_bytes = std::fs::read(content_path)
        .map_err(|_| "Could not read the XMLTV guide cache".to_string())?;
    if content_bytes.len() > MAX_XMLTV_BYTES {
        return Err("The XMLTV guide cache is invalid".to_string());
    }
    let content = String::from_utf8(content_bytes)
        .map_err(|_| "The XMLTV guide cache is invalid".to_string())?;
    Ok(Some(XmltvHttpCache {
        content,
        fetched_at_ms: metadata.fetched_at_ms,
        validators: metadata.validators,
    }))
}

fn store_xmltv_http_cache(
    app: &tauri::AppHandle,
    cache_key: &str,
    cache: &XmltvHttpCache,
    pending: bool,
) -> Result<(), String> {
    if cache.content.len() > MAX_XMLTV_BYTES {
        return Err("The XMLTV guide cache is too large".to_string());
    }
    let metadata = XmltvHttpMetadata {
        fetched_at_ms: cache.fetched_at_ms,
        validators: cache.validators.clone(),
    };
    let metadata_bytes = serde_json::to_vec(&metadata)
        .map_err(|_| "Could not encode the XMLTV guide cache".to_string())?;
    let (content_path, metadata_path) = xmltv_http_cache_paths(app, cache_key, pending)?;
    std::fs::write(content_path, cache.content.as_bytes())
        .map_err(|_| "Could not store the XMLTV guide cache".to_string())?;
    std::fs::write(metadata_path, metadata_bytes)
        .map_err(|_| "Could not store the XMLTV guide cache".to_string())
}

#[tauri::command(async)]
fn xmltv_cache_commit(app: tauri::AppHandle, cache_key: String) -> Result<(), String> {
    let (pending_content, pending_metadata) = xmltv_http_cache_paths(&app, &cache_key, true)?;
    let (content, metadata) = xmltv_http_cache_paths(&app, &cache_key, false)?;
    if !pending_content.exists() || !pending_metadata.exists() {
        return Ok(());
    }
    for path in [&content, &metadata] {
        match std::fs::remove_file(path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err("Could not replace the XMLTV guide cache".to_string()),
        }
    }
    std::fs::rename(pending_content, content)
        .map_err(|_| "Could not validate the XMLTV guide cache".to_string())?;
    std::fs::rename(pending_metadata, metadata)
        .map_err(|_| "Could not validate the XMLTV guide cache".to_string())
}

#[tauri::command(async)]
fn m3u_cache_store(
    app: tauri::AppHandle,
    source_id: String,
    document: M3uDocument,
) -> Result<(), String> {
    if document.content.len() > MAX_M3U_BYTES {
        return Err("The playlist is larger than 64 MiB".to_string());
    }
    let bytes = serde_json::to_vec(&document)
        .map_err(|_| "Could not encode the playlist cache".to_string())?;
    std::fs::write(m3u_cache_path(&app, &source_id)?, bytes)
        .map_err(|_| "Could not store the playlist cache".to_string())
}

#[tauri::command(async)]
fn m3u_cache_load(app: tauri::AppHandle, source_id: String) -> Result<Option<M3uDocument>, String> {
    let path = m3u_cache_path(&app, &source_id)?;
    if !path.exists() {
        return Ok(None);
    }
    let bytes = std::fs::read(path).map_err(|_| "Could not read the playlist cache".to_string())?;
    if bytes.len() > MAX_M3U_BYTES + 16 * 1024 {
        return Err("The playlist cache is invalid".to_string());
    }
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|_| "The playlist cache is invalid".to_string())
}

#[tauri::command(async)]
fn m3u_cache_delete(app: tauri::AppHandle, source_id: String) -> Result<(), String> {
    let paths = [
        m3u_cache_path(&app, &source_id)?,
        m3u_http_cache_path(&app, &source_id)?,
    ];
    for path in paths {
        match std::fs::remove_file(path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err("Could not remove the playlist cache".to_string()),
        }
    }
    Ok(())
}

fn looks_like_xmltv_prefix(bytes: &[u8]) -> bool {
    if bytes.starts_with(&[0x1f, 0x8b]) {
        return true;
    }
    let text = String::from_utf8_lossy(&bytes[..bytes.len().min(512)]).to_ascii_lowercase();
    text.contains("<tv") || text.contains("<?xml")
}

/// Checks only the opening response chunk so guide auto-detection works for
/// providers that do not permit a webview-origin CORS request.
#[tauri::command(async)]
async fn xmltv_probe(options: M3uFetchOptions) -> Result<bool, String> {
    let url = validate_remote_url(&options.url)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .redirect(same_origin_redirect_policy())
        .build()
        .map_err(|_| "Could not initialize the XMLTV downloader".to_string())?;
    let mut response = client
        .get(url)
        .headers(remote_headers(options.headers)?)
        .send()
        .await
        .map_err(|_| "Could not download the XMLTV guide".to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "The XMLTV guide URL answered {}",
            response.status().as_u16()
        ));
    }
    let chunk = response
        .chunk()
        .await
        .map_err(|_| "The XMLTV guide download was interrupted".to_string())?;
    Ok(chunk.as_deref().is_some_and(looks_like_xmltv_prefix))
}

/// Removes only Movena-owned application data. User-selected playlist and
/// download locations are intentionally outside this boundary.
#[tauri::command(async)]
fn app_data_clear(app: tauri::AppHandle, source_ids: Vec<String>) -> Result<(), String> {
    for source_id in source_ids {
        match source_secret_entry(&source_id)?.delete_credential() {
            Ok(()) | Err(keyring::v1::Error::NoEntry) => {}
            Err(error) => return Err(format!("Failed to delete source credential: {error}")),
        }
    }
    credentials::credential_delete()?;

    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|_| "Application data is unavailable".to_string())?;
    for directory in ["m3u-cache", "xmltv-cache"] {
        let path = app_data.join(directory);
        match std::fs::remove_dir_all(path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err("Could not remove cached application data".to_string()),
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(native_player::NativePlayerManager::default())
        .manage(DownloadManager::default())
        .invoke_handler(tauri::generate_handler![
            window_commands::player_set_fullscreen,
            window_commands::player_set_cursor_hidden,
            credentials::credential_store,
            credentials::credential_load,
            credentials::credential_delete,
            source_secret_store,
            source_secret_load,
            source_secret_delete,
            m3u_fetch,
            m3u_probe_stream,
            xmltv_fetch,
            xmltv_probe,
            download_media_start,
            download_media_pause,
            download_media_resume,
            download_media_cancel,
            xmltv_cache_commit,
            m3u_read_file,
            m3u_write_file,
            m3u_cache_store,
            m3u_cache_load,
            m3u_cache_delete,
            app_data_clear,
            settings_config_read,
            settings_config_write,
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
            native_player::mpv_command,
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
        .setup(|app| {
            // Claim the dock icon before any stream can start, and take native
            // fullscreen off the table — see macos_embed.
            #[cfg(target_os = "macos")]
            macos_embed::prepare_main_window(app.handle());

            if cfg!(debug_assertions) {
                app.handle().plugin(
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
    use super::{
        apply_conditional_headers, decode_m3u, decode_xmltv, looks_like_xmltv_prefix,
        remote_cache_key, validate_m3u_write_path, validate_remote_cache_key, validate_remote_url,
        validate_settings_path, validate_source_id, HttpValidators,
        M3uFetchOptions,
    };
    use flate2::{write::GzEncoder, Compression};
    use std::collections::HashMap;
    use std::io::Write;

    #[test]
    fn validates_source_ids_and_remote_schemes() {
        assert!(validate_source_id("m3u-12345678").is_ok());
        assert!(validate_source_id("../cache").is_err());
        assert!(validate_remote_url("https://list.test/main.m3u").is_ok());
        assert!(validate_remote_url("file:///private/list.m3u").is_err());
        assert!(validate_remote_url("http://list.test/main.m3u").is_ok());
    }

    #[test]
    fn decodes_legacy_playlists_and_gzipped_guides() {
        assert_eq!(decode_m3u(&[b'#', 0x80]), "#€");

        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(b"<tv></tv>").unwrap();
        let compressed = encoder.finish().unwrap();
        assert_eq!(decode_xmltv(&compressed).unwrap(), "<tv></tv>");
    }

    #[test]
    fn identifies_xmltv_probe_prefixes_without_downloading_the_full_guide() {
        assert!(looks_like_xmltv_prefix(b"<?xml version=\"1.0\"?><tv></tv>"));
        assert!(looks_like_xmltv_prefix(&[0x1f, 0x8b, 0x08]));
        assert!(!looks_like_xmltv_prefix(b"#EXTM3U\n#EXTINF:-1,Channel"));
    }

    #[test]
    fn validates_settings_config_paths() {
        assert!(validate_settings_path("backup.json").is_ok());
        assert!(validate_settings_path("C:/Users/test/backup.json").is_ok());
        assert!(validate_settings_path("../../../etc/passwd").is_err());
        assert!(validate_settings_path("backup.txt").is_err());
        assert!(validate_settings_path("backup").is_err());
    }

    #[test]
    fn validates_m3u_write_paths() {
        assert!(validate_m3u_write_path("playlist.m3u").is_ok());
        assert!(validate_m3u_write_path("playlist.m3u8").is_ok());
        assert!(validate_m3u_write_path("playlist.txt").is_ok());
        assert!(validate_m3u_write_path("C:/Users/test/playlist.m3u").is_ok());
        assert!(validate_m3u_write_path("../../../etc/cron.d").is_err());
        assert!(validate_m3u_write_path("playlist.exe").is_err());
        assert!(validate_m3u_write_path("playlist").is_err());
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

    #[test]
    fn validates_opaque_remote_cache_keys() {
        assert!(validate_remote_cache_key("0123456789abcdef").is_ok());
        assert!(validate_remote_cache_key("../../guide").is_err());
        assert!(validate_remote_cache_key("not-hexadecimal!").is_err());
    }
}
