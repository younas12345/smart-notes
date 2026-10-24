import React, { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { apiRequest } from "../lib/api.js";

export default function AuthDialog({ onClose, onAuthenticated, initialResetToken = "", onResetComplete }) {
    const [mode, setMode] = useState(initialResetToken ? "reset" : "signin");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [resetToken] = useState(initialResetToken);
    const [googleClientId, setGoogleClientId] = useState("");
    const [googleError, setGoogleError] = useState("");
    const googleButtonRef = useRef(null);
    const authenticatedCallback = useRef(onAuthenticated);
    const submittingRef = useRef(false);

    useEffect(() => {
        authenticatedCallback.current = onAuthenticated;
    }, [onAuthenticated]);

    useEffect(() => {
        if (mode === "forgot" || mode === "reset") return undefined;
        let active = true;
        apiRequest("/google/config")
            .then((result) => {
                if (active) setGoogleClientId(result.clientId || "");
            })
            .catch((requestError) => {
                if (active) setGoogleError(requestError.message);
            });
        return () => {
            active = false;
        };
    }, [mode]);

    useEffect(() => {
        if (!googleClientId || (mode !== "signin" && mode !== "signup")) return undefined;
        let active = true;
        let script = document.querySelector('script[data-google-identity]');
        const initialize = () => {
            if (!active || !window.google?.accounts?.id || !googleButtonRef.current) return;
            window.google.accounts.id.initialize({
                client_id: googleClientId,
                callback: async (credentialResponse) => {
                    if (!credentialResponse.credential || submittingRef.current) return;
                    submittingRef.current = true;
                    setSubmitting(true);
                    setGoogleError("");
                    try {
                        const result = await apiRequest("/google/signin", {
                            method: "POST",
                            body: JSON.stringify({ credential: credentialResponse.credential })
                        });
                        if (!result.token) throw new Error("Google sign-in did not return a session token.");
                        authenticatedCallback.current({
                            token: result.token,
                            email: result.email
                        });
                    } catch (requestError) {
                        setGoogleError(requestError.message);
                    } finally {
                        submittingRef.current = false;
                        setSubmitting(false);
                    }
                }
            });
            googleButtonRef.current.replaceChildren();
            window.google.accounts.id.renderButton(googleButtonRef.current, {
                type: "standard",
                theme: "outline",
                size: "large",
                text: "continue_with",
                shape: "rectangular",
                width: Math.min(378, googleButtonRef.current.clientWidth || 378)
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
                if (active) setGoogleError("Google sign-in could not load. Check your connection and try again.");
            });
        }

        return () => {
            active = false;
            script?.removeEventListener("load", initialize);
        };
    }, [googleClientId, mode]);

    async function submit(event) {
        event.preventDefault();
        setSubmitting(true);
        setError("");
        setSuccess("");

        try {
            if (mode === "forgot") {
                const result = await apiRequest("/forgot-password", {
                    method: "POST",
                    body: JSON.stringify({ email })
                });
                setSuccess(result.message);
                return;
            }

            if (mode === "reset") {
                if (password !== confirmPassword) {
                    setError("Passwords do not match.");
                    return;
                }
                const result = await apiRequest("/reset-password", {
                    method: "POST",
                    body: JSON.stringify({ token: resetToken, password, confirmPassword })
                });
                setSuccess(result.message);
                setPassword("");
                setConfirmPassword("");
                setMode("signin");
                onResetComplete?.();
                return;
            }

            const isSignup = mode === "signup";
            const result = await apiRequest(isSignup ? "/signup" : "/signin", {
                method: "POST",
                body: JSON.stringify(isSignup ? { name, email, password } : { email, password })
            });

            if (!result.token) {
                throw new Error("Authentication succeeded, but the server did not return a session token.");
            }
            onAuthenticated({ token: result.token, email: result.email || email });
        } catch (requestError) {
            setError(requestError.message);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
        }}>
            <section aria-labelledby="auth-dialog-title" aria-modal="true" className="dialog-panel" role="dialog">
                <button aria-label="Close sign in dialog" className="dialog-close icon-button" onClick={onClose}>
                    <Icon name="close" />
                </button>
                <div className="mb-6">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
                        Smart Notes
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold" id="auth-dialog-title">
                        {mode === "signin" ? "Welcome back"
                            : mode === "signup" ? "Create your account"
                                : mode === "forgot" ? "Forgot password?"
                                    : "Reset your password"}
                    </h2>
                    <p className="mt-2 text-sm text-slate-400">
                        {mode === "signin" || mode === "signup"
                            ? "Sign in to save and access your conversations."
                            : mode === "forgot"
                                ? "Enter your email and, if a password-enabled account exists, we’ll send a reset link."
                                : "Choose a new password for your Smart Notes account."}
                    </p>
                </div>
                <form className="space-y-4" onSubmit={submit}>
                    {mode === "signup" && (
                        <label className="field-label">
                            Name
                            <input
                                autoComplete="name"
                                className="dialog-input"
                                onChange={(event) => setName(event.target.value)}
                                required
                                value={name}
                            />
                        </label>
                    )}
                    {mode !== "reset" && <label className="field-label">
                        Email
                        <input
                            autoComplete="email"
                            className="dialog-input"
                            onChange={(event) => setEmail(event.target.value)}
                            required
                            type="email"
                            value={email}
                        />
                    </label>}
                    {mode !== "forgot" && <label className="field-label">
                        Password
                        <input
                            autoComplete={mode === "signin" ? "current-password" : "new-password"}
                            className="dialog-input"
                            onChange={(event) => setPassword(event.target.value)}
                            required
                            type="password"
                            value={password}
                        />
                    </label>}
                    {mode === "reset" && <label className="field-label">
                        Confirm new password
                        <input
                            autoComplete="new-password"
                            className="dialog-input"
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            required
                            type="password"
                            value={confirmPassword}
                        />
                    </label>}
                    {error && <p className="text-sm leading-5 text-rose-300" role="alert">{error}</p>}
                    {success && <p className="text-sm leading-5 text-emerald-400" role="status">{success}</p>}
                    <button className="dialog-submit" disabled={submitting} type="submit">
                        {submitting ? "Please wait..."
                            : mode === "signin" ? "Sign in"
                                : mode === "signup" ? "Create account"
                                    : mode === "forgot" ? "Send reset link"
                                        : "Reset password"}
                    </button>
                </form>
                {mode === "signin" && (
                    <button
                        className="mt-4 block w-full text-right text-xs font-medium text-emerald-300 hover:text-emerald-200"
                        onClick={() => {
                            setMode("forgot");
                            setError("");
                            setSuccess("");
                        }}
                        type="button"
                    >
                        Forgot password?
                    </button>
                )}
                {(mode === "forgot" || mode === "reset") && (
                    <button
                        className="mt-4 block w-full text-center text-sm font-medium text-emerald-300 hover:text-emerald-200"
                        onClick={() => {
                            setMode("signin");
                            setError("");
                            setSuccess("");
                        }}
                        type="button"
                    >
                        Back to sign in
                    </button>
                )}
                {(mode === "signin" || mode === "signup") && <>
                <div className="my-5 flex items-center gap-3 text-xs text-slate-600">
                    <span className="h-px flex-1 bg-white/[0.08]" />
                    <span>OR</span>
                    <span className="h-px flex-1 bg-white/[0.08]" />
                </div>
                {googleClientId ? (
                    <div className="flex min-h-10 justify-center" ref={googleButtonRef} />
                ) : (
                    <p className="text-center text-xs text-slate-500">
                        Continue with Google is unavailable until the server is configured.
                    </p>
                )}
                {googleError && <p className="mt-3 text-center text-sm text-rose-300" role="alert">{googleError}</p>}
                <p className="mt-5 text-center text-sm text-slate-400">
                    {mode === "signin" ? "New to Smart Notes? " : "Already have an account? "}
                    <button
                        className="font-medium text-emerald-300 hover:text-emerald-200"
                        onClick={() => {
                            setMode((current) => current === "signin" ? "signup" : "signin");
                            setError("");
                            setSuccess("");
                        }}
                        type="button"
                    >
                        {mode === "signin" ? "Create an account" : "Sign in"}
                    </button>
                </p>
                </>}
            </section>
        </div>
    );
}
