const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    userId: { 
        type: String,
        required: true
    },
    emailId: {
        type: String,
        required: true
    },
    notificationToken: { 
        type: String,
        required: true
    },
    createdAt: { 
        type: Date, default: Date.now
    },
    updatedAt: { 
        type: Date, default: Date.now
    }
});

module.exports = mongoose.model('Notification', notificationSchema);