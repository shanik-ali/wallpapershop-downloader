use std::collections::HashMap;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{ChildStdin, Command};
use tokio::sync::Mutex;
use regex::Regex;
use tauri::{AppHandle, Emitter, State};
use crate::models::DownloadTask;

/// Progress update payload for frontend
#[derive(Clone, serde::Serialize)]
pub struct ProgressPayload {
    pub task_id: String,
    pub progress: f32,
    pub speed: Option<String>,
    pub eta: Option<String>,
}

/// Which kind of Steam Guard step a prompt line looks like it's asking for.
/// "Unknown" still carries the raw line so the UI can show it as-is rather
/// than guessing wrong -- this project doesn't control the exact wording
/// DepotDownloaderMod prints, so the heuristic below is intentionally loose.
#[derive(Clone, Copy, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum GuardKind {
    Email,
    Device,
    Unknown,
}

/// Emitted when a running download's output looks like it's waiting on a
/// Steam Guard code or confirmation, so the UI can prompt the user for it.
#[derive(Clone, serde::Serialize)]
pub struct GuardPayload {
    pub task_id: String,
    pub line: String,
    pub kind: GuardKind,
}

/// Holds the stdin pipe for each in-progress download task, keyed by task
/// id, so a Steam Guard code typed in the UI can be written to the right
/// child process. Managed as Tauri state (`app.manage(...)`).
#[derive(Default)]
pub struct GuardInputRegistry(pub Mutex<HashMap<String, ChildStdin>>);

/// Downloader service for DepotDownloader management
pub struct DownloaderService;

