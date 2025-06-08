const Message = require('../model/messageModel');

// Save a new message
exports.saveMessage = async (data) => {
    const msg = new Message(data);
    return await msg.save();
};

// Get chat history between two users
exports.getChatHistory = async (req, res) => {
    const { user1, user2 } = req.params;
    try {
        const messages = await Message.find({
            $or: [
                { sender: user1, receiver: user2 },
                { sender: user2, receiver: user1 }
            ]
        }).sort({ timestamp: 1 });
        res.json(messages);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
};


exports.markMessagesAsSeen = async (req, res) => {
    const { user1, user2 } = req.body;
    try {
        await Message.updateMany(
            { sender: user2, receiver: user1, seen: false },
            { $set: { seen: true } }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update messages' });
    }
};
