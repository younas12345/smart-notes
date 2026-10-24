import React, { useEffect, useRef, useState } from "react";
import { apiRequest } from "../lib/api.js";

export default function GoogleLinkDialog({ token, onClose, onLinked }) {
    const [clientId, setClientId] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const buttonRef = useRef(null);
    const tokenRef = useRef(token);
    const busyRef = useRef(false);
    const linkedCallbackRef = useRef(onLinked);

    useEffect(() => {
        tokenRef.current = token;
    }, [token]);

    useEffect(() => {
        linkedCallbackRef.current = onLinked;
    }, [onLinked]);

    useEffect(() => {
        let active = true;
        apiRequest("/google/config")
            .then((result) => {
                if (active) setClientId(result.clientId || "");
            })
            .catch((requestError) => {
                if (active) setError(requestError.message);
            });
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        if (!clientId) return undefined;
        let active = true;
        let script = document.querySelector('script[data-google-identity]');
        const initialize = () => {
            if (!active || !window.google?.accounts?.id || !buttonRef.current) return;
            window.google.accounts.id.initialize({
                client_id: clientId,
                callback: async ({ credential }) => {
                    if (!credential || busyRef.current) return;
                    busyRef.current = true;
                    setBusy(true);
                    setError("");
                    try {
                        await apiRequest("/google/link", {
                            method: "POST",
                            token: tokenRef.current,
                            body: JSON.stringify({ credential })
                        });
                        linkedCallbackRef.current();
                    } catch (requestError) {
                        setError(requestError.message);
                    } finally {
                        busyRef.current = false;
                        setBusy(false);
                    }
                }
            });
            buttonRef.current.replaceChildren();
            window.google.accounts.id.renderButton(buttonRef.current, {
                type: "standard",
                theme: "outline",
                size: "large",
                text: "continue_with",
                shape: "rectangular",
                width: Math.min(378, buttonRef.current.clientWidth || 378)
            });
        };

        if (window.google?.accounts?.id) {
            initialize();
        } else {
            if (!script) {
                script = document.createElement("script");
                script.src = "https://accounts.google.com/gsi/client";
                script.async = true;
                script.defer = true;
                script.dataset.googleIdentity = "true";
                document.head.append(script);
            }
            script.addEventListener("load", initialize);
            script.addEventListener("error", () => {
                if (active) setError("Google sign-in could not load. Check your connection and try again.");
            });
        }

        return () => {
            active = false;
            script?.removeEventListener("load", initialize);
        };
    }, [clientId]);

    return (
        <div
            className="dialog-backdrop"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget && !busy) onClose();
            }}
            role="presentation"
        >
            <section aria-labelledby="google-link-title" aria-modal="true" className="dialog-panel" role="dialog">
                <h2 className="text-xl font-semibold" id="google-link-title">Link Google Account</h2>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                    Choose the Google account whose verified email matches your signed-in account. Linking will not merge or replace any account data.
                </p>
                {error && <p className="mt-4 text-sm text-rose-300" role="alert">{error}</p>}
                {clientId ? (
                    <div className="mt-6 flex min-h-10 justify-center" ref={buttonRef} />
                ) : (
                    <p className="mt-6 text-center text-xs text-slate-500">
                        Google linking is unavailable until the server is configured.
                    </p>
                )}
                <button
                    className="dialog-secondary mt-4"
                    disabled={busy}
                    onClick={onClose}
                    type="button"
                >
                    Cancel
                </button>
            </section>
        </div>
    );
}
