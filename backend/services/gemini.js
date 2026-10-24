const { GoogleGenAI } = require("@google/genai");

let ai;
const MODEL = "gemini-2.5-flash";
const STUDY_NOTES_INSTRUCTIONS = `You are the learning assistant in a Smart Study Notes app. Be accurate, useful, and concise by default; concise must not omit important details.
For study notes, begin with one clear topic title, then use only relevant numbered or meaningful subheadings. Explain each concept in one short paragraph of about 2–4 sentences. Add a brief opening paragraph only when it helps, and do not repeat it in later sections. Include a small example or short code sample only when it materially improves understanding or the user requests one. Finish with a brief Quick Summary when useful. Use bullets only for genuinely separate items, steps, or comparisons.
When using Markdown, emit heading markers, emphasis markers, list markers, backticks, and code fences directly without preceding them with backslashes. Escape Markdown punctuation only when it is intentionally meant to appear literally, and never escape formatting markers in normal prose.
Do not add boilerplate sections such as advantages, disadvantages, applications, exam answers, interview questions, or practice questions unless requested or genuinely needed for the topic. Do not write a long introduction, pad with repeated points, or turn every sentence into a bullet. Simple questions, follow-ups, code fixes, translations, and casual messages should receive direct, appropriately short replies rather than a full chapter.
When the user requests detailed notes, expand the explanation while retaining clear structure. For exam requests, provide an exam-ready answer. For PDFs and images, organize the readable source material into concise headings and paragraphs while preserving important facts; distinguish what is visible from what is uncertain and never claim to extract unreadable content.
Match the language and script the user uses or requests, including English, Urdu, and Roman Urdu. Preserve earlier conversation context for follow-up questions.`;

function getClient() {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not configured");
    }

    if (!ai) {
        ai = new GoogleGenAI({ apiKey });
    }

    return ai;
}

function responseText(response) {
    return typeof response.text === "function" ? response.text() : response.text;
}

async function generateNotes(topic) {
    const response = await getClient().models.generateContent({
        model: MODEL,
        config: { systemInstruction: STUDY_NOTES_INSTRUCTIONS },
        contents: `Create concise study notes about the following topic. Apply the requested note format and include only relevant sections.\n\n${topic}`
    });

    return responseText(response);
}

async function generateChatResponse(messages, attachmentContext) {
    const contents = messages.map(({ role, text }, index) => {
        const parts = [];
        if (index === messages.length - 1 && attachmentContext?.documentText) {
            parts.push({
                text: `Use this extracted study-document context when relevant. It was processed once for this temporary chat session:\n\n${attachmentContext.documentText}\n\nCurrent user message:\n${text}`
            });
        } else {
            parts.push({ text });
        }

        if (index === messages.length - 1 && attachmentContext?.image) {
            parts.push({
                inlineData: {
                    mimeType: attachmentContext.image.mimeType,
                    data: attachmentContext.image.data
                }
            });
        }

        return {
            role: role === "assistant" ? "model" : "user",
            parts
        };
    });

    const response = await getClient().models.generateContent({
        model: MODEL,
        config: { systemInstruction: STUDY_NOTES_INSTRUCTIONS },
        contents
    });

    return responseText(response);
}

async function summarizeDocumentChunk(text, index, total) {
    const response = await getClient().models.generateContent({
        model: MODEL,
        config: {
            systemInstruction: STUDY_NOTES_INSTRUCTIONS,
            maxOutputTokens: 1800
        },
        contents: `Summarize chunk ${index + 1} of ${total} as concise study notes. Preserve its important definitions, facts, equations, and necessary steps, but omit repetition and minor detail. Use a few meaningful headings with short paragraphs; do not add an introduction or optional practice/exam sections. The chunk notes will be combined, so retain unique information that may not appear elsewhere.\n\n${text}`
    });

    const summary = responseText(response);
    if (typeof summary !== "string" || !summary.trim()) {
        throw new Error("The document summary was empty");
    }
    return summary.trim();
}

module.exports = {
    generateNotes,
    generateChatResponse,
    summarizeDocumentChunk
};
