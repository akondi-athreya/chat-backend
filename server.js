// ✅ Fixed server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const mongoose = require('mongoose');
const Message = require('./model/messageModel');
const notificationRouter = require('./router/notificationRouter');
const User = require('./model/UserModel');
const cron = require('node-cron');

const app = express();
app.use(cors());
app.use(express.json());
const notificationController = require('./controller/notificationController');
const notificationSchema = require('./model/NotificationModel');

app.use('/api/notification', notificationRouter);
const axios = require('axios');
const { send } = require('process');

mongoose.connect('mongodb+srv://websocket:websocket@hello.etr3n.mongodb.net/', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => {
    console.log('MongoDB connected');
}).catch(err => {
    console.error('MongoDB connection error:', err);
});

const SendNotification = async (senderId, receiverId, text) => {
    try {
        const receiver = await User.findOne({ userId: receiverId });
        if (!receiver || !receiver.notificationToken) {
            console.log('No notification token for receiver');
            return;
        }
        const sender = await User.findOne({ userId: senderId });
        const senderName = sender ? `${sender.firstName} ${sender.lastName}` : senderId;

        const response = await axios.post('https://exp.host/--/api/v2/push/send', {
            to: receiver.notificationToken,
            title: `New message from ${senderName}`,
            body: `${senderName}: ${text}`,
            data: { senderId, text },
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
        const messages = await Message.aggregate([
            {
                $match: {
                    $or: [
                        { sender: userId },
                        { receiver: userId }
                    ]
                }
            },
            { $sort: { timestamp: -1 } },
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
            }
        ]);

        // Fetch user names for each chat
        const userIds = messages.map(chat => chat._id);
        const users = await User.find({ userId: { $in: userIds } });
        const userMap = {};
        users.forEach(u => {
            userMap[u.userId] = `${u.firstName} ${u.lastName}`;
        });

        const chats = messages.map(chat => ({
            id: chat._id,
            userId: chat._id,
            name: userMap[chat._id] || chat._id,
            avatar: 'https://i.pravatar.cc/150?u=' + chat._id,
            lastMessage: chat.lastMessage,
            time: chat.lastTimestamp,
            unseenCount: chat.unseenCount,
            seen: chat.lastMessageSender === userId ? chat.lastMessageSeen : true
        }));

        res.json(chats);
    } catch (err) {
        res.status(500).json({ error: 'Error fetching chats' });
    }
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const clients = new Set();

wss.on('connection', (ws) => {
    let currentUserId = null;
    clients.add(ws);

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
                const { sender, receiver, text, timestamp, senderName, receiverName } = parsed.data;

                const newMessage = new Message({
                    sender,
                    receiver,
                    senderName,      // <-- Save senderName
                    receiverName,    // <-- Save receiverName
                    text,
                    timestamp: new Date(timestamp),
                    seen: false
                });

                await newMessage.save();

                const ans = await SendNotification(sender, receiver, text);
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

            if (['join-room', 'offer', 'answer', 'ice-candidate'].includes(parsed.type)) {
                const { roomId, payload } = parsed;

                // Attach user to room
                if (parsed.type === 'join-room') {
                    ws.roomId = roomId;
                    console.log(`👤 Client joined room: ${roomId}`);
                }

                // Relay to all other users in the room (except sender)
                clients.forEach((clientSocket) => {
                    if (
                        clientSocket !== ws &&
                        clientSocket.roomId === roomId &&
                        clientSocket.readyState === WebSocket.OPEN
                    ) {
                        console.log(`🔁 Relaying ${parsed.type} to peer in room ${roomId}`);
                        clientSocket.send(JSON.stringify({
                            type: parsed.type,
                            payload
                        }));
                    }
                });

                return;
            }

        } catch (err) {
            console.error('Error handling message:', err);
        }
    });

    ws.on('close', () => {
        if (currentUserId) {
            delete clients[currentUserId];
            clients.delete(ws);
            ws.roomId = null;
        }
    });
});

app.get('/', (req, res) => {
    res.send('<h1>WebSocket Chat Server</h1>');
});


cron.schedule('*/15 * * * * *', () => {
    console.log('hi');
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});