import React from "react";
import Icon from "./Icon.jsx";

export default function GuestImportDialog({ title, busy, error, onImport, onDecline }) {
    return (
        <div className="dialog-backdrop">
            <section aria-labelledby="import-dialog-title" aria-modal="true" className="dialog-panel" role="dialog">
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-300/10 text-emerald-300">
                    <Icon name="chat" />
                </div>
                <h2 className="text-xl font-semibold" id="import-dialog-title">
                    Save this guest conversation?
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                    Import <span className="text-slate-200">“{title}”</span> into your account? It will be saved with your other chats. If you decline, it stays temporary in this browser session.
                </p>
                {error && <p className="mt-4 text-sm text-rose-300" role="alert">{error}</p>}
                <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button className="dialog-secondary" disabled={busy} onClick={onDecline} type="button">
                        Don’t import
                    </button>
                    <button className="dialog-submit sm:w-auto" disabled={busy} onClick={onImport} type="button">
                        {busy ? "Importing..." : "Import conversation"}
                    </button>
                </div>
            </section>
        </div>
    );
}
