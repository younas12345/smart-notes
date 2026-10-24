import React, { useEffect, useMemo, useState } from "react";
import ErrorBanner from "../components/ErrorBanner.jsx";
import { apiRequest } from "../lib/api.js";
import { downloadStudyPdf } from "../lib/exportPdf.js";
import MarkdownContent from "../components/MarkdownContent.jsx";
import { normalizeMarkdown } from "../lib/markdown.js";

export default function NotesPage({ auth, onRequireAuth }) {
    const [topic, setTopic] = useState("");
    const [search, setSearch] = useState("");
    const [notes, setNotes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        let active = true;
        if (!auth) {
            setNotes([]);
            return () => {
                active = false;
            };
        }

        setLoading(true);
        apiRequest("/history", { token: auth.token })
            .then((result) => {
                if (active) setNotes(result);
            })
            .catch((requestError) => {
                if (active) setError(requestError.message);
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, [auth]);

    const visibleNotes = useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        if (!query) return notes;
        return notes.filter((note) =>
            `${note.topic} ${note.notes}`.toLocaleLowerCase().includes(query)
        );
    }, [notes, search]);

    async function generateNote(event) {
        event.preventDefault();
        const cleanTopic = topic.trim();
        if (!cleanTopic) return;
        if (!auth) {
            onRequireAuth();
            return;
        }

        setGenerating(true);
        setError("");
        try {
            const result = await apiRequest("/notes", {
                method: "POST",
                token: auth.token,
                body: JSON.stringify({ topic: cleanTopic })
            });
            setNotes((current) => [result.note, ...current]);
            setTopic("");
        } catch (requestError) {
            setError(requestError.message);
        } finally {
            setGenerating(false);
        }
    }

    async function deleteNote(noteId) {
        if (!window.confirm("Delete this note?")) return;
        setError("");
        try {
            await apiRequest(`/notes/${noteId}`, { method: "DELETE", token: auth.token });
            setNotes((current) => current.filter((note) => note._id !== noteId));
        } catch (requestError) {
            setError(requestError.message);
        }
    }

    async function copyNote(noteText) {
        try {
            await navigator.clipboard.writeText(normalizeMarkdown(noteText));
        } catch {
            setError("Could not copy the note. Check clipboard permissions and try again.");
        }
    }

    async function downloadPdf(note) {
        try {
            await downloadStudyPdf({
                title: note.topic || "Study note",
                content: note.notes,
                filename: note.topic || "study-note"
            });
            setError("");
        } catch (exportError) {
            setError(exportError.message || "PDF export failed. Please try again.");
        }
    }

    return (
        <div className="chat-scroll flex-1 overflow-y-auto px-4 py-8 sm:px-8">
            <div className="mx-auto w-full max-w-3xl">
                <div className="mb-7">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Study workspace</p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight">AI Notes</h1>
                    <p className="mt-2 text-sm text-slate-400">
                        Generate clear notes and keep them with your account.
                    </p>
                </div>

                {error && <ErrorBanner message={error} onDismiss={() => setError("")} />}

                <form className="notes-panel" onSubmit={generateNote}>
                    <label className="mb-2 block text-sm font-medium text-slate-300" htmlFor="notes-topic">
                        What would you like notes about?
                    </label>
                    <div className="flex flex-col gap-3 sm:flex-row">
                        <input
                            className="dialog-input mt-0 flex-1"
                            id="notes-topic"
                            maxLength={300}
                            onChange={(event) => setTopic(event.target.value)}
                            placeholder="Enter a topic..."
                            value={topic}
                        />
                        <button className="dialog-submit sm:w-auto" disabled={generating || !topic.trim()}>
                            {generating ? "Generating..." : "Generate notes"}
                        </button>
                    </div>
                    {!auth && (
                        <p className="mt-3 text-xs text-slate-500">
                            Sign in to generate and save notes to your account.
                        </p>
                    )}
                </form>

                <div className="mb-4 mt-9 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-lg font-semibold">Notes history</h2>
                    <input
                        aria-label="Search notes"
                        className="dialog-input mt-0 sm:max-w-xs"
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search your notes..."
                        value={search}
                    />
                </div>

                {!auth ? (
                    <div className="notes-empty">Sign in to view your saved notes.</div>
                ) : loading ? (
                    <div className="notes-empty">Loading your notes...</div>
                ) : visibleNotes.length === 0 ? (
                    <div className="notes-empty">
                        {search ? "No notes match your search." : "No notes yet. Generate your first set above."}
                    </div>
                ) : (
                    <div className="space-y-4">
                        {visibleNotes.map((note) => (
                            <article className="notes-panel" key={note._id}>
                                <h3 className="text-base font-semibold text-emerald-200">
                                    {note.topic || "Untitled note"}
                                </h3>
                                <div className="mt-3 text-sm leading-7 text-slate-300">
                                    <MarkdownContent>{note.notes}</MarkdownContent>
                                </div>
                                <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.06] pt-3">
                                    <button className="message-action" onClick={() => copyNote(note.notes)} type="button">
                                        Copy
                                    </button>
                                    <button className="message-action" onClick={() => downloadPdf(note)} type="button">
                                        Download PDF
                                    </button>
                                    <button
                                        className="message-action text-rose-300 hover:text-rose-200"
                                        onClick={() => deleteNote(note._id)}
                                        type="button"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
