export function normalizeMarkdown(content) {
    const blocks = String(content ?? "").replace(/\r\n?/g, "\n")
        .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g);

    return blocks.map((block, index) => {
        if (index % 2 === 1) return block;

        const inlineCodeParts = block.split(/(`+[^`\n]*`+)/g);
        return inlineCodeParts.map((part, partIndex) => {
            if (partIndex % 2 === 1) return part;
            return part
                .replace(/^([ \t]*)\\(#{1,6})(?=\s)/gm, "$1$2")
                .replace(/^([ \t]*)\\([-+*])(?=\s)/gm, "$1$2")
                .replace(/\\(?=\*{1,2}|_{1,2})/g, "");
        }).join("");
    }).join("");
}
