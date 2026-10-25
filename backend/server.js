const serverless = require('serverless-http');
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const express = require("express");
const cors = require("cors");
const dns = require("dns");
const connectDatabase = require("./config/db");
const authRoutes = require("./routes/auth");
const notesRoutes = require("./routes/notes");
const chatRoutes = require("./routes/chat");

dns.setServers(["1.1.1.1", "8.8.8.8"]);

const app = express();

const allowedFrontendOrigins = (process.env.FRONTEND_URL || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use(cors({
    origin(origin, callback) {
        const isLocalDevelopmentOrigin = process.env.NODE_ENV !== "production" &&
            /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || "");
        callback(null, !origin || isLocalDevelopmentOrigin || allowedFrontendOrigins.includes(origin));
    }
}));
app.use(express.json({ limit: "32mb" }));

app.get("/", (req, res) => {
    res.send("Server is running.");
});

app.get("/about", (req, res) => {
    res.send("This is about pages");
});

app.get("/contact", (req, res) => {
    res.send("Contact me at: 034930808342");
});

app.use("/", authRoutes);
app.use("/", notesRoutes);
app.use("/api/chats", chatRoutes);

app.use((error, req, res, next) => {
    if (error?.type === "entity.too.large") {
        return res.status(413).json({
            message: "The upload is too large. Try a smaller PDF or image."
        });
    }
    if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
        return res.status(400).json({ message: "The request body is invalid." });
    }
    next(error);
});

// async function startServer() {
//     try {
//         await connectDatabase();
//         const port = Number(process.env.PORT) || 3000;
//         app.listen(port, () => {
//             console.log(`server is running on port ${port}`);
//         });
//     } catch (error) {
//         console.error("Server startup failed because the database connection could not be established.");
//         process.exitCode = 1;
//     }
// }
async function startServer() {
    try {
        await connectDatabase();
        
        if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
            const port = Number(process.env.PORT) || 3000;
            app.listen(port, () => {
                console.log(`server is running on port ${port}`);
            });
        }
    } catch (error) {
        console.error("Server startup failed because the database connection could not be established.");
        process.exitCode = 1;
    }
}

// Function ko sirf ek dafa yahan call karein
startServer();

// Vercel (Serverless) ke liye app ko export kar dein
module.exports = serverless(app);