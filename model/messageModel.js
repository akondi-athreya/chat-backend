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
        required: true
    },
    timestamp: { 
        type: Date,
        default: Date.now
    },
    seen: { 
        type: Boolean,
        default: false
    } 
});

module.exports = mongoose.model('Message', messageSchema);
