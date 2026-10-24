const { OAuth2Client } = require("google-auth-library");
const User = require("../Models/user");

let googleClient;

class GoogleIdentityError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
    }
}

function normalizeEmail(email) {
    return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function escapedRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertVerifiedGooglePayload(payload) {
    if (!payload?.sub || !normalizeEmail(payload.email) || payload.email_verified !== true) {
        throw new GoogleIdentityError(
            "Google did not verify this account's email address.",
            401
        );
    }
}

async function verifyGoogleCredential(credential, clientId, verifier) {
    if (!clientId) {
        throw new GoogleIdentityError("Google sign-in is not configured on this server.", 503);
    }
    if (typeof credential !== "string" || !credential.trim() || credential.length > 10000) {
        throw new GoogleIdentityError("A valid Google sign-in credential is required.", 400);
    }

    try {
        const client = verifier || googleClient || (googleClient = new OAuth2Client(clientId));
        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: clientId
        });
        const payload = ticket.getPayload();
        assertVerifiedGooglePayload(payload);
        return payload;
    } catch (error) {
        if (error instanceof GoogleIdentityError) throw error;
        throw new GoogleIdentityError(
            "Google sign-in expired or is invalid. Please try again.",
            401
        );
    }
}

async function getGoogleSignInAccount(payload, UserModel = User) {
    assertVerifiedGooglePayload(payload);
    const linkedUser = await UserModel.findOne({ googleId: payload.sub });
    if (linkedUser) return linkedUser;

    const emailOwner = await UserModel.findOne({
        email: { $regex: `^${escapedRegex(normalizeEmail(payload.email))}$`, $options: "i" }
    });
    if (emailOwner) {
        throw new GoogleIdentityError(
            "This email already has an account. Sign in with its existing method, then choose “Link Google Account” from the signed-in app. Google sign-in will not link accounts automatically.",
            409
        );
    }
    return null;
}

async function linkGoogleIdentity(userId, payload, UserModel = User) {
    assertVerifiedGooglePayload(payload);
    const user = await UserModel.findById(userId).select("email googleId");
    if (!user) {
        throw new GoogleIdentityError("The signed-in account could not be found.", 404);
    }

    if (normalizeEmail(user.email) !== normalizeEmail(payload.email)) {
        throw new GoogleIdentityError(
            "Sign in to an account with the same verified email before linking Google.",
            403
        );
    }

    const linkedGoogleUser = await UserModel.findOne({ googleId: payload.sub }).select("_id");
    if (linkedGoogleUser && linkedGoogleUser._id.toString() !== user._id.toString()) {
        throw new GoogleIdentityError(
            "This Google account is already linked to another account.",
            409
        );
    }
    if (user.googleId && user.googleId !== payload.sub) {
        throw new GoogleIdentityError(
            "A different Google account is already linked to this account.",
            409
        );
    }
    if (user.googleId === payload.sub) return user;

    try {
        const result = await UserModel.updateOne(
            { _id: user._id, email: user.email, googleId: null },
            { $set: { googleId: payload.sub } }
        );
        if (result.modifiedCount === 1) {
            user.googleId = payload.sub;
            return user;
        }
    } catch (error) {
        if (error?.code === 11000) {
            throw new GoogleIdentityError(
                "This Google account is already linked to another account.",
                409
            );
        }
        throw error;
    }

    const currentUser = await UserModel.findById(userId).select("email googleId");
    if (currentUser?.googleId === payload.sub) return currentUser;
    throw new GoogleIdentityError(
        "The account changed while linking. Refresh and try again.",
        409
    );
}

module.exports = {
    GoogleIdentityError,
    normalizeEmail,
    assertVerifiedGooglePayload,
    verifyGoogleCredential,
    getGoogleSignInAccount,
    linkGoogleIdentity
};
