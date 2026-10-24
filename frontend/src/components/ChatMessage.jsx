import React from "react";
import Icon from "./Icon.jsx";
import MarkdownContent from "./MarkdownContent.jsx";

export default function ChatMessage({ message, onCopy, onRegenerate, onSave, onDownload, copied }) {
    const isAssistant = message.role === "assistant";

    if (!isAssistant) {
        return (
            <div className="flex justify-end">
                <div className="user-message-bubble max-w-[88%] rounded-3xl rounded-br-lg bg-[#202530] px-4 py-3 text-sm leading-6 text-slate-100 sm:max-w-[78%] sm:px-5">
                    {message.content}
                    {message.attachment?.filename && (
                        <span className="mt-2 block border-t border-white/10 pt-2 text-xs text-slate-400">
                            Attached: {message.attachment.filename}
                        </span>
                    )}
                </div>
            </div>
        );
    }

    return (
        <article className="flex items-start gap-3.5">
            <span className="assistant-avatar">
                <Icon name="spark" size={17} />
            </span>
            <div className="min-w-0 flex-1 pt-1">
                <MarkdownContent>{message.content}</MarkdownContent>
                <div className="mt-3 flex items-center gap-1">
                    <button className="message-action" onClick={onCopy} title="Copy response">
                        <Icon name={copied ? "check" : "copy"} size={15} />
                        <span>{copied ? "Copied" : "Copy"}</span>
                    </button>
                    <button className="message-action" onClick={onRegenerate} title="Regenerate response">
                        <Icon name="refresh" size={15} />
                        <span>Regenerate</span>
                    </button>
                    <button className="message-action" onClick={onSave} title="Save response as a study note">
                        <span>Save note</span>
                    </button>
                    <button className="message-action" onClick={onDownload} title="Download this response as PDF">
                        <span>Download PDF</span>
                    </button>
                </div>
            </div>
        </article>
    );
}
