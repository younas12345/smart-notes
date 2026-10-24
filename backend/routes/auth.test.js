const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const bcrypt = require("bcrypt");
const { createHash } = require("crypto");
const authRoutes = require("./auth");
const User = require("../Models/user");

async function startTestServer() {
    const app = express();
    app.use(express.json());
    app.use("/", authRoutes);
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
    });
    return server;
}

test("Google account linking and status require an authenticated session", async () => {
    const server = await startTestServer();
    try {
        const address = server.address();
        for (const [path, method] of [
            ["/google/link", "POST"],
            ["/google/status", "GET"]
        ]) {
            const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
                method,
                headers: { "Content-Type": "application/json" },
                ...(method === "POST" ? { body: JSON.stringify({ credential: "untrusted" }) } : {})
            });
            assert.equal(response.status, 401, `${method} ${path} must reject unauthenticated requests`);
        }
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});

test("password sign-in returns one generic 401 for wrong password and unknown email", async () => {
    const previousSecret = process.env.JWT_SECRET;
    const previousFindOne = User.findOne;
    process.env.JWT_SECRET = "test-only-jwt-secret";
    const passwordHash = await bcrypt.hash("correct-password", 4);
    const existingUser = {
        _id: { toString: () => "507f1f77bcf86cd799439011" },
        email: "student@example.com",
        password: passwordHash
    };
    User.findOne = async (query) => (
        query.email?.$regex &&
        new RegExp(query.email.$regex, query.email.$options).test(existingUser.email)
            ? existingUser
            : null
    );

    const server = await startTestServer();
    try {
        const address = server.address();
        const signIn = (email, password) => fetch(
            `http://127.0.0.1:${address.port}/signin`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password })
            }
        );

        const success = await signIn(existingUser.email, "correct-password");
        assert.equal(success.status, 200);
        const successBody = await success.json();
        assert.equal(typeof successBody.token, "string");
        assert.equal(successBody.token.split(".").length, 3);

        const wrongPassword = await signIn(existingUser.email, "incorrect-password");
        const wrongPasswordBody = await wrongPassword.json();
        assert.equal(wrongPassword.status, 401);
        assert.deepEqual(wrongPasswordBody, { message: "Incorrect email or password." });

        const unknownEmail = await signIn("missing@example.com", "incorrect-password");
        assert.equal(unknownEmail.status, 401);
        assert.deepEqual(await unknownEmail.json(), wrongPasswordBody);
    } finally {
        await new Promise((resolve) => server.close(resolve));
        User.findOne = previousFindOne;
        if (previousSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = previousSecret;
    }
});

test("forgot-password does not reveal whether an account exists", async () => {
    const previousFindOne = User.findOne;
    const previousUpdateOne = User.updateOne;
    const smtpVariableNames = [
        "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_SECURE",
        "EMAIL_FROM", "APP_BASE_URL"
    ];
    const previousSmtpValues = Object.fromEntries(
        smtpVariableNames.map((name) => [name, process.env[name]])
    );
    const server = await startTestServer();
    try {
        const address = server.address();
        const request = (email) => fetch(`http://127.0.0.1:${address.port}/forgot-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
        });

        User.findOne = async () => null;
        const missing = await request("missing@example.com");
        User.findOne = async () => ({ email: "google@example.com", googleId: "google-sub" });
        const googleOnly = await request("google@example.com");

        for (const name of smtpVariableNames) delete process.env[name];
        let storedResetHash = "";
        const passwordUser = {
            _id: "507f1f77bcf86cd799439011",
            email: "password@example.com",
            password: "already-hashed-password",
            async save() {}
        };
        User.findOne = async () => passwordUser;
        User.updateOne = async (filter, update) => {
            assert.equal(filter._id, passwordUser._id);
            storedResetHash = passwordUser.passwordResetTokenHash;
            assert.equal(update.$unset.passwordResetTokenHash, 1);
            return { modifiedCount: 1 };
        };
        const passwordAccount = await request("password@example.com");

        assert.equal(missing.status, 200);
        assert.equal(googleOnly.status, 200);
        assert.equal(passwordAccount.status, 200);
        const missingBody = await missing.json();
        assert.deepEqual(await googleOnly.json(), missingBody);
        assert.deepEqual(await passwordAccount.json(), missingBody);
        assert.match(storedResetHash, /^[a-f0-9]{64}$/);
        assert.equal(
            missingBody.message,
            "If a password-enabled account exists for that email, a reset link will be sent."
        );
    } finally {
        await new Promise((resolve) => server.close(resolve));
        User.findOne = previousFindOne;
        User.updateOne = previousUpdateOne;
        for (const name of smtpVariableNames) {
            if (previousSmtpValues[name] === undefined) delete process.env[name];
            else process.env[name] = previousSmtpValues[name];
        }
    }
});

test("reset-password hashes the new password and consumes the reset token once", async () => {
    const previousUpdateOne = User.updateOne;
    const server = await startTestServer();
    const token = "a".repeat(64);
    const expectedHash = createHash("sha256").update(token).digest("hex");
    let savedPasswordHash = "";
    let updateCount = 0;
    User.updateOne = async (filter, update) => {
        assert.equal(filter.passwordResetTokenHash, expectedHash);
        assert.ok(filter.passwordResetExpiresAt.$gt instanceof Date);
        savedPasswordHash = update.$set.password;
        assert.equal(update.$unset.passwordResetTokenHash, 1);
        assert.equal(update.$unset.passwordResetExpiresAt, 1);
        updateCount += 1;
        return { modifiedCount: updateCount === 1 ? 1 : 0 };
    };

    try {
        const address = server.address();
        const reset = () => fetch(`http://127.0.0.1:${address.port}/reset-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                token,
                password: "a-new-secure-password",
                confirmPassword: "a-new-secure-password"
            })
        });

        const success = await reset();
        assert.equal(success.status, 200);
        assert.equal(await bcrypt.compare("a-new-secure-password", savedPasswordHash), true);
        const reused = await reset();
        assert.equal(reused.status, 400);
        assert.match((await reused.json()).message, /invalid or expired/i);
    } finally {
        await new Promise((resolve) => server.close(resolve));
        User.updateOne = previousUpdateOne;
    }
});
