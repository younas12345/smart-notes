const express = require("express");
const mongoose = require("mongoose");
const auth = require("../Middleware/auth");
const Note = require("../Models/Note");
const { generateNotes } = require("../services/gemini");

const router = express.Router();

router.get("/history", auth, async (req, res) => {
    try {
        const notes = await Note.find({ user: req.user.userId }).sort({ createdAt: -1 });
        res.json(notes);
    } catch (error) {
        console.error("History fetch error:", error);
        res.status(500).send("Error Fetching Notes");
    }
});

router.post("/notes", auth, async (req, res) => {
    try {
        const { topic, notes } = req.body;

        if (typeof topic !== "string" || !topic.trim() || topic.length > 300) {
            return res.status(400).json({ message: "A topic of up to 300 characters is required" });
        }
        if (notes !== undefined && (
            typeof notes !== "string" || !notes.trim() || notes.length > 100000
        )) {
            return res.status(400).json({ message: "Saved notes must contain up to 100,000 characters" });
        }

        const noteText = notes === undefined ? await generateNotes(topic.trim()) : notes.trim();
        const newNote = new Note({
            user: req.user.userId,
            topic: topic.trim(),
            notes: noteText
        });

        await newNote.save();

        res.status(201).json({
            success: true,
            note: newNote
        });
    } catch (error) {
        console.error("Error generating note:", error);
        res.status(500).json({ message: "Something Went Wrong" });
    }
});

router.delete("/notes/:id", auth, async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: "Invalid note ID" });
    }

    try {
        const deletedNote = await Note.findOneAndDelete({
            _id: req.params.id,
            user: req.user.userId
        });

        if (!deletedNote) {
            return res.status(404).json({ message: "Note not found" });
        }

        res.json({
            message: "Note deleted successfully"
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Error deleting note");
    }
});

module.exports = router;
