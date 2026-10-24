import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import AuthDialog from "./components/AuthDialog.jsx";
import ChatComposer from "./components/ChatComposer.jsx";
import ChatMessage from "./components/ChatMessage.jsx";
import ChatSidebar from "./components/ChatSidebar.jsx";
import ErrorBanner from "./components/ErrorBanner.jsx";
import GoogleLinkDialog from "./components/GoogleLinkDialog.jsx";
import GuestImportDialog from "./components/GuestImportDialog.jsx";
import Icon from "./components/Icon.jsx";
import NotesPage from "./pages/NotesPage.jsx";
import { apiRequest, toConversation } from "./lib/api.js";
import { downloadStudyPdf } from "./lib/exportPdf.js";
import { normalizeMarkdown } from "./lib/markdown.js";

const MAX_MESSAGES = 40;
const DEFAULT_UPLOAD_LIMITS = { pdf: 10 * 1024 * 1024, image: 5 * 1024 * 1024 };

function createConversation(isGuest = true) {
    return {
        id: crypto.randomUUID(),
        title: "New chat",
        isGuest,
        messages: []
    };
}

function toApiMessages(messages) {
    return messages.map(({ role, content, attachment }) => ({
        role,
        text: content,
        ...(attachment ? { attachment } : {})
    }));
}

async function encodeAttachment({ file, mimeType }) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return { filename: file.name, mimeType, data: btoa(binary) };
}

