const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

export async function apiRequest(path, { token, ...options } = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }
    if (token) {
        headers.set("Authorization", `Bearer ${token}`);
    }

    let response;
    try {
        response = await fetch(`${apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`, {
            ...options,
            headers
        });
    } catch {
        throw new Error("Cannot reach the server. Check that the backend is running.");
    }

    let data;
    try {
        data = await response.json();
    } catch {
        throw new Error("The server returned an unreadable response.");
    }

    if (!response.ok) {
        throw new Error(data.message || "The request failed.");
    }

    return data;
}

export function toConversation(chat) {
    return {
        id: chat._id,
        chatId: chat._id,
        title: chat.title || "New chat",
        isGuest: false,
        messages: (chat.messages || []).map((message) => ({
            id: message._id || crypto.randomUUID(),
            role: message.role,
            content: message.text,
            attachment: message.attachment
        })),
        documentId: chat.documentId || ""
    };
}
