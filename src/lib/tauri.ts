import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";



export interface AppSettings {
    download_path: string;
    max_concurrent_downloads: number;
    auto_retry: boolean;
    retry_attempts: number;
    default_account?: string;
    theme: string;
}

// System Commands
export async function checkDotnetRuntime(): Promise<boolean> {
    return invoke<boolean>("check_dotnet_runtime");
}

export async function selectFolder(appId?: string): Promise<string | null> {
    return invoke<string | null>("select_folder", { appId });
}

export async function loadSettings(): Promise<AppSettings> {
    return invoke<AppSettings>("load_settings");
}

export async function saveSettings(settings: AppSettings): Promise<void> {
    return invoke("save_settings", { settings });
}

// Steam API
export interface SteamGameResult {
    app_id: string;
    name: string;
    icon: string | null;
}

export async function searchSteamGames(query: string): Promise<SteamGameResult[]> {
    return invoke<SteamGameResult[]>("search_steam_games", { query });
}

// Workshop Details API
export interface WorkshopItemDetails {
    publishedfileid: string;
    title: string;
    preview_url: string | null;
    description: string | null;
    creator: string | null;
    file_size: number | null;
}

export async function getWorkshopDetails(pubfileId: string): Promise<WorkshopItemDetails> {
    return invoke<WorkshopItemDetails>("get_workshop_details", { pubfileId });
}

// Download Commands
export async function startDownload(
    taskId: string,
    pubfileId: string,
    account: string,
    password: string,
    downloadPath: string,
    appId: string
): Promise<void> {
    return invoke("start_download", {
        taskId,
        pubfileId,
        account,
        password,
        downloadPath,
        appId,
    });
}

// Steam Guard
export async function submitGuardCode(taskId: string, code: string): Promise<void> {
    return invoke("submit_guard_code", { taskId, code });
}

// Verify a Steam account logs in successfully (Guard handled the same way
// as a real download) before it's saved to the account list.
export async function verifyAccount(taskId: string, username: string, password: string): Promise<void> {
    return invoke("verify_account", { taskId, username, password });
}





// Event Listeners
export async function listenDownloadLog(callback: (log: { task_id: string; line: string }) => void) {
    return listen("download-log", (event) => callback(event.payload as any));
}

// Fired when a running download's output looks like it's waiting on a
// Steam Guard code or confirmation. `kind` is a best-effort guess
// ("email" | "device" | "unknown") -- the raw `line` is always included so
// the UI can show what the downloader actually said even if the guess is
// wrong or it's some other kind of prompt entirely.
export interface GuardPrompt {
    task_id: string;
    line: string;
    kind: "email" | "device" | "unknown";
}

export async function listenDownloadGuardNeeded(callback: (prompt: GuardPrompt) => void) {
    return listen("download-guard-needed", (event) => callback(event.payload as GuardPrompt));
}


