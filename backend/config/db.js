const mongoose = require("mongoose");

async function connectDatabase() {
    const connectionString = process.env.MONGODB_URL;

    if (!connectionString) {
        throw new Error("MONGODB_URL is not configured");
    }

    await mongoose.connect(connectionString);
    console.log("Database connected.");
}

mongoose.connection.on("error", () => {
    console.error("MongoDB connection error.");
});

module.exports = connectDatabase;