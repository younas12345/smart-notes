import React from "react";
import Icon from "./Icon.jsx";

export default function ErrorBanner({ message, onDismiss }) {
    return (
        <div
            className="mb-3 flex items-start gap-2.5 rounded-xl border border-rose-400/20 bg-rose-400/[0.07] px-3.5 py-3 text-sm text-rose-200"
            role="alert"
        >
            <span className="mt-0.5 text-rose-300">!</span>
            <p className="flex-1 leading-5">{message}</p>
            <button aria-label="Dismiss error" className="text-rose-200/70 hover:text-rose-100" onClick={onDismiss}>
                <Icon name="close" size={16} />
            </button>
        </div>
    );
}
