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
const multer = require('multer'); // Import multer
const path = require('path'); // Import path
const fs = require('fs'); // Import fs

const app = express();
app.use(cors());
app.use(express.json());
const notificationController = require('./controller/notificationController');
const notificationSchema = require('./model/NotificationModel');
const userRouter = require('./router/userRouter');

app.use('/api/notification', notificationRouter);
app.use('/api/user', userRouter);
const axios = require('axios');
const { send } = require('process');

// --- Multer Configuration for Audio Uploads ---
const audioUploadDir = path.join(__dirname, 'uploads/audio');
if (!fs.existsSync(audioUploadDir)) {
    fs.mkdirSync(audioUploadDir, { recursive: true });
}

const audioStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, audioUploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    },
});

const uploadAudio = multer({ storage: audioStorage });

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// New endpoint to handle audio uploads
app.post('/upload/audio', uploadAudio.single('audio'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }
    // Make sure to use your server's public URL
    const fileUrl = `https://chat-backend-xsri.onrender.com/uploads/audio/${req.file.filename}`;
    
    res.status(200).json({ url: fileUrl });
});
// --------------------------------------------------


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
        const notificationBody = text ? `${senderName}: ${text}` : 'Sent you a voice message';


        const response = await axios.post('https://exp.host/--/api/v2/push/send', {
            to: receiver.notificationToken,
            title: `New message from ${senderName}`,
            body: notificationBody,
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
                    // Updated to handle both text and audio messages
                    lastMessage: { $first: { $cond: { if: { $eq: ['$messageType', 'audio'] }, then: 'Voice Message', else: '$text' } } },
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
                await Message.updateMany(
                    { sender, receiver, seen: false },
                    { $set: { seen: true } }
                );
                if (clients[sender]?.readyState === WebSocket.OPEN) {
                    clients[sender].send(JSON.stringify({
                        type: 'seen',
                        data: { sender: receiver, receiver: sender }
                    }));
                }
                return;
            }

            if (parsed.type === 'chat') {
                const {
                    sender, receiver, text, timestamp, senderName, receiverName,
                    messageType, fileUrl, duration
                } = parsed.data;

                const newMessage = new Message({
                    sender,
                    receiver,
                    senderName,
                    receiverName,
                    text: text || null,
                    timestamp: new Date(timestamp),
                    seen: false,
                    messageType: messageType || 'text',
                    fileUrl: fileUrl || null,
                    duration: duration || 0
                });

                await newMessage.save();

                const ans = await SendNotification(sender, receiver, text);
                if (ans) console.log('Notification sent successfully');
                else console.log('Failed to send notification');

                // ✅ FIX: The payload now includes the original client 'id' as 'clientId'.
                // This allows the client to find and replace its temporary message.
                const payload = JSON.stringify({
                    type: 'chat',
                    data: {
                        ...parsed.data,
                        clientId: parsed.data.id, // Preserve the original client-generated ID
                        id: newMessage._id.toString(), // The new, permanent database ID
                        timestamp: newMessage.timestamp.toISOString(),
                        messageType: newMessage.messageType,
                        fileUrl: newMessage.fileUrl,
                        duration: newMessage.duration,
                    },
                });

                if (clients[receiver]?.readyState === WebSocket.OPEN) {
                    clients[receiver].send(payload);
                }
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

setTimeout(async () => {
    try {
        const res = await axios.get('https://chat-backend-xsri.onrender.com/');
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}, 30000);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});