import { useState } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
import type { GuardPrompt } from "@/lib/tauri";

interface SteamGuardModalProps {
    prompt: GuardPrompt;
    onSubmit: (code: string) => Promise<void>;
}

const KIND_COPY: Record<GuardPrompt["kind"], { title: string; hint: string }> = {
    email: {
        title: "Steam emailed you a code",
        hint: "Check the inbox for this Steam account and enter the code below.",
    },
    device: {
        title: "Enter your Authenticator code",
        hint: "Open the Steam Mobile Authenticator (or another TOTP app linked to this account) and enter the current code.",
    },
    unknown: {
        title: "Steam Guard input needed",
        hint: "The downloader is waiting on something -- read the line below and enter what it's asking for.",
    },
};

// No cancel button on purpose: the underlying process is genuinely paused
// waiting on this input. Closing the modal without sending anything would
// just hide a download that's still stuck, which is worse than leaving the
// prompt visible until the user has the code in hand.
export function SteamGuardModal({ prompt, onSubmit }: SteamGuardModalProps) {
    const [code, setCode] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const copy = KIND_COPY[prompt.kind] ?? KIND_COPY.unknown;

    const handleSubmit = async () => {
        if (!code.trim() || sending) return;
        setSending(true);
        setError(null);
        try {
            await onSubmit(code.trim());
            setCode("");
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" />

            <div className="relative bg-surface border border-border rounded-xl shadow-2xl p-6 w-full max-w-md mx-4">
                <div className="flex items-start gap-4 mb-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <ShieldCheck className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-base">{copy.title}</h3>
                        <p className="text-sm text-foreground-muted mt-1">{copy.hint}</p>
                    </div>
                </div>

                <div className="bg-background border border-border rounded-lg p-3 mb-4 text-xs text-foreground-muted font-mono break-all">
                    {prompt.line}
                </div>

                <input
                    autoFocus
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                    placeholder="Enter code"
                    className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm mb-2"
                />

                {error && <p className="text-xs text-destructive mb-2">{error}</p>}

                <button
                    onClick={handleSubmit}
                    disabled={!code.trim() || sending}
                    className="w-full flex items-center justify-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
                >
                    {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    {sending ? "Sending..." : "Submit"}
                </button>
            </div>
        </div>
    );
}
