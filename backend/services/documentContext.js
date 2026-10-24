const { randomUUID } = require("crypto");
const { summarizeDocumentChunk } = require("./gemini");

const CONTEXT_TTL_MS = 30 * 60 * 1000;
const MAX_CONTEXTS = 100;
const MAX_CONTEXT_BYTES = 64 * 1024 * 1024;
const MAX_EXTRACTED_TEXT = 400000;
const CHUNK_SIZE = 14000;
const contexts = new Map();
let contextBytes = 0;

class UploadError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
    }
}

function configuredLimit(name, fallbackMb) {
    const value = Number.parseInt(process.env[name] || "", 10);
    const maxMb = name === "MAX_IMAGE_SIZE_MB" ? 15 : 23;
    const limitMb = Number.isInteger(value) && value > 0
        ? Math.min(value, maxMb)
        : fallbackMb;
    return limitMb * 1024 * 1024;
}

function getUploadLimits() {
    return {
        pdf: configuredLimit("MAX_PDF_SIZE_MB", 10),
        image: configuredLimit("MAX_IMAGE_SIZE_MB", 5)
    };
}

function fileTypeFromBytes(bytes) {
    if (bytes.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
    if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
        return "image/png";
    }
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return "image/jpeg";
    }
    if (
        bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
        bytes.subarray(8, 12).toString("ascii") === "WEBP"
    ) {
        return "image/webp";
    }
    return "";
}

function decodeUpload(upload) {
    if (!upload || typeof upload !== "object" ||
        typeof upload.data !== "string" ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(upload.data)) {
        throw new UploadError("The uploaded file could not be read. Please select it again.");
    }
    const bytes = Buffer.from(upload.data, "base64");
    if (bytes.length === 0) {
        throw new UploadError("The selected file is empty.");
    }
    const actualType = fileTypeFromBytes(bytes);
    if (!actualType) {
        throw new UploadError("Unsupported or unreadable file. Upload a valid PDF, JPEG, PNG, or WebP file.");
    }

    const limits = getUploadLimits();
    const isPdf = actualType === "application/pdf";
    const allowedTypes = isPdf
        ? ["application/pdf", "application/x-pdf", ""]
        : ["image/jpeg", "image/png", "image/webp", ""];
    const statedType = typeof upload.mimeType === "string" ? upload.mimeType.toLowerCase() : "";
    if (!allowedTypes.includes(statedType) ||
        (!isPdf && statedType !== "" && statedType !== actualType)) {
        throw new UploadError("The file content does not match a supported file type.");
    }
    const maxSize = isPdf ? limits.pdf : limits.image;
    if (bytes.length > maxSize) {
        const maxMb = Math.floor(maxSize / (1024 * 1024));
        throw new UploadError(`File is too large. The maximum ${isPdf ? "PDF" : "image"} size is ${maxMb} MB.`);
    }
    return {
        bytes,
        mimeType: actualType,
        filename: typeof upload.filename === "string"
            ? upload.filename.replace(/[\\/:*?"<>|]/g, "_").slice(0, 120)
            : "attachment"
    };
}

async function extractPdfText(bytes) {
    let pdf;
    try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdf = await pdfjs.getDocument({
            data: new Uint8Array(bytes),
            useSystemFonts: true,
            isEvalSupported: false
        }).promise;
        const pages = [];
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
            const page = await pdf.getPage(pageNumber);
            const content = await page.getTextContent();
            pages.push(content.items.map((item) => (
                typeof item.str === "string" ? item.str : ""
            )).join(" "));
        }
        const text = pages.join("\n\n").replace(/\s+/g, " ").trim();
        if (!text) {
            throw new UploadError("No readable text was found. This may be a scanned PDF; use OCR to recognize its pages before uploading.");
        }
        if (text.length > MAX_EXTRACTED_TEXT) {
            throw new UploadError("This PDF contains too much text to process in one upload. Split it into smaller documents.");
        }
        return text;
    } catch (error) {
        if (error instanceof UploadError) throw error;
        if (/password|encrypt/i.test(String(error?.message || ""))) {
            throw new UploadError("This PDF is encrypted or password-protected. Remove its protection before uploading.");
        }
        throw new UploadError("The PDF could not be read. It may be damaged or use unsupported encoding.");
    } finally {
        if (pdf) await pdf.destroy();
    }
}

