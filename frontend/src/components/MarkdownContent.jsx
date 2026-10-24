import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { normalizeMarkdown } from "../lib/markdown.js";

export default function MarkdownContent({ children }) {
    return (
        <div className="markdown-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {normalizeMarkdown(children)}
            </ReactMarkdown>
        </div>
    );
}
