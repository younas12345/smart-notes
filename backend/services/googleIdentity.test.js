const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
    GoogleIdentityError,
    verifyGoogleCredential,
    getGoogleSignInAccount,
    linkGoogleIdentity
} = require("./googleIdentity");

const payload = {
    sub: "google-subject-123",
    email: "student@example.com",
    email_verified: true,
    name: "Student"
};

function query(value) {
    return { select: async () => value };
}

function userModel({ user, linkedUser, emailOwner, updateResult = { modifiedCount: 1 } }) {
    const calls = { updates: [] };
    return {
        calls,
        findById: () => query(user),
        findOne: (filter) => query(
            filter.googleId ? linkedUser : emailOwner
        ),
        updateOne: async (filter, update) => {
            calls.updates.push({ filter, update });
            return updateResult;
        }
    };
}

test("Google ID-token verification requires the configured audience and verified email", async () => {
    let verificationOptions;
    const verifier = {
        verifyIdToken: async (options) => {
            verificationOptions = options;
            return { getPayload: () => payload };
        }
    };

    assert.equal(
        await verifyGoogleCredential("test-id-token", "expected-client-id", verifier),
        payload
    );
    assert.deepEqual(verificationOptions, {
        idToken: "test-id-token",
        audience: "expected-client-id"
    });
    await assert.rejects(
        verifyGoogleCredential("", "expected-client-id", verifier),
        (error) => error instanceof GoogleIdentityError && error.statusCode === 400
    );
    await assert.rejects(
        verifyGoogleCredential("test-id-token", "expected-client-id", {
            verifyIdToken: async () => ({ getPayload: () => ({ ...payload, email_verified: false }) })
        }),
        (error) => error instanceof GoogleIdentityError && error.statusCode === 401
    );
});

test("Google sign-in rejects an email match without automatically linking", async () => {
    const existingAccount = { _id: { toString: () => "account-1" }, email: payload.email };
    const model = {
        calls: [],
        findOne(filter) {
            this.calls.push(filter);
            return Promise.resolve(filter.googleId ? null : existingAccount);
        }
    };

    await assert.rejects(
        getGoogleSignInAccount(payload, model),
        (error) => error instanceof GoogleIdentityError && error.statusCode === 409
    );
    assert.equal(model.calls.length, 2);
    assert.equal(model.calls.some((filter) => filter.googleId === payload.sub), true);
});

test("Google sign-in permits a genuinely new email without creating an implicit link", async () => {
    const model = {
        calls: [],
        async findOne(filter) {
            this.calls.push(filter);
            return null;
        }
    };

    assert.equal(await getGoogleSignInAccount(payload, model), null);
    assert.deepEqual(model.calls, [
        { googleId: payload.sub },
        { email: { $regex: "^student@example\\.com$", $options: "i" } }
    ]);
});

test("linking requires the verified Google email to match the authenticated account", async () => {
    const model = userModel({
        user: { _id: { toString: () => "account-1" }, email: "different@example.com" }
    });
    await assert.rejects(
        linkGoogleIdentity("account-1", payload, model),
        (error) => error instanceof GoogleIdentityError && error.statusCode === 403
    );
    assert.equal(model.calls.updates.length, 0);
});

test("linking rejects Google identities owned by another user", async () => {
    const model = userModel({
        user: { _id: { toString: () => "account-1" }, email: payload.email },
        linkedUser: { _id: { toString: () => "account-2" } }
    });
    await assert.rejects(
        linkGoogleIdentity("account-1", payload, model),
        (error) => error instanceof GoogleIdentityError && error.statusCode === 409
    );
    assert.equal(model.calls.updates.length, 0);
});

test("linking updates only the authenticated account and its matching email", async () => {
    const account = {
        _id: { toString: () => "account-1" },
        email: payload.email
    };
    const model = userModel({ user: account });
    const linked = await linkGoogleIdentity("account-1", payload, model);

    assert.equal(linked.googleId, payload.sub);
    assert.equal(model.calls.updates.length, 1);
    assert.equal(model.calls.updates[0].filter._id, account._id);
    assert.equal(model.calls.updates[0].filter.email, account.email);
    assert.equal(model.calls.updates[0].filter.googleId, null);
    assert.deepEqual(model.calls.updates[0].update, { $set: { googleId: payload.sub } });
});

test("linking treats unique-index races as a safe conflict", async () => {
    const model = userModel({
        user: { _id: { toString: () => "account-1" }, email: payload.email }
    });
    model.updateOne = async () => {
        const error = new Error("duplicate key");
        error.code = 11000;
        throw error;
    };
    await assert.rejects(
        linkGoogleIdentity("account-1", payload, model),
        (error) => error instanceof GoogleIdentityError && error.statusCode === 409
    );
});