function splitText(text) {
    const chunks = [];
    let offset = 0;
    while (offset < text.length) {
        let end = Math.min(offset + CHUNK_SIZE, text.length);
        if (end < text.length) {
            const boundary = Math.max(
                text.lastIndexOf("\n", end),
                text.lastIndexOf(" ", end)
            );
            if (boundary > offset + CHUNK_SIZE * 0.8) end = boundary;
        }
        chunks.push(text.slice(offset, end));
        offset = end;
    }
    return chunks;
}

function removeContext(id) {
    const entry = contexts.get(id);
    if (!entry) return;
    contextBytes -= entry.bytes;
    contexts.delete(id);
}

function removeExpiredContexts(now = Date.now()) {
    for (const [id, entry] of contexts) {
        if (entry.expiresAt <= now) removeContext(id);
    }
}

function contextSize(context) {
    return context.image
        ? Buffer.byteLength(context.image.data, "utf8")
        : Buffer.byteLength(context.documentText, "utf8");
}

function makeRoom(size) {
    while (contexts.size >= MAX_CONTEXTS || contextBytes + size > MAX_CONTEXT_BYTES) {
        const oldest = contexts.keys().next().value;
        if (!oldest) throw new UploadError("There is not enough temporary storage for another attachment.", 507);
        removeContext(oldest);
    }
}

async function prepareAttachment(upload, ownerKey) {
    const file = decodeUpload(upload);
    let context;
    if (file.mimeType === "application/pdf") {
        const text = await extractPdfText(file.bytes);
        const chunks = splitText(text);
        const summaries = [];
        for (let index = 0; index < chunks.length; index += 1) {
            summaries.push(await summarizeDocumentChunk(chunks[index], index, chunks.length));
        }
        context = {
            documentText: `Document: ${file.filename}\n${summaries.join("\n\n")}`
        };
    } else {
        context = {
            image: {
                mimeType: file.mimeType,
                data: file.bytes.toString("base64")
            }
        };
    }

    removeExpiredContexts();
    const bytes = contextSize(context);
    makeRoom(bytes);
    const id = randomUUID();
    contexts.set(id, {
        ownerKey,
        context,
        expiresAt: Date.now() + CONTEXT_TTL_MS,
        bytes
    });
    contextBytes += bytes;
    return { id, context, mimeType: file.mimeType, filename: file.filename };
}

function getAttachmentContext(id, ownerKey) {
    if (typeof id !== "string" || !id || id.length > 64) {
        throw new UploadError("The document context is invalid. Please attach the file again.");
    }
    const entry = contexts.get(id);
    if (!entry || entry.expiresAt <= Date.now()) {
        removeContext(id);
        throw new UploadError("The temporary document context expired. Please attach the file again.");
    }
    if (entry.ownerKey !== ownerKey) {
        throw new UploadError("This document is not available in this conversation.", 403);
    }
    entry.expiresAt = Date.now() + CONTEXT_TTL_MS;
    contexts.delete(id);
    contexts.set(id, entry);
    return entry.context;
}

function completeImageContext(id, ownerKey, response) {
    const entry = contexts.get(id);
    if (entry && entry.ownerKey === ownerKey && entry.context.image) {
        entry.context = { documentText: `Previously analyzed image context:\n${response}` };
        contextBytes -= entry.bytes;
        entry.bytes = contextSize(entry.context);
        contextBytes += entry.bytes;
    }
}

function deleteAttachmentContext(id, ownerKey) {
    const entry = contexts.get(id);
    if (entry && entry.ownerKey === ownerKey) removeContext(id);
}

module.exports = {
    UploadError,
    getUploadLimits,
    decodeUpload,
    extractPdfText,
    prepareAttachment,
    getAttachmentContext,
    completeImageContext,
    deleteAttachmentContext
};
