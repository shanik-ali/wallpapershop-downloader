import { useEffect, useRef, useState } from "react";
import { User, ChevronDown, Plus, Trash2 } from "lucide-react";
import * as tauri from "@/lib/tauri";
import type { GuardPrompt } from "@/lib/tauri";
import { SteamGuardModal } from "@/components/ui/SteamGuardModal";
import { VerifyAccountModal } from "@/components/ui/VerifyAccountModal";

export interface Account {
    id: string;
    username: string;
    password: string;
}

interface AccountSelectorProps {
    accounts: Account[];
    selectedAccountId: string;
    onAccountChange: (accountId: string) => void;
    onAddAccount: (username: string, password: string) => void;
    onRemoveAccount: (accountId: string) => void;
}

type VerifyState =
    | { status: "idle" }
    | { status: "verifying"; taskId: string }
    | { status: "error"; taskId: string; message: string };

export function AccountSelector({
    accounts,
    selectedAccountId,
    onAccountChange,
    onAddAccount,
    onRemoveAccount,
}: AccountSelectorProps) {
    const [showForm, setShowForm] = useState(false);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");

    const [verify, setVerify] = useState<VerifyState>({ status: "idle" });
    const [guardPrompt, setGuardPrompt] = useState<GuardPrompt | null>(null);
    // Tracks the task id of the verification currently in flight, so a
    // Guard event or a late verify result from a cancelled/superseded
    // attempt doesn't get applied to a newer one.
    const activeTaskIdRef = useRef<string | null>(null);

    useEffect(() => {
        const unlistenPromise = tauri.listenDownloadGuardNeeded((prompt) => {
            if (prompt.task_id === activeTaskIdRef.current) {
                setGuardPrompt(prompt);
            }
        });
        return () => {
            unlistenPromise.then((unlisten) => unlisten());
        };
    }, []);

    const runVerification = async (taskId: string, u: string, p: string) => {
        activeTaskIdRef.current = taskId;
        setGuardPrompt(null);
        setVerify({ status: "verifying", taskId });

        try {
            await tauri.verifyAccount(taskId, u, p);
            if (activeTaskIdRef.current !== taskId) return; // superseded/cancelled

            onAddAccount(u, p);
            setUsername("");
            setPassword("");
            setShowForm(false);
            setVerify({ status: "idle" });
            setGuardPrompt(null);
        } catch (error) {
            if (activeTaskIdRef.current !== taskId) return; // superseded/cancelled
            const message = error instanceof Error ? error.message : String(error);
            setVerify({ status: "error", taskId, message });
            setGuardPrompt(null);
        }
    };

    const handleSave = () => {
        const u = username.trim();
        if (!u || !password) return;
        const taskId = crypto.randomUUID();
        void runVerification(taskId, u, password);
    };

    const handleGuardSubmit = async (code: string) => {
        if (!guardPrompt) return;
        await tauri.submitGuardCode(guardPrompt.task_id, code);
        setGuardPrompt(null);
        // Verification keeps running in the background; the VerifyAccountModal
        // ("Checking account with Steam...") reappears automatically since
        // `verify.status` is still "verifying" underneath this prompt.
    };

    const handleManualGuardSubmit = async (code: string) => {
        const taskId = verify.status === "verifying" ? verify.taskId : null;
        if (!taskId) return;
        await tauri.submitGuardCode(taskId, code);
    };

    const handleCancelVerify = () => {
        // The backend check cleans itself up on its own (it always kills the
        // process and deletes its temp folder after a result or a timeout),
        // so cancelling here just stops the UI from waiting on it.
        activeTaskIdRef.current = null;
        setGuardPrompt(null);
        setVerify({ status: "idle" });
    };

    const handleRetryVerify = () => {
        const u = username.trim();
        if (!u || !password) return;
        const taskId = crypto.randomUUID();
        void runVerification(taskId, u, password);
    };

    return (
        <div className="bg-surface rounded-lg p-3 border border-border">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-medium">Steam Account</span>
                </div>
                <div className="flex items-center gap-2">
                    {accounts.length > 0 && selectedAccountId && (
                        <button
                            type="button"
                            onClick={() => onRemoveAccount(selectedAccountId)}
                            title="Remove selected account"
                            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            Remove
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setShowForm((v) => !v)}
                        className="flex items-center gap-1 text-xs text-primary hover:opacity-70"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Add
                    </button>
                </div>
            </div>

            {accounts.length > 0 ? (
                <div className="relative">
                    <select
                        value={selectedAccountId}
                        onChange={(e) => onAccountChange(e.target.value)}
                        className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm appearance-none cursor-pointer"
                    >
                        {accounts.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                                {acc.username}
                            </option>
                        ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                </div>
            ) : (
                <p className="text-xs text-foreground-muted">
                    No accounts yet. Click "Add" to save one.
                </p>
            )}

            {showForm && (
                <div className="mt-3 space-y-2">
                    <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Steam username"
                        autoComplete="off"
                        className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm"
                    />
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSave()}
                        placeholder="Password"
                        autoComplete="off"
                        className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm"
                    />
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={!username.trim() || !password}
                        className="w-full px-3 py-2 rounded-md text-sm font-medium bg-foreground text-surface disabled:opacity-40"
                    >
                        Save account
                    </button>
                    <p className="text-[11px] text-foreground-muted text-center">
                        We'll check this with Steam before saving it.
                    </p>
                </div>
            )}

            {verify.status !== "idle" && !guardPrompt && (
                <VerifyAccountModal
                    status={verify.status}
                    message={verify.status === "error" ? verify.message : undefined}
                    onCancel={handleCancelVerify}
                    onRetry={handleRetryVerify}
                    onManualSubmit={handleManualGuardSubmit}
                />
            )}

            {guardPrompt && (
                <SteamGuardModal prompt={guardPrompt} onSubmit={handleGuardSubmit} />
            )}
        </div>
    );
}
