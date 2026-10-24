import React, { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";

const DEFAULT_LIMITS = { pdf: 10 * 1024 * 1024, image: 5 * 1024 * 1024 };

async function detectedMimeType(file) {
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-") return "application/pdf";
    if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) {
        return "image/png";
    }
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
    if (
        new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF" &&
        new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP"
    ) {
        return "image/webp";
    }
    return "";
}

export default function ChatComposer({ disabled, onSend, maxUploadBytes = DEFAULT_LIMITS }) {
    const [value, setValue] = useState("");
    const [file, setFile] = useState(null);
    const [fileError, setFileError] = useState("");
    const [dragging, setDragging] = useState(false);
    const textareaRef = useRef(null);
    const fileInputRef = useRef(null);
    const previewUrl = useRef("");

    useEffect(() => () => {
        if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    }, []);

    async function chooseFile(candidate) {
        if (!candidate) return;
        setFileError("");
        if (candidate.size === 0) {
            setFileError("The selected file is empty.");
            return;
        }
        const declaredType = candidate.type.toLowerCase();
        if (declaredType && ![
            "application/pdf", "image/jpeg", "image/png", "image/webp"
        ].includes(declaredType)) {
            setFileError("Choose a PDF, JPEG, PNG, or WebP file.");
            return;
        }
        try {
            const mimeType = await detectedMimeType(candidate);
            if (!mimeType || (declaredType && declaredType !== mimeType)) {
                setFileError("The file content does not match a supported PDF or image format.");
                return;
            }
            const isPdf = mimeType === "application/pdf";
            const maxBytes = isPdf ? maxUploadBytes.pdf : maxUploadBytes.image;
            if (candidate.size > maxBytes) {
                setFileError(`File is too large. The maximum ${isPdf ? "PDF" : "image"} size is ${Math.floor(maxBytes / (1024 * 1024))} MB.`);
                return;
            }
            if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
            previewUrl.current = mimeType.startsWith("image/") ? URL.createObjectURL(candidate) : "";
            setFile({ file: candidate, mimeType, previewUrl: previewUrl.current });
        } catch {
            setFileError("The selected file could not be read. Please try another file.");
        }
    }

    function submit(event) {
        event.preventDefault();
        const content = value.trim();
        if ((!content && !file) || disabled) return;
        const message = content || "Create structured study notes from this file.";
        Promise.resolve(onSend(message, file && { file: file.file, mimeType: file.mimeType })).then((sent) => {
            if (sent) {
                setValue("");
                if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
                previewUrl.current = "";
                setFile(null);
                setFileError("");
                if (fileInputRef.current) fileInputRef.current.value = "";
                if (textareaRef.current) textareaRef.current.style.height = "auto";
            }
        });
    }

    function handleKeyDown(event) {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
        }
    }

    function resizeTextarea(event) {
        event.currentTarget.style.height = "auto";
        event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 180)}px`;
        setValue(event.currentTarget.value);
    }

    return (
        <form
            className={`composer-shell ${dragging ? "composer-shell-dragging" : ""}`}
            onDragOver={(event) => {
                event.preventDefault();
                if (!disabled) setDragging(true);
            }}
            onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
            }}
            onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                if (!disabled) chooseFile(event.dataTransfer.files?.[0]);
            }}
            onSubmit={submit}
        >
            {file && (
                <div className="attachment-chip">
                    {file.previewUrl ? (
                        <img alt="Selected image preview" className="attachment-preview" src={file.previewUrl} />
                    ) : (
                        <span className="attachment-file-icon" aria-hidden="true">PDF</span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-300">{file.file.name}</span>
                    <button
                        aria-label="Remove attachment"
                        className="icon-button !h-7 !w-7"
                        disabled={disabled}
                        onClick={() => {
                            if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
                            previewUrl.current = "";
                            setFile(null);
                            if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                        type="button"
                    >
                        <Icon name="close" size={14} />
                    </button>
                </div>
            )}
            <textarea
                aria-label="Message"
                className="composer-input"
                disabled={disabled}
                maxLength={8000}
                onChange={resizeTextarea}
                onKeyDown={handleKeyDown}
                placeholder="Message Smart Notes..."
                ref={textareaRef}
                rows={1}
                value={value}
            />
            {fileError && <p className="mb-2 text-xs text-rose-300" role="alert">{fileError}</p>}
            <div className="flex items-center justify-between pt-2">
                <div className="flex min-w-0 items-center gap-2">
                    <input
                        accept="application/pdf,image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={(event) => chooseFile(event.target.files?.[0])}
                        ref={fileInputRef}
                        type="file"
                    />
                    <button
                        aria-label="Attach a PDF or image"
                        className="icon-button !h-8 !w-8"
                        disabled={disabled}
                        onClick={() => fileInputRef.current?.click()}
                        title="Attach PDF or image"
                        type="button"
                    >
                        <Icon name="paperclip" size={17} />
                    </button>
                    <span className="hidden text-[11px] text-slate-600 sm:inline">
                        Enter to send · Shift + Enter for a new line
                    </span>
                    <span className="truncate text-[11px] text-slate-600 sm:hidden">
                        {file ? "Attachment ready" : "Guest chats stay temporary"}
                    </span>
                </div>
                <button
                    aria-label="Send message"
                    className="send-button"
                    disabled={(!value.trim() && !file) || disabled}
                    type="submit"
                >
                    <Icon name="send" size={16} />
                </button>
            </div>
        </form>
    );
}
