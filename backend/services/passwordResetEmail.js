const nodemailer = require("nodemailer");

function getEmailConfiguration() {
    const {
        SMTP_HOST,
        SMTP_PORT,
        SMTP_USER,
        SMTP_PASSWORD,
        EMAIL_FROM,
        APP_BASE_URL
    } = process.env;
    const port = Number(SMTP_PORT);

    if (
        !SMTP_HOST ||
        !Number.isInteger(port) ||
        port < 1 ||
        port > 65535 ||
        !SMTP_USER ||
        !SMTP_PASSWORD ||
        !EMAIL_FROM ||
        !APP_BASE_URL
    ) {
        return null;
    }

    let baseUrl;
    try {
        baseUrl = new URL(APP_BASE_URL);
        if (!["http:", "https:"].includes(baseUrl.protocol)) return null;
    } catch {
        return null;
    }

    return {
        host: SMTP_HOST,
        port,
        secure: process.env.SMTP_SECURE === "true",
        auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
        from: EMAIL_FROM,
        baseUrl
    };
}

async function sendPasswordResetEmail(email, token) {
    const config = getEmailConfiguration();
    if (!config) return false;

    const resetUrl = new URL("/", config.baseUrl);
    resetUrl.hash = new URLSearchParams({ resetToken: token }).toString();

    const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.auth,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000
    });

    await transporter.sendMail({
        from: config.from,
        to: email,
        subject: "Reset your Smart Notes password",
        text: `We received a request to reset your Smart Notes password. Use this link within 30 minutes:\n\n${resetUrl.href}\n\nIf you did not request this, you can ignore this email.`
    });
    return true;
}

module.exports = { sendPasswordResetEmail };
