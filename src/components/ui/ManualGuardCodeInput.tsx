import { useState } from "react";

interface ManualGuardCodeInputProps {
    onSubmit: (code: string) => Promise<void>;
}

/** Collapsed by default to "Having trouble? Enter a Steam Guard code" --
 * a fallback so a code can always be sent to the running download even if
 * this app doesn't recognize the exact prompt wording and never shows the
 * automatic Steam Guard modal. */
export function ManualGuardCodeInput({ onSubmit }: ManualGuardCodeInputProps) {
    const [open, setOpen] = useState(false);
    const [code, setCode] = useState("");
    const [sending, setSending] = useState(false);

    const send = async () => {
        if (!code.trim() || sending) return;
        setSending(true);
        try {
            await onSubmit(code.trim());
            setCode("");
            setOpen(false);
        } finally {
            setSending(false);
        }
    };

    if (!open) {
        return (
            <button
                onClick={() => setOpen(true)}
                className="text-xs text-foreground-muted hover:text-foreground text-center w-full mt-1"
            >
                Having trouble? Enter a Steam Guard code
            </button>
        );
    }

    return (
        <div className="flex gap-2 mt-1">
            <input
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Steam Guard code"
                className="flex-1 px-3 py-1.5 bg-background border border-border rounded-md text-xs"
            />
            <button
                onClick={send}
                disabled={!code.trim() || sending}
                className="px-3 py-1.5 text-xs rounded-md bg-primary hover:bg-primary-hover disabled:opacity-50 text-white"
            >
                Send
            </button>
        </div>
    );
}
