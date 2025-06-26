// ✅ Fixed messageModel.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    sender: {
        type: String,
        required: true
    },
    receiver: {
        type: String,
        required: true
    },
    senderName: {
        type: String,
        required: true
    },
    receiverName: {
        type: String,
        required: true
    },
    text: {
        type: String,
        required: false // No longer required, for audio messages
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    seen: {
        type: Boolean,
        default: false
    },
    // --- New Fields for Voice Messages ---
    messageType: {
        type: String,
        default: 'text', // 'text' or 'audio'
    },
    fileUrl: {
        type: String,
        default: null,
    },
    duration: { // To store the duration of the audio
        type: Number,
        default: 0
    }
});

module.exports = mongoose.model('Message', messageSchema);