const express = require("express");
const mongoose = require("mongoose");
const auth = require("../Middleware/auth");
const Chat = require("../Models/Chat");
const { generateChatResponse } = require("../services/gemini");
const {
    UploadError,
    getUploadLimits,
    prepareAttachment,
    getAttachmentContext,
    completeImageContext,
    deleteAttachmentContext
} = require("../services/documentContext");

const router = express.Router();
const MAX_MESSAGE_LENGTH = 8000;
const MAX_MESSAGES = 40;
const GUEST_REQUEST_LIMIT = 20;
const GUEST_WINDOW_MS = 15 * 60 * 1000;
const guestRequests = new Map();

function limitGuestRequests(req, res, next) {
    const now = Date.now();
    const record = guestRequests.get(req.ip);
    if (!record || now - record.startedAt >= GUEST_WINDOW_MS) {
        if (!record && guestRequests.size >= 5000) {
            for (const [ip, entry] of guestRequests) {
                if (now - entry.startedAt >= GUEST_WINDOW_MS) {
                    guestRequests.delete(ip);
                }
            }
            if (guestRequests.size >= 5000) {
                return res.status(429).json({ message: "Guest chat is temporarily at capacity" });
            }
        }
        guestRequests.set(req.ip, { startedAt: now, count: 1 });
        return next();
    }
    if (record.count >= GUEST_REQUEST_LIMIT) {
        return res.status(429).json({ message: "Guest chat request limit reached. Try again later." });
    }
    record.count += 1;
    next();
}

function validMessage(message) {
    return (
        message &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.text === "string" &&
        message.text.trim().length > 0 &&
        message.text.length <= MAX_MESSAGE_LENGTH &&
        (!message.attachment || (
            message.role === "user" &&
            typeof message.attachment.filename === "string" &&
            message.attachment.filename.length <= 120 &&
            ["application/pdf", "image/jpeg", "image/png", "image/webp"]
                .includes(message.attachment.mimeType)
        ))
    );
}

function validMessageHistory(messages) {
    return (
        Array.isArray(messages) &&
        messages.length <= MAX_MESSAGES &&
        messages.every(validMessage) &&
        messages.reduce((total, message) => total + message.text.length, 0) <= 80000
    );
}

function chatResponse(chat) {
    return {
        _id: chat._id,
        title: chat.title,
        messages: chat.messages,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt
    };
}

function validUserId(userId) {
    return mongoose.isValidObjectId(userId);
}

async function generateReply(messages, attachmentContext) {
    const reply = await generateChatResponse(messages, attachmentContext);
    if (typeof reply !== "string" || !reply.trim()) {
        throw new Error("Gemini returned an empty response");
    }
    return reply.trim();
}

function resolveAttachment(req, ownerKey) {
    if (req.body?.attachment) {
        return prepareAttachment(req.body.attachment, ownerKey);
    }
    if (req.body?.documentId) {
        return Promise.resolve({
            id: req.body.documentId,
            context: getAttachmentContext(req.body.documentId, ownerKey)
        });
    }
    return Promise.resolve({ id: "", context: null });
}

function uploadErrorResponse(res, error) {
    if (error instanceof UploadError) {
        return res.status(error.statusCode).json({ message: error.message });
    }
    return null;
}

router.get("/config", (req, res) => {
    res.json({ maxUploadBytes: getUploadLimits() });
});

router.post("/guest", limitGuestRequests, async (req, res) => {
    const { messages, message } = req.body;
    if (!validMessageHistory(messages) || typeof message !== "string" ||
        !message.trim() || message.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({ message: "Invalid chat messages" });
    }
    if (messages.length >= MAX_MESSAGES) {
        return res.status(400).json({ message: "This chat has reached its message limit" });
    }

    let attachment;
    try {
        attachment = await resolveAttachment(req, `guest:${req.ip}`);
        const reply = await generateReply([
            ...messages,
            { role: "user", text: message.trim() }
        ], attachment.context);
        if (attachment.id && attachment.context?.image) {
            completeImageContext(attachment.id, `guest:${req.ip}`, reply);
        }
        res.json({
            message: { role: "assistant", text: reply },
            documentId: attachment.id || undefined
        });
    } catch (error) {
        if (attachment?.id) deleteAttachmentContext(attachment.id, `guest:${req.ip}`);
        if (uploadErrorResponse(res, error)) return;
        res.status(502).json({ message: "Unable to generate a response right now" });
    }
});

router.get("/", auth, async (req, res) => {
    if (!validUserId(req.user.userId)) {
        return res.status(401).json({ message: "Invalid authenticated user" });
    }

    try {
        const chats = await Chat.find({ user: req.user.userId })
            .sort({ updatedAt: -1 })
            .select("title messages createdAt updatedAt");

        res.json(chats);
    } catch (error) {
        console.error("Chat list fetch error:", error);
        res.status(500).json({ message: "Unable to fetch chats" });
    }
});

router.get("/:id", auth, async (req, res) => {
    if (!validUserId(req.user.userId)) {
        return res.status(401).json({ message: "Invalid authenticated user" });
    }
    if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: "Invalid chat ID" });
    }

    try {
        const chat = await Chat.findOne({
            _id: req.params.id,
            user: req.user.userId
        }).select("title messages createdAt updatedAt");

        if (!chat) {
            return res.status(404).json({ message: "Chat not found" });
        }
        res.json(chat);
    } catch {
        res.status(500).json({ message: "Unable to fetch chat" });
    }
});

router.post("/", auth, async (req, res) => {
    if (!validUserId(req.user.userId)) {
        return res.status(401).json({ message: "Invalid authenticated user" });
    }

    const { message } = req.body;
    if (typeof message !== "string" || !message.trim() || message.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({ message: "A valid message is required" });
    }

    const text = message.trim();
    let reply;
    let attachment;
    try {
        const ownerKey = `user:${req.user.userId}`;
        attachment = await resolveAttachment(req, ownerKey);
        reply = await generateReply([{ role: "user", text }], attachment.context);
        if (attachment.id && attachment.context?.image) {
            completeImageContext(attachment.id, ownerKey, reply);
        }
    } catch (error) {
        if (attachment?.id) deleteAttachmentContext(attachment.id, `user:${req.user.userId}`);
        if (uploadErrorResponse(res, error)) return;
        return res.status(502).json({ message: "Unable to generate a response right now" });
    }

    try {
        const chat = await Chat.create({
            user: req.user.userId,
            title: text.slice(0, 80),
            messages: [
                {
                    role: "user",
                    text,
                    ...(attachment?.filename ? {
                        attachment: { filename: attachment.filename, mimeType: attachment.mimeType }
                    } : {})
                },
                { role: "assistant", text: reply }
            ]
        });
        res.status(201).json({
            ...chatResponse(chat),
            documentId: attachment?.id || undefined
        });
    } catch {
        res.status(500).json({ message: "Unable to save chat" });
    }
});

router.post("/import", auth, async (req, res) => {
    if (!validUserId(req.user.userId)) {
        return res.status(401).json({ message: "Invalid authenticated user" });
    }

    const { title, messages } = req.body;
    if (
        !validMessageHistory(messages) ||
        messages.length === 0 ||
        !messages.some((message) => message.role === "user") ||
        messages.length > MAX_MESSAGES
    ) {
        return res.status(400).json({ message: "Invalid chat to import" });
    }

    try {
        const chat = await Chat.create({
            user: req.user.userId,
            title: typeof title === "string" && title.trim()
                ? title.trim().slice(0, 80)
                : messages.find((message) => message.role === "user").text.slice(0, 80),
            messages
        });
        res.status(201).json(chatResponse(chat));
    } catch {
        res.status(500).json({ message: "Unable to import chat" });
    }
});

router.post("/:id/messages", auth, async (req, res) => {
    if (!validUserId(req.user.userId)) {
        return res.status(401).json({ message: "Invalid authenticated user" });
    }
    if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: "Invalid chat ID" });
    }

    const { message } = req.body;
    if (typeof message !== "string" || !message.trim() || message.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({ message: "A valid message is required" });
    }

    let chat;
    try {
        chat = await Chat.findOne({
            _id: req.params.id,
            user: req.user.userId
        });
    } catch {
        return res.status(500).json({ message: "Unable to load chat" });
    }
    if (!chat) {
        return res.status(404).json({ message: "Chat not found" });
    }
    if (chat.messages.length >= MAX_MESSAGES - 1) {
        return res.status(400).json({ message: "This chat has reached its message limit" });
    }

    const text = message.trim();
    let reply;
    let attachment;
    const ownerKey = `user:${req.user.userId}`;
    try {
        attachment = await resolveAttachment(req, ownerKey);
        reply = await generateReply([
            ...chat.messages.map(({ role, text: content }) => ({ role, text: content })),
            { role: "user", text }
        ], attachment.context);
        if (attachment.id && attachment.context?.image) {
            completeImageContext(attachment.id, ownerKey, reply);
        }
    } catch (error) {
        if (attachment?.id) deleteAttachmentContext(attachment.id, ownerKey);
        if (uploadErrorResponse(res, error)) return;
        return res.status(502).json({ message: "Unable to generate a response right now" });
    }

    chat.messages.push(
        {
            role: "user",
            text,
            ...(attachment?.filename ? {
                attachment: { filename: attachment.filename, mimeType: attachment.mimeType }
            } : {})
        },
        { role: "assistant", text: reply }
    );
    try {
        await chat.save();
        res.json({
            ...chatResponse(chat),
            documentId: attachment?.id || undefined
        });
    } catch {
        res.status(500).json({ message: "Unable to save chat" });
    }
});

router.post("/:id/regenerate", auth, async (req, res) => {
    if (!validUserId(req.user.userId)) {
        return res.status(401).json({ message: "Invalid authenticated user" });
    }
    if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: "Invalid chat ID" });
    }

    const { messageId } = req.body;
    if (!mongoose.isValidObjectId(messageId)) {
        return res.status(400).json({ message: "Invalid message ID" });
    }

    let chat;
    try {
        chat = await Chat.findOne({
            _id: req.params.id,
            user: req.user.userId
        });
    } catch {
        return res.status(500).json({ message: "Unable to load chat" });
    }
    if (!chat) {
        return res.status(404).json({ message: "Chat not found" });
    }

    const index = chat.messages.findIndex((message) => message._id.equals(messageId));
    if (index <= 0 || chat.messages[index].role !== "assistant" ||
        chat.messages[index - 1].role !== "user") {
        return res.status(400).json({ message: "Response cannot be regenerated" });
    }

    let reply;
    try {
        const context = req.body.documentId
            ? getAttachmentContext(req.body.documentId, `user:${req.user.userId}`)
            : null;
        reply = await generateReply(
            chat.messages.slice(0, index).map(({ role, text }) => ({ role, text })),
            context
        );
    } catch (error) {
        if (uploadErrorResponse(res, error)) return;
        return res.status(502).json({ message: "Unable to generate a response right now" });
    }

    chat.messages[index].text = reply;
    try {
        await chat.save();
        res.json({ message: chat.messages[index] });
    } catch {
        res.status(500).json({ message: "Unable to save regenerated response" });
    }
});

module.exports = router;
