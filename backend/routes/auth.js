const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { createHash, randomBytes } = require("crypto");
const { rateLimit } = require("express-rate-limit");
const auth = require("../Middleware/auth");
const User = require("../Models/user");
const { sendPasswordResetEmail } = require("../services/passwordResetEmail");
const {
    GoogleIdentityError,
    normalizeEmail,
    verifyGoogleCredential,
    getGoogleSignInAccount,
    linkGoogleIdentity
} = require("../services/googleIdentity");

const router = express.Router();
const INCORRECT_CREDENTIALS_MESSAGE = "Incorrect email or password.";
const PASSWORD_RESET_RESPONSE = "If a password-enabled account exists for that email, a reset link will be sent.";
const passwordResetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many password reset requests. Please try again later." }
});

function issueToken(user) {
    if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET is not configured");
    }
    return jwt.sign(
        {
            userId: user._id.toString(),
            email: user.email
        },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );
}

function escapedRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findUserByEmail(email) {
    return User.findOne({
        email: { $regex: `^${escapedRegex(email)}$`, $options: "i" }
    });
}

router.get("/google/config", (req, res) => {
    res.json({ clientId: process.env.GOOGLE_CLIENT_ID || "" });
});

router.get("/google/status", auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select("googleId");
        if (!user) {
            return res.status(404).json({ message: "The signed-in account could not be found." });
        }
        res.json({ linked: Boolean(user.googleId) });
    } catch {
        res.status(500).json({ message: "Unable to check linked accounts." });
    }
});

router.post("/signup", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (
            typeof name !== "string" || !name.trim() || name.length > 100 ||
            typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
            typeof password !== "string" || password.length < 8 || password.length > 128
        ) {
            return res.status(400).json({
                message: "Enter a name, valid email, and password between 8 and 128 characters."
            });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const existingUser = await findUserByEmail(normalizedEmail);

        if (existingUser) {
            return res.status(400).json({
                message: "Email already exists"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({
            name: name.trim(),
            email: normalizedEmail,
            password: hashedPassword
        });
        const token = issueToken(user);
        await user.save();

        res.status(201).json({
            message: "Signup Successfull ",
            token
        });
    } catch {
        console.error("Signup failed unexpectedly.");
        res.status(500).json({
            message: "Server error. Please try again."
        });
    }
});

router.post("/signin", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
            return res.status(400).json({
                message: "Email and Password are required."
            });
        }

        const user = await findUserByEmail(email.trim().toLowerCase());

        if (!user) {
            return res.status(401).json({
                message: INCORRECT_CREDENTIALS_MESSAGE
            });
        }

        const isMatch = typeof user.password === "string" && user.password.length > 0
            ? await bcrypt.compare(password, user.password)
            : false;

        if (!isMatch) {
            return res.status(401).json({
                message: INCORRECT_CREDENTIALS_MESSAGE
            });
        }

        const token = issueToken(user);

        res.json({
            message: "Login Successfull",
            token
        });
    } catch {
        console.error("Password sign-in failed unexpectedly.");
        res.status(500).json({
            message: "Server error. Please try again."
        });
    }
});

router.post("/forgot-password", passwordResetLimiter, async (req, res) => {
    const email = req.body?.email;
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return res.json({ message: PASSWORD_RESET_RESPONSE });
    }

    try {
        const user = await findUserByEmail(email.trim().toLowerCase());
        if (!user || typeof user.password !== "string" || !user.password) {
            return res.json({ message: PASSWORD_RESET_RESPONSE });
        }

        const token = randomBytes(32).toString("hex");
        const tokenHash = createHash("sha256").update(token).digest("hex");
        user.passwordResetTokenHash = tokenHash;
        user.passwordResetExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
        await user.save();

        try {
            const sent = await sendPasswordResetEmail(user.email, token);
            if (!sent) {
                await User.updateOne(
                    { _id: user._id, passwordResetTokenHash: tokenHash },
                    { $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1 } }
                );
            }
        } catch {
            await User.updateOne(
                { _id: user._id, passwordResetTokenHash: tokenHash },
                { $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1 } }
            );
            console.error("Password reset email could not be sent.");
        }

        return res.json({ message: PASSWORD_RESET_RESPONSE });
    } catch {
        console.error("Password reset request could not be processed.");
        return res.status(500).json({ message: "Unable to process the password reset request." });
    }
});

router.post("/reset-password", passwordResetLimiter, async (req, res) => {
    const { token, password, confirmPassword } = req.body || {};
    if (
        typeof token !== "string" ||
        !/^[a-f0-9]{64}$/i.test(token) ||
        typeof password !== "string" ||
        password.length < 8 ||
        password.length > 128 ||
        password !== confirmPassword
    ) {
        return res.status(400).json({
            message: "Use a valid reset link and matching password of 8 to 128 characters."
        });
    }

    try {
        const tokenHash = createHash("sha256").update(token).digest("hex");
        const passwordHash = await bcrypt.hash(password, 10);
        const result = await User.updateOne(
            {
                passwordResetTokenHash: tokenHash,
                passwordResetExpiresAt: { $gt: new Date() },
                password: { $exists: true, $ne: "" }
            },
            {
                $set: { password: passwordHash },
                $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1 }
            }
        );

        if (!result.modifiedCount) {
            return res.status(400).json({
                message: "This reset link is invalid or expired. Request a new password reset link."
            });
        }

        return res.json({ message: "Password reset successfully. Sign in with your new password." });
    } catch {
        console.error("Password reset could not be completed.");
        return res.status(500).json({ message: "Unable to reset the password. Please try again." });
    }
});

router.post("/google/signin", async (req, res) => {
    if (!process.env.JWT_SECRET) {
        return res.status(500).json({ message: "Authentication is not configured on this server." });
    }

    try {
        const payload = await verifyGoogleCredential(
            req.body?.credential,
            process.env.GOOGLE_CLIENT_ID
        );
        let user = await getGoogleSignInAccount(payload);
        if (!user) {
            user = await User.create({
                name: payload.name?.trim() || payload.email.split("@")[0],
                email: normalizeEmail(payload.email),
                googleId: payload.sub,
                authProvider: "google"
            });
        }

        res.json({ token: issueToken(user), email: user.email });
    } catch (error) {
        if (error instanceof GoogleIdentityError) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        if (error?.code === 11000) {
            return res.status(409).json({ message: "This Google account is already registered." });
        }
        console.error("Google sign-in could not complete.");
        res.status(500).json({ message: "Google sign-in could not complete. Please try again." });
    }
});

router.post("/google/link", auth, async (req, res) => {
    try {
        const payload = await verifyGoogleCredential(
            req.body?.credential,
            process.env.GOOGLE_CLIENT_ID
        );
        await linkGoogleIdentity(req.user.userId, payload);
        res.json({ linked: true });
    } catch (error) {
        if (error instanceof GoogleIdentityError) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        if (error?.code === 11000) {
            return res.status(409).json({
                message: "This Google account is already linked to another account."
            });
        }
        console.error("Google account linking could not complete.");
        res.status(500).json({ message: "Google account linking could not complete. Please try again." });
    }
});

module.exports = router;