impl DownloaderService {
    /// Check if .NET 9.0 Runtime is installed
    pub async fn check_dotnet_runtime() -> Result<bool, String> {
        let output = Command::new("dotnet")
            .arg("--list-runtimes")
            .output()
            .await
            .map_err(|e| format!("Failed to check .NET: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        // Check for .NET 9.x
        Ok(stdout.contains("Microsoft.NETCore.App 9."))
    }

    /// Kill all DepotDownloader processes
    #[cfg(target_os = "windows")]
    pub async fn cleanup_processes() -> Result<(), String> {
        Command::new("taskkill")
            .args(["/F", "/IM", "DepotDownloaderMod.exe"])
            .output()
            .await
            .ok(); // Ignore errors if no process found
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    pub async fn cleanup_processes() -> Result<(), String> {
        Ok(())
    }

    /// Parse progress from DepotDownloader output
    pub fn parse_progress(line: &str) -> Option<f32> {
        // Pattern: "Downloading 'file.pak' (45.2 MB / 100.0 MB)"
        let re = Regex::new(r"(\d+\.?\d*)\s*MB\s*/\s*(\d+\.?\d*)\s*MB").ok()?;
        if let Some(caps) = re.captures(line) {
            let current: f32 = caps.get(1)?.as_str().parse().ok()?;
            let total: f32 = caps.get(2)?.as_str().parse().ok()?;
            if total > 0.0 {
                return Some((current / total) * 100.0);
            }
        }
        None
    }

    /// Heuristic check for a line that looks like the downloader is waiting
    /// on a Steam Guard code or an in-app confirmation. Matched case-
    /// insensitively against keywords rather than one exact sentence, since
    /// the bundled tool's exact wording isn't something this project
    /// controls or has verified byte-for-byte. The raw line is always sent
    /// to the UI alongside the guess, so a wrong guess still shows the user
    /// what Steam/the tool actually said.
    pub fn detect_guard_prompt(line: &str) -> Option<GuardKind> {
        let lower = line.to_lowercase();

        let mentions_guard_or_2fa = lower.contains("steam guard")
            || lower.contains("two-factor")
            || lower.contains("two factor")
            || lower.contains("2fa");

        let mentions_email_code = lower.contains("email") && (lower.contains("code") || lower.contains("guard"));
        let mentions_device_code = (lower.contains("authenticator") || lower.contains("mobile"))
            && (lower.contains("code") || lower.contains("guard"));

        if !(mentions_guard_or_2fa || mentions_email_code || mentions_device_code) {
            return None;
        }

        if mentions_email_code {
            Some(GuardKind::Email)
        } else if mentions_device_code {
            Some(GuardKind::Device)
        } else {
            Some(GuardKind::Unknown)
        }
    }

    /// Spawn DepotDownloader process and stream progress
    #[cfg(target_os = "windows")]
    pub async fn spawn_download(
        app_handle: AppHandle,
        task: &DownloadTask,
        exe_path: std::path::PathBuf,
        password: String,
        registry: State<'_, GuardInputRegistry>,
    ) -> Result<(), String> {
        use std::os::windows::process::CommandExt;

        // Use download_path directly - user already selects the full path (e.g., D:\Wallpaper Engine\projects\myprojects)
        // Only append pubfile_id to create a subfolder for each wallpaper
        let output_dir = format!(
            "{}\\{}",
            task.download_path, task.pubfile_id
        );

        let mut child = Command::new(&exe_path)
            .args([
                "-app", &task.app_id,
                "-pubfile", &task.pubfile_id,
                "-verify-all",
                "-username", &task.account,
                "-password", &password,
                "-remember-password",
                "-dir", &output_dir,
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .spawn()
            .map_err(|e| format!("Failed to spawn DepotDownloader: {}", e))?;

        // Keep the stdin pipe reachable by task id so submit_guard_code can
        // write a Steam Guard code into this exact process later.
        let stdin = child.stdin.take()
            .ok_or("Failed to capture stdin")?;
        {
            let mut map = registry.0.lock().await;
            map.insert(task.id.clone(), stdin);
        }

        let stdout = child.stdout.take()
            .ok_or("Failed to capture stdout")?;

        let task_id = task.id.clone();
        let app = app_handle.clone();

        // Stream stdout, emit progress, and watch for a Steam Guard prompt.
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                // Emit log line
                let _ = app.emit("download-log", serde_json::json!({
                    "task_id": &task_id,
                    "line": &line
                }));

                // Parse and emit progress
                if let Some(progress) = Self::parse_progress(&line) {
                    let _ = app.emit("download-progress", ProgressPayload {
                        task_id: task_id.clone(),
                        progress,
                        speed: None, // TODO: parse speed
                        eta: None,   // TODO: calculate ETA
                    });
                }

                // If this line looks like a Steam Guard prompt, tell the UI
                // so it can ask the user for a code instead of leaving the
                // process waiting on input it will never receive.
                if let Some(kind) = Self::detect_guard_prompt(&line) {
                    let _ = app.emit("download-guard-needed", GuardPayload {
                        task_id: task_id.clone(),
                        line: line.clone(),
                        kind,
                    });
                }
            }
        });

        // Wait for process to complete
        let status = child.wait().await
            .map_err(|e| format!("Process error: {}", e))?;

        // This task's stdin is no longer writable either way; drop it so a
        // stale handle can't be written to by a later, unrelated code entry.
        {
            let mut map = registry.0.lock().await;
            map.remove(&task.id);
        }

        if status.success() {
            Ok(())
        } else {
            Err(format!("Download failed with exit code: {:?}", status.code()))
        }
    }

    #[cfg(not(target_os = "windows"))]
    pub async fn spawn_download(
        _app_handle: AppHandle,
        _task: &DownloadTask,
        _exe_path: std::path::PathBuf,
        _password: String,
        _registry: State<'_, GuardInputRegistry>,
    ) -> Result<(), String> {
        Err("Windows only".to_string())
    }

    /// Write a Steam Guard code (or any other line of text DepotDownloader
    /// is waiting on) into the stdin of the process running `task_id`.
    pub async fn submit_guard_code(
        registry: State<'_, GuardInputRegistry>,
        task_id: &str,
        code: &str,
    ) -> Result<(), String> {
        let mut map = registry.0.lock().await;
        let stdin = map
            .get_mut(task_id)
            .ok_or_else(|| "No active download is waiting for input for this task".to_string())?;

        let payload = format!("{}\n", code.trim());
        stdin
            .write_all(payload.as_bytes())
            .await
            .map_err(|e| format!("Failed to send code: {}", e))?;
        stdin
            .flush()
            .await
            .map_err(|e| format!("Failed to send code: {}", e))?;

        Ok(())
    }

    /// Log into a Steam account (handling Steam Guard via the same
    /// download-guard-needed / submit_guard_code flow used for real
    /// downloads) WITHOUT actually fetching real content, so the account
    /// can be confirmed working before it's saved.
    ///
    /// There is no dedicated "login only" flag on the bundled tool's CLI, so
    /// this runs it against AppID 480 (Valve's "Spacewar" test app, free and
    /// owned by every Steam account) with a placeholder pubfile id. That
    /// pubfile id won't resolve to a real item, so the process is expected
    /// to fail AFTER login -- what we're watching for is what happens
    /// *before* that point:
    ///   - a Steam Guard prompt -> forwarded to the UI as usual.
    ///   - an explicit login-failure line (bad password, rate limit, etc.)
    ///     -> verification fails with that message.
    ///   - any line showing it moved on to resolving/downloading content
    ///     -> login succeeded, so we kill the process and report success.
    /// If the process exits with none of the above (no clear signal either
    /// way), this reports failure rather than guessing success.
    #[cfg(target_os = "windows")]
    pub async fn verify_account(
        app_handle: AppHandle,
        exe_path: std::path::PathBuf,
        task_id: String,
        username: String,
        password: String,
        registry: State<'_, GuardInputRegistry>,
    ) -> Result<(), String> {
        use std::os::windows::process::CommandExt;

        let verify_dir = std::env::temp_dir().join(format!("wallpapershop-verify-{}", task_id));
        let verify_dir_str = verify_dir.to_string_lossy().to_string();

        let mut child = Command::new(&exe_path)
            .args([
                "-app", "480",
                "-pubfile", "0",
                "-username", &username,
                "-password", &password,
                "-dir", &verify_dir_str,
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .spawn()
            .map_err(|e| format!("Failed to start Steam login check: {}", e))?;

        let stdin = child.stdin.take().ok_or("Failed to capture stdin")?;
        {
            let mut map = registry.0.lock().await;
            map.insert(task_id.clone(), stdin);
        }

        let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;

        // Two-phase timeout: before any Guard prompt is seen, a stall means
        // a network/connection problem, so that phase times out fairly
        // quickly. Once a Guard prompt has been shown, the clock is almost
        // entirely in the user's hands (read an email, copy a code), which
        // can easily take minutes -- so that phase gets a much longer
        // allowance instead of reusing the short one.
        let before_guard_timeout = std::time::Duration::from_secs(60);
        let after_guard_timeout = std::time::Duration::from_secs(600);

        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        let mut guard_seen = false;

        let result: Result<(), String> = loop {
            let step_timeout = if guard_seen { after_guard_timeout } else { before_guard_timeout };

            let next = match tokio::time::timeout(step_timeout, lines.next_line()).await {
                Ok(Ok(Some(line))) => line,
                Ok(Ok(None)) => {
                    // Process closed stdout (exited) with no clear signal.
                    break Err(
                        "Couldn't confirm the login succeeded (the check ended before a clear result). Try again.".to_string(),
                    );
                }
                Ok(Err(e)) => break Err(format!("Lost connection to the login check: {}", e)),
                Err(_) => {
                    break Err(if guard_seen {
                        "Still waiting on that code after a while -- if you've already entered it, try again.".to_string()
                    } else {
                        "Timed out waiting for Steam to respond. Check your internet connection and try again.".to_string()
                    });
                }
            };

            let _ = app_handle.emit("download-log", serde_json::json!({
                "task_id": &task_id,
                "line": &next
            }));

            if let Some(kind) = Self::detect_guard_prompt(&next) {
                guard_seen = true;
                let _ = app_handle.emit("download-guard-needed", GuardPayload {
                    task_id: task_id.clone(),
                    line: next.clone(),
                    kind,
                });
                continue;
            }

            let lower = next.to_lowercase();

            let looks_like_failure = (lower.contains("password") || lower.contains("login") || lower.contains("logon"))
                && (lower.contains("invalid")
                    || lower.contains("incorrect")
                    || lower.contains("failed")
                    || lower.contains("denied")
                    || lower.contains("rate limit")
                    || lower.contains("banned")
                    || lower.contains("locked"));

            if looks_like_failure {
                break Err(format!("Steam rejected this login: {}", next));
            }

            // Any sign the tool moved past login into resolving/fetching
            // content is proof login worked, even though this specific
            // (placeholder) item will go on to fail for unrelated reasons.
            // That's expected and fine -- we stop here.
            let past_login = lower.contains("pubfile")
                || lower.contains("depot")
                || lower.contains("manifest")
                || lower.contains("app info")
                || lower.contains("workshop")
                || Self::parse_progress(&next).is_some();

            if past_login {
                break Ok(());
            }
        };

        let _ = child.kill().await;
        let _ = child.wait().await;
        {
            let mut map = registry.0.lock().await;
            map.remove(&task_id);
        }
        let _ = tokio::fs::remove_dir_all(&verify_dir).await;

        result
    }

    #[cfg(not(target_os = "windows"))]
    pub async fn verify_account(
        _app_handle: AppHandle,
        _exe_path: std::path::PathBuf,
        _task_id: String,
        _username: String,
        _password: String,
        _registry: State<'_, GuardInputRegistry>,
    ) -> Result<(), String> {
        Err("Windows only".to_string())
    }
}
