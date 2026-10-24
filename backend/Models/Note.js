//Database ka structure (scheema)
const mongoose = require("mongoose");
const noteSchema = new mongoose.Schema(
    {
    user:{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    topic:{
        type:String,
        required:true,
    },
    notes:{
        type:String,
        required:true,
    }
},
{
   timestamps:true,
});
module.exports = mongoose.model("Note", noteSchema);