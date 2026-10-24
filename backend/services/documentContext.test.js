const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
    UploadError,
    decodeUpload,
    extractPdfText,
    prepareAttachment,
    getAttachmentContext,
    completeImageContext,
    deleteAttachmentContext
} = require("./documentContext");

function makePdf(stream) {
    const objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
    ];
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((object, index) => {
        offsets.push(Buffer.byteLength(pdf));
        pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xrefOffset = Buffer.byteLength(pdf);
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets.slice(1)) {
        pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return Buffer.from(pdf, "ascii");
}

const pngBytes = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489",
    "hex"
);

test("rejects empty, unsupported, and MIME-mismatched uploads", () => {
    assert.throws(
        () => decodeUpload({ data: "", mimeType: "application/pdf" }),
        /file is empty/i
    );
    assert.throws(
        () => decodeUpload({ data: Buffer.from("not a document").toString("base64") }),
        /unsupported or unreadable/i
    );
    assert.throws(
        () => decodeUpload({ data: pngBytes.toString("base64"), mimeType: "image/jpeg" }),
        /does not match/i
    );
});

test("enforces configurable upload size limits", () => {
    const previousLimit = process.env.MAX_IMAGE_SIZE_MB;
    process.env.MAX_IMAGE_SIZE_MB = "1";
    try {
        const oversized = Buffer.concat([pngBytes, Buffer.alloc(1024 * 1024)]);
        assert.throws(
            () => decodeUpload({
                data: oversized.toString("base64"),
                mimeType: "image/png"
            }),
            /too large/i
        );
    } finally {
        if (previousLimit === undefined) delete process.env.MAX_IMAGE_SIZE_MB;
        else process.env.MAX_IMAGE_SIZE_MB = previousLimit;
    }
});

test("extracts readable PDF text and identifies scanned PDFs", async () => {
    const readablePdf = makePdf("BT /F1 12 Tf 20 200 Td (Smart study notes) Tj ET");
    assert.match(await extractPdfText(readablePdf), /Smart study notes/);

    const scannedPdf = makePdf("q Q");
    await assert.rejects(
        extractPdfText(scannedPdf),
        (error) => error instanceof UploadError && /scanned PDF.*OCR/i.test(error.message)
    );
});

test("keeps image context temporary and scoped to its owner", async () => {
    const prepared = await prepareAttachment({
        data: pngBytes.toString("base64"),
        mimeType: "image/png",
        filename: "diagram.png"
    }, "user:owner-a");

    assert.equal(prepared.mimeType, "image/png");
    assert.equal(prepared.filename, "diagram.png");
    assert.throws(
        () => getAttachmentContext(prepared.id, "user:owner-b"),
        (error) => error instanceof UploadError && error.statusCode === 403
    );
    assert.equal(
        getAttachmentContext(prepared.id, "user:owner-a").image.mimeType,
        "image/png"
    );
    completeImageContext(prepared.id, "user:owner-a", "Readable diagram summary");
    assert.match(
        getAttachmentContext(prepared.id, "user:owner-a").documentText,
        /Readable diagram summary/
    );
    deleteAttachmentContext(prepared.id, "user:owner-a");
    assert.throws(
        () => getAttachmentContext(prepared.id, "user:owner-a"),
        /expired/i
    );
});
