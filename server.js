// ✅ Fixed server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const mongoose = require('mongoose');
const Message = require('./model/messageModel');
const notificationRouter = require('./router/notificationRouter');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/notification', notificationRouter);
const axios = require('axios');

mongoose.connect('mongodb+srv://websocket:websocket@hello.etr3n.mongodb.net/', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => {
    console.log('MongoDB connected');
}).catch(err => {
    console.error('MongoDB connection error:', err);
});

const SendNotification = async (notificationToken, sender, text) => {
    try {
        const response = await axios.post('https://exp.host/--/api/v2/push/send', {
            to: notificationToken,
            title: 'New Message',
            body: `${sender}: ${text}`,
            data: { sender, text },
            sound: 'default',
        }, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            }
        });

        if (response.status !== 200) {
            throw new Error(`Error sending notification: ${response.statusText}`);
        }

        console.log('Notification sent:', response.data);
    } catch (error) {
        console.error('Error sending notification:', error);
    }
};

// Get chat history between two users
app.get('/history/:sender/:receiver', async (req, res) => {
    try {
        const messages = await Message.find({
            $or: [
                { sender: req.params.sender, receiver: req.params.receiver },
                { sender: req.params.receiver, receiver: req.params.sender }
            ]
        }).sort({ timestamp: 1 });
        res.json(messages);
    } catch (err) {
        console.error('Error fetching history:', err);
        res.status(500).json({ error: 'Error fetching history' });
    }
});

// Get all chats for a user (for chat list)
app.get('/chats/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;

        // Get all messages where user is sender or receiver
        const messages = await Message.aggregate([
            {
                $match: {
                    $or: [
                        { sender: userId },
                        { receiver: userId }
                    ]
                }
            },
            {
                $sort: { timestamp: -1 }
            },
            {
                $group: {
                    _id: {
                        $cond: [
                            { $eq: ['$sender', userId] },
                            '$receiver',
                            '$sender'
                        ]
                    },
                    lastMessage: { $first: '$text' },
                    lastTimestamp: { $first: '$timestamp' },
                    unseenCount: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ['$receiver', userId] },
                                        { $eq: ['$seen', false] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    },
                    lastMessageSeen: { $first: '$seen' },
                    lastMessageSender: { $first: '$sender' }
                }
            },
            {
                $project: {
                    userId: '$_id',
                    name: '$_id',
                    lastMessage: 1,
                    time: '$lastTimestamp',
                    unseenCount: 1,
                    seen: {
                        $cond: [
                            { $eq: ['$lastMessageSender', userId] },
                            '$lastMessageSeen',
                            true
                        ]
                    }
                }
            }
        ]);

        const chats = messages.map(chat => ({
            id: chat.userId,
            userId: chat.userId,
            name: chat.name,
            avatar: 'https://i.pravatar.cc/150?u=' + chat.userId,
            lastMessage: chat.lastMessage,
            time: chat.time,
            unseenCount: chat.unseenCount,
            seen: chat.seen
        }));

        res.json(chats);
    } catch (err) {
        console.error('Error fetching chats:', err);
        res.status(500).json({ error: 'Error fetching chats' });
    }
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const clients = {};

wss.on('connection', (ws) => {
    let currentUserId = null;

    ws.on('message', async (message) => {
        try {
            const parsed = JSON.parse(message);

            if (parsed.type === 'identification') {
                currentUserId = parsed.userId;
                clients[currentUserId] = ws;
                return;
            }

            if (parsed.type === 'seen') {
                const { sender, receiver } = parsed.data;

                // Mark messages as seen in database
                await Message.updateMany(
                    { sender, receiver, seen: false },
                    { $set: { seen: true } }
                );

                // Send seen confirmation to sender
                if (clients[sender]?.readyState === WebSocket.OPEN) {
                    clients[sender].send(JSON.stringify({
                        type: 'seen',
                        data: { sender: receiver, receiver: sender }
                    }));
                }

                return;
            }

            if (parsed.type === 'chat') {
                const { sender, receiver, text, timestamp, notificationToken } = parsed.data;
                console.log('notificationToken: ', notificationToken);

                const newMessage = new Message({
                    sender,
                    receiver,
                    text,
                    timestamp: new Date(timestamp),
                    seen: false
                });

                await newMessage.save();

                const ans = await SendNotification(notificationToken, sender, text);
                if (ans) {
                    console.log('Notification sent successfully');
                }
                else {
                    console.log('Failed to send notification');
                }

                const payload = JSON.stringify({
                    type: 'chat',
                    data: {
                        ...parsed.data,
                        id: newMessage._id.toString(),
                        timestamp: newMessage.timestamp.toISOString()
                    },
                });

                // Send to receiver
                if (clients[receiver]?.readyState === WebSocket.OPEN) {
                    clients[receiver].send(payload);
                }

                // Send back to sender (for confirmation)
                if (clients[sender]?.readyState === WebSocket.OPEN) {
                    clients[sender].send(payload);
                }
            }
        } catch (err) {
            console.error('Error handling message:', err);
        }
    });

    ws.on('close', () => {
        if (currentUserId) {
            delete clients[currentUserId];
        }
    });
});

app.get('/', (req, res) => {
    res.send('<h1>WebSocket Chat Server</h1>');
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});