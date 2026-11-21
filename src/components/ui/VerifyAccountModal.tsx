import { useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";

interface VerifyAccountModalProps {
    status: "verifying" | "error";
    message?: string;
    onCancel: () => void;
    onRetry: () => void;
    /** Send a code straight to the login check, even if no prompt was
     * auto-detected -- a fallback for prompts this app doesn't recognize. */
    onManualSubmit: (code: string) => Promise<void>;
}

export function VerifyAccountModal({ status, message, onCancel, onRetry, onManualSubmit }: VerifyAccountModalProps) {
    const [showManual, setShowManual] = useState(false);
    const [manualCode, setManualCode] = useState("");
    const [sending, setSending] = useState(false);

    const sendManualCode = async () => {
        if (!manualCode.trim() || sending) return;
        setSending(true);
        try {
            await onManualSubmit(manualCode.trim());
            setManualCode("");
            setShowManual(false);
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" />

            <div className="relative bg-surface border border-border rounded-xl shadow-2xl p-6 w-full max-w-md mx-4 text-center">
                {status === "verifying" ? (
                    <>
                        <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
                        <h3 className="font-semibold text-base mb-1">Checking account with Steam...</h3>
                        <p className="text-sm text-foreground-muted mb-4">
                            Logging in to confirm the username and password. This can take a
                            little while, especially if Steam needs to send a code -- if a code
                            box doesn't appear on its own, you can enter one below.
                        </p>

                        {showManual ? (
                            <div className="space-y-2 mb-4 text-left">
                                <input
                                    autoFocus
                                    value={manualCode}
                                    onChange={(e) => setManualCode(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && sendManualCode()}
                                    placeholder="Steam Guard code"
                                    className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm"
                                />
                                <button
                                    onClick={sendManualCode}
                                    disabled={!manualCode.trim() || sending}
                                    className="w-full px-3 py-2 text-sm rounded-md bg-primary hover:bg-primary-hover disabled:opacity-50 text-white"
                                >
                                    {sending ? "Sending..." : "Submit code"}
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setShowManual(true)}
                                className="text-xs text-primary hover:underline mb-3 block mx-auto"
                            >
                                Enter a code manually
                            </button>
                        )}

                        <button
                            onClick={onCancel}
                            className="text-xs text-foreground-muted hover:text-foreground"
                        >
                            Cancel
                        </button>
                    </>
                ) : (
                    <>
                        <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-3" />
                        <h3 className="font-semibold text-base mb-1">Couldn't verify this account</h3>
                        <p className="text-sm text-foreground-muted mb-4 break-words">{message}</p>
                        <div className="flex gap-2 justify-center">
                            <button
                                onClick={onCancel}
                                className="px-4 py-2 text-sm rounded-md border border-border hover:bg-surface-hover"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={onRetry}
                                className="px-4 py-2 text-sm rounded-md bg-primary hover:bg-primary-hover text-white"
                            >
                                Try again
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
