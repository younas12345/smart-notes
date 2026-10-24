const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
    {
        role: {
            type: String,
            enum: ["user", "assistant"],
            required: true
        },
        text: {
            type: String,
            required: true,
            trim: true
        },
        attachment: {
            filename: { type: String, maxlength: 120 },
            mimeType: {
                type: String,
                enum: ["application/pdf", "image/jpeg", "image/png", "image/webp"]
            }
        }
    },
    {
        timestamps: true
    }
);

const chatSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        title: {
            type: String,
            default: "New chat",
            trim: true
        },
        messages: {
            type: [messageSchema],
            default: []
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Chat", chatSchema);
