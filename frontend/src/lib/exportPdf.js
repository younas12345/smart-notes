import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import MarkdownContent from "../components/MarkdownContent.jsx";

export async function downloadStudyPdf({ title, content, filename }) {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf")
    ]);
    const root = document.createElement("article");
    root.dir = "auto";
    root.className = "study-pdf-render";
    const heading = document.createElement("h1");
    heading.dir = "auto";
    heading.textContent = title || "Study notes";
    const markdownContainer = document.createElement("div");
    root.append(heading, markdownContainer);
    Object.assign(root.style, {
        position: "fixed",
        left: "0",
        top: "0",
        zIndex: "-1",
        width: "760px",
        padding: "42px",
        color: "#172033",
        background: "#ffffff",
        fontFamily: '"Noto Naskh Arabic", "Segoe UI", Arial, sans-serif',
        fontSize: "16px",
        lineHeight: "1.65",
        overflowWrap: "anywhere"
    });
    document.body.append(root);
    const markdownRoot = createRoot(markdownContainer);
    flushSync(() => {
        markdownRoot.render(React.createElement(MarkdownContent, null, content));
    });

    try {
        if (document.fonts?.ready) await document.fonts.ready;
        const canvas = await html2canvas(root, {
            backgroundColor: "#ffffff",
            scale: 2,
            logging: false,
            useCORS: false
        });
        if (!canvas.width || !canvas.height) {
            throw new Error("The study note could not be rendered for PDF export.");
        }

        const pdf = new jsPDF({ format: "a4", unit: "mm", compress: true });
        const margin = 15;
        const printableWidth = 210 - margin * 2;
        const printableHeight = 297 - margin * 2;
        const pixelsPerMm = canvas.width / printableWidth;
        const pageSliceHeight = Math.floor(printableHeight * pixelsPerMm);
        const pageCount = Math.ceil(canvas.height / pageSliceHeight);

        for (let page = 0; page < pageCount; page += 1) {
            if (page > 0) pdf.addPage();
            const startY = page * pageSliceHeight;
            const sliceHeight = Math.min(pageSliceHeight, canvas.height - startY);
            const pageCanvas = document.createElement("canvas");
            pageCanvas.width = canvas.width;
            pageCanvas.height = sliceHeight;
            const context = pageCanvas.getContext("2d");
            if (!context) throw new Error("PDF export is unavailable in this browser.");
            context.drawImage(
                canvas,
                0, startY, canvas.width, sliceHeight,
                0, 0, canvas.width, sliceHeight
            );
            pdf.addImage(
                pageCanvas.toDataURL("image/jpeg", 0.92),
                "JPEG",
                margin,
                margin,
                printableWidth,
                sliceHeight / pixelsPerMm,
                undefined,
                "FAST"
            );
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(9);
            pdf.setTextColor(90);
            pdf.text(`${page + 1} / ${pageCount}`, 195, 289, { align: "right" });
        }

        const safeName = String(filename || title || "study-notes")
            .replace(/[\\/:*?"<>|]/g, "-")
            .trim()
            .slice(0, 100) || "study-notes";
        pdf.save(`${safeName}.pdf`);
    } finally {
        markdownRoot.unmount();
        root.remove();
    }
}