export default function App() {
    const [conversations, setConversations] = useState(() => [createConversation()]);
    const [activeId, setActiveId] = useState(() => conversations[0].id);
    const [auth, setAuth] = useState(null);
    const [theme, setTheme] = useState(() => {
        let selectedTheme = "dark";
        try {
            selectedTheme = localStorage.getItem("shortnotes-theme") === "light" ? "light" : "dark";
        } catch {
            selectedTheme = "dark";
        }
        return selectedTheme;
    });
    const [activeSection, setActiveSection] = useState("chat");
    const [resetToken, setResetToken] = useState(() => (
        new URLSearchParams(window.location.hash.slice(1)).get("resetToken") || ""
    ));
    const [showAuthDialog, setShowAuthDialog] = useState(() => Boolean(
        new URLSearchParams(window.location.hash.slice(1)).get("resetToken")
    ));
    const [showGoogleLinkDialog, setShowGoogleLinkDialog] = useState(false);
    const [googleLinked, setGoogleLinked] = useState(false);
    const [pendingImportId, setPendingImportId] = useState("");
    const [importing, setImporting] = useState(false);
    const [importError, setImportError] = useState("");
    const [sidebarOpen, setSidebarOpen] = useState(() => (
        typeof window !== "undefined" && window.innerWidth >= 768
    ));
    const [loadingId, setLoadingId] = useState("");
    const [error, setError] = useState("");
    const [copiedId, setCopiedId] = useState("");
    const [maxUploadBytes, setMaxUploadBytes] = useState(DEFAULT_UPLOAD_LIMITS);
    const chatScrollRef = useRef(null);

    const activeConversation =
        conversations.find((conversation) => conversation.id === activeId) ?? conversations[0];
    const pendingImport = conversations.find((conversation) => conversation.id === pendingImportId);

    useEffect(() => {
        const container = chatScrollRef.current;
        if (container) {
            container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
        }
    }, [activeConversation?.messages, loadingId]);

    useEffect(() => {
        let active = true;
        apiRequest("/api/chats/config")
            .then((result) => {
                if (active && result.maxUploadBytes) setMaxUploadBytes(result.maxUploadBytes);
            })
            .catch((requestError) => {
                if (active) setError(requestError.message);
            });
        return () => {
            active = false;
        };
    }, []);

    useLayoutEffect(() => {
        document.documentElement.dataset.theme = theme;
        try {
            localStorage.setItem("shortnotes-theme", theme);
        } catch {
            setError("Theme preference could not be saved in this browser.");
        }
    }, [theme]);

    useEffect(() => {
        let wasMobile = window.innerWidth < 768;
        function syncSidebarToViewport() {
            const isMobile = window.innerWidth < 768;
            if (isMobile !== wasMobile) {
                wasMobile = isMobile;
                setSidebarOpen(!isMobile);
            }
        }
        window.addEventListener("resize", syncSidebarToViewport);
        return () => window.removeEventListener("resize", syncSidebarToViewport);
    }, []);

    useEffect(() => {
        let active = true;
        if (!auth) {
            setGoogleLinked(false);
            return () => {
                active = false;
            };
        }
        apiRequest("/google/status", { token: auth.token })
            .then((result) => {
                if (active) setGoogleLinked(Boolean(result.linked));
            })
            .catch((requestError) => {
                if (active) setError(requestError.message);
            });
        return () => {
            active = false;
        };
    }, [auth]);

    function startNewChat() {
        const conversation = createConversation(!auth);
        setConversations((current) => [conversation, ...current]);
        setActiveId(conversation.id);
        setActiveSection("chat");
        setError("");
        setLoadingId("");
        if (window.innerWidth < 768) setSidebarOpen(false);
    }

    function selectChat(id) {
        selectConversation(id);
        if (window.innerWidth < 768) setSidebarOpen(false);
    }

    function clearPasswordResetToken() {
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
        setResetToken("");
    }

    function updateConversation(conversationId, updater) {
        setConversations((current) =>
            current.map((conversation) =>
                conversation.id === conversationId ? updater(conversation) : conversation
            )
        );
    }

    async function sendMessage(content, selectedAttachment) {
        const conversation = activeConversation;
        if (!conversation || loadingId === conversation.id || conversation.messages.length >= MAX_MESSAGES) {
            if (conversation?.messages.length >= MAX_MESSAGES) {
                setError("This conversation has reached its temporary message limit. Start a new chat to continue.");
            }
            return false;
        }

        const conversationId = conversation.id;
        const attachmentLabel = selectedAttachment
            ? { filename: selectedAttachment.file.name, mimeType: selectedAttachment.mimeType }
            : undefined;
        const userMessage = {
            id: crypto.randomUUID(),
            role: "user",
            content,
            ...(attachmentLabel ? { attachment: attachmentLabel } : {})
        };
        const existingMessages = conversation.messages;
        const firstMessage = existingMessages.length === 0;

        setError("");
        updateConversation(conversationId, (current) => ({
            ...current,
            title: firstMessage ? content.trim().slice(0, 36) : current.title,
            messages: [...current.messages, userMessage]
        }));
        setLoadingId(conversationId);

        try {
            const attachment = selectedAttachment
                ? await encodeAttachment(selectedAttachment)
                : undefined;
            const documentId = !attachment && conversation.documentId
                ? conversation.documentId
                : undefined;
            if (conversation.isGuest) {
                const result = await apiRequest("/api/chats/guest", {
                    method: "POST",
                    body: JSON.stringify({
                        messages: toApiMessages(existingMessages),
                        message: content,
                        ...(attachment ? { attachment } : {}),
                        ...(documentId ? { documentId } : {})
                    })
                });
                updateConversation(conversationId, (current) => ({
                    ...current,
                    documentId: result.documentId || current.documentId,
                    messages: [
                        ...current.messages,
                        {
                            id: crypto.randomUUID(),
                            role: "assistant",
                            content: result.message.text
                        }
                    ]
                }));
            } else {
                const result = conversation.chatId
                    ? await apiRequest(`/api/chats/${conversation.chatId}/messages`, {
                        method: "POST",
                        token: auth.token,
                        body: JSON.stringify({
                            message: content,
                            ...(attachment ? { attachment } : {}),
                            ...(documentId ? { documentId } : {})
                        })
                    })
                    : await apiRequest("/api/chats", {
                        method: "POST",
                        token: auth.token,
                        body: JSON.stringify({
                            message: content,
                            ...(attachment ? { attachment } : {})
                        })
                    });
                updateConversation(conversationId, () => ({
                    ...toConversation(result),
                    documentId: result.documentId || conversation.documentId || ""
                }));
            }
            return true;
        } catch (requestError) {
            updateConversation(conversationId, (current) => ({
                ...current,
                title: conversation.title,
                messages: existingMessages
            }));
            setError(requestError.message);
            return false;
        } finally {
            setLoadingId((current) => current === conversationId ? "" : current);
        }
    }

    async function regenerateResponse(messageIndex) {
        const conversation = activeConversation;
        const target = conversation.messages[messageIndex];
        if (!target || target.role !== "assistant" || messageIndex === 0 || loadingId === conversation.id) return;

        setError("");
        setLoadingId(conversation.id);
        try {
            if (conversation.isGuest) {
                const previousUser = conversation.messages[messageIndex - 1];
                if (previousUser.role !== "user") {
                    throw new Error("This response cannot be regenerated.");
                }
                const result = await apiRequest("/api/chats/guest", {
                    method: "POST",
                    body: JSON.stringify({
                        messages: toApiMessages(conversation.messages.slice(0, messageIndex - 1)),
                        message: previousUser.content,
                        ...(conversation.documentId ? { documentId: conversation.documentId } : {})
                    })
                });
                updateConversation(conversation.id, (current) => ({
                    ...current,
                    messages: current.messages.map((message, index) =>
                        index === messageIndex
                            ? { ...message, content: result.message.text }
                            : message
                    )
                }));
            } else {
                const result = await apiRequest(
                    `/api/chats/${conversation.chatId}/regenerate`,
                    {
                        method: "POST",
                        token: auth.token,
                        body: JSON.stringify({
                            messageId: target.id,
                            ...(conversation.documentId ? { documentId: conversation.documentId } : {})
                        })
                    }
                );
                updateConversation(conversation.id, (current) => ({
                    ...current,
                    messages: current.messages.map((message) =>
                        message.id === target.id ? { ...message, content: result.message.text } : message
                    )
                }));
            }
        } catch (requestError) {
            setError(requestError.message);
        } finally {
            setLoadingId((current) => current === conversation.id ? "" : current);
        }
    }

    async function copyResponse(message) {
        try {
            await navigator.clipboard.writeText(normalizeMarkdown(message.content));
            setCopiedId(message.id);
            window.setTimeout(() => setCopiedId(""), 1600);
            setError("");
        } catch {
            setError("Could not copy the response. Check clipboard permissions and try again.");
        }
    }

    async function downloadResponse(message) {
        try {
            const title = message.content.split("\n")
                .find((line) => line.trim())?.replace(/^#+\s*/, "").slice(0, 100) || "Study notes";
            await downloadStudyPdf({
                title,
                content: message.content,
                filename: "study-notes"
            });
        } catch (exportError) {
            setError(exportError.message || "Could not create the PDF. Please try again.");
        }
    }

    async function saveResponse(message) {
        if (!auth) {
            setError("Sign in to save this response as a study note.");
            setShowAuthDialog(true);
            return;
        }
        const topic = message.content.split("\n")
            .map((line) => line.trim().replace(/^#+\s*/, ""))
            .find(Boolean)?.slice(0, 200) || "Study note";
        try {
            await apiRequest("/notes", {
                method: "POST",
                token: auth.token,
                body: JSON.stringify({ topic, notes: normalizeMarkdown(message.content) })
            });
            setError("");
        } catch (requestError) {
            setError(requestError.message);
        }
    }

    async function handleAuthenticated(session) {
        setAuth(session);
        setShowAuthDialog(false);
        setError("");
        try {
            const savedChats = await apiRequest("/api/chats", { token: session.token });
            const savedConversations = savedChats.map(toConversation);
            setConversations((current) => [
                ...savedConversations,
                ...current.map((conversation) =>
                    conversation.isGuest && conversation.messages.length === 0
                        ? { ...conversation, isGuest: false }
                        : conversation
                )
            ]);

            const currentConversation = conversations.find(
                (conversation) => conversation.id === activeId
            );
            if (currentConversation?.isGuest && currentConversation.messages.length > 0) {
                setPendingImportId(currentConversation.id);
                setImportError("");
            } else if (savedConversations.length > 0) {
                setActiveId(savedConversations[0].id);
            } else {
                const draft = createConversation(false);
                setConversations((current) => [draft, ...current]);
                setActiveId(draft.id);
            }
        } catch (requestError) {
            setError(requestError.message);
        }
    }

    async function importGuestConversation() {
        if (!auth || !pendingImport || importing) return;
        setImporting(true);
        setImportError("");
        try {
            const saved = await apiRequest("/api/chats/import", {
                method: "POST",
                token: auth.token,
                body: JSON.stringify({
                    title: pendingImport.title,
                    messages: toApiMessages(pendingImport.messages)
                })
            });
            const importedConversation = toConversation(saved);
            setConversations((current) => current.map((conversation) =>
                conversation.id === pendingImport.id ? importedConversation : conversation
            ));
            setActiveId(importedConversation.id);
            setPendingImportId("");
        } catch (requestError) {
            setImportError(requestError.message);
        } finally {
            setImporting(false);
        }
    }

    function declineGuestImport() {
        setPendingImportId("");
        setImportError("");
    }

    function signOut() {
        const guestConversations = conversations.filter((conversation) => conversation.isGuest);
        const nextConversations = guestConversations.length > 0
            ? guestConversations
            : [createConversation()];
        setAuth(null);
        setShowGoogleLinkDialog(false);
        setConversations(nextConversations);
        setActiveId(nextConversations[0].id);
        setError("");
        if (window.innerWidth < 768) setSidebarOpen(false);
    }

    function selectConversation(id) {
        const conversation = conversations.find((item) => item.id === id);
        if (auth && conversation?.isGuest && conversation.messages.length > 0) {
            setPendingImportId(conversation.id);
            setImportError("");
        }
        setActiveId(id);
        setActiveSection("chat");
        setError("");
    }

    return (
        <div
            className="app-root flex h-dvh min-h-[320px] overflow-hidden bg-[#0b0e14] text-slate-100"
            data-theme={theme}
        >
            {sidebarOpen && window.innerWidth < 768 && (
                <button
                    aria-label="Close navigation"
                    className="fixed inset-x-0 bottom-0 top-16 z-30 bg-black/45 backdrop-blur-[1px] md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}
            <ChatSidebar
                conversations={conversations}
                activeId={activeConversation.id}
                open={sidebarOpen}
                userEmail={auth?.email}
                onNewChat={startNewChat}
                onSelect={selectChat}
            />

            <main className="flex min-w-0 flex-1 flex-col">
                <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/[0.06] px-4 sm:px-6">
                    <div className="flex items-center gap-3">
                        <button
                            aria-label={sidebarOpen ? "Close chats" : "Open chats"}
                            aria-expanded={sidebarOpen}
                            className="icon-button"
                            onClick={() => setSidebarOpen((open) => !open)}
                        >
                            <Icon name={sidebarOpen ? "close" : "menu"} />
                        </button>
                        <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300">
                                <Icon name="spark" />
                            </span>
                            <div>
                                <p className="text-sm font-semibold tracking-wide">Smart Notes</p>
                                <p className="text-[11px] text-slate-500">
                                    {activeConversation.isGuest ? "Guest chat · temporary" : "Saved to your account"}
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="flex min-w-0 items-center gap-1 sm:gap-2">
                        {auth ? (
                            <div className="flex items-center gap-1 sm:gap-2">
                                {!googleLinked && (
                                    <button
                                        className="account-button hidden sm:inline-flex"
                                        disabled={Boolean(loadingId)}
                                        onClick={() => setShowGoogleLinkDialog(true)}
                                        type="button"
                                    >
                                        <span>Link Google Account</span>
                                    </button>
                                )}
                                {googleLinked && (
                                    <span className="hidden text-xs text-emerald-300 sm:inline">Google linked</span>
                                )}
                                <button className="account-button" disabled={Boolean(loadingId)} onClick={signOut} type="button">
                                    <span className="hidden max-w-36 truncate md:inline">{auth.email}</span>
                                    <span className="hidden sm:inline">Sign out</span>
                                    <Icon name="user" />
                                </button>
                            </div>
                        ) : (
                            <button className="account-button" disabled={Boolean(loadingId)} onClick={() => setShowAuthDialog(true)} type="button">
                                <span className="hidden sm:inline">Sign in</span>
                                <Icon name="user" />
                            </button>
                        )}
                        <button
                            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                            className="account-button"
                            onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
                            type="button"
                        >
                            <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
                            <span className="hidden sm:inline">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
                        </button>
                        <button
                            aria-label={activeSection === "chat" ? "Open notes" : "Return to chat"}
                            className="account-button"
                            onClick={() => setActiveSection((current) => current === "chat" ? "notes" : "chat")}
                            type="button"
                        >
                            <Icon className="sm:hidden" name={activeSection === "chat" ? "note" : "chat"} size={16} />
                            <span className="hidden sm:inline">{activeSection === "chat" ? "Notes" : "Chat"}</span>
                        </button>
                    </div>
                </header>

                {activeSection === "notes" ? (
                    <NotesPage auth={auth} onRequireAuth={() => setShowAuthDialog(true)} />
                ) : (
                <section className="flex min-h-0 flex-1 flex-col">
                    <div className="chat-scroll flex-1 overflow-y-auto px-4 sm:px-8" ref={chatScrollRef}>
                        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col">
                            {activeConversation.messages.length === 0 ? (
                                <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
                                    <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-[22px] border border-emerald-300/15 bg-emerald-300/[0.07] text-emerald-300 shadow-[0_0_60px_rgba(52,211,153,0.08)]">
                                        <Icon name="spark" size={27} />
                                    </div>
                                    <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                                        What can I help with?
                                    </h1>
                                    <p className="mt-3 max-w-md text-sm leading-6 text-slate-400">
                                        Ask a question, explore an idea, or turn a topic into clear notes.
                                    </p>
                                    <div className="mt-9 grid w-full max-w-xl gap-3 sm:grid-cols-2">
                                        {[
                                            ["Explain a complex idea", "Make a difficult topic easy to understand"],
                                            ["Help me get started", "Create a simple outline for a new project"],
                                            ["Study something new", "Break a subject into memorable points"],
                                            ["Improve my writing", "Make a paragraph clearer and more concise"]
                                        ].map(([title, description]) => (
                                            <button
                                                className="suggestion-card"
                                                key={title}
                                                onClick={() => sendMessage(title)}
                                            >
                                                <span className="text-sm font-medium text-slate-200">{title}</span>
                                                <span className="mt-1 text-xs leading-5 text-slate-500">
                                                    {description}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-8 py-8 sm:gap-10 sm:py-10">
                                    {activeConversation.messages.map((message, index) => (
                                        <ChatMessage
                                            copied={copiedId === message.id}
                                            key={message.id}
                                            message={message}
                                            onCopy={() => copyResponse(message)}
                                            onRegenerate={() => regenerateResponse(index)}
                                            onSave={() => saveResponse(message)}
                                            onDownload={() => downloadResponse(message)}
                                        />
                                    ))}
                                    {loadingId === activeConversation.id && (
                                        <div className="flex items-start gap-3.5" role="status" aria-live="polite">
                                            <span className="assistant-avatar">
                                                <Icon name="spark" size={17} />
                                            </span>
                                            <div className="mt-2 flex items-center gap-1.5 text-sm text-slate-400">
                                                <span>Thinking</span>
                                                <span className="loading-dot" />
                                                <span className="loading-dot delay-150" />
                                                <span className="loading-dot delay-300" />
                                            </div>
                                        </div>
                                    )}
                                    <div />
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="shrink-0 px-4 pb-4 pt-3 sm:px-8 sm:pb-6">
                        <div className="mx-auto w-full max-w-3xl">
                            {error && <ErrorBanner message={error} onDismiss={() => setError("")} />}
                            <ChatComposer
                                disabled={loadingId === activeConversation.id}
                                maxUploadBytes={maxUploadBytes}
                                onSend={sendMessage}
                            />
                            <p className="mt-3 text-center text-[11px] text-slate-600">
                                {activeConversation.isGuest
                                    ? "Guest conversations stay temporary unless you choose to import them."
                                    : "Your messages are saved to your account."}
                            </p>
                        </div>
                    </div>
                </section>
                )}
            </main>

            {showAuthDialog && (
                <AuthDialog
                    initialResetToken={resetToken}
                    onAuthenticated={handleAuthenticated}
                    onClose={() => {
                        clearPasswordResetToken();
                        setShowAuthDialog(false);
                    }}
                    onResetComplete={clearPasswordResetToken}
                />
            )}
            {showGoogleLinkDialog && auth && (
                <GoogleLinkDialog
                    onClose={() => setShowGoogleLinkDialog(false)}
                    onLinked={() => {
                        setGoogleLinked(true);
                        setShowGoogleLinkDialog(false);
                        setError("");
                    }}
                    token={auth.token}
                />
            )}
            {pendingImport && (
                <GuestImportDialog
                    busy={importing}
                    error={importError}
                    onDecline={declineGuestImport}
                    onImport={importGuestConversation}
                    title={pendingImport.title}
                />
            )}
        </div>
    );
}
