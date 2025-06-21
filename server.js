// ✅ Updated server.js with WebRTC signaling fixes
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const mongoose = require('mongoose');
const Message = require('./model/messageModel');
const notificationRouter = require('./router/notificationRouter');
const User = require('./model/UserModel');
const cron = require('node-cron');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect('mongodb+srv://websocket:websocket@hello.etr3n.mongodb.net/', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));

app.use('/api/notification', notificationRouter);

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
                return;
            }

            if (parsed.type === 'seen') {
                const { sender, receiver } = parsed.data;
                await Message.updateMany(
                    { sender, receiver, seen: false },
                    { $set: { seen: true } }
                );
                clients.forEach((clientSocket) => {
                    if (clientSocket.userId === sender && clientSocket.readyState === WebSocket.OPEN) {
                        clientSocket.send(JSON.stringify({
                            type: 'seen',
                            data: { sender: receiver, receiver: sender }
                        }));
                    }
                });
                return;
            }

            if (parsed.type === 'chat') {
                const { sender, receiver, text, timestamp, senderName, receiverName } = parsed.data;
                const newMessage = new Message({
                    sender, receiver, senderName, receiverName, text,
                    timestamp: new Date(timestamp), seen: false
                });
                await newMessage.save();

                const payload = JSON.stringify({
                    type: 'chat',
                    data: {
                        ...parsed.data,
                        id: newMessage._id.toString(),
                        timestamp: newMessage.timestamp.toISOString()
                    }
                });

                clients.forEach((clientSocket) => {
                    if (clientSocket.readyState === WebSocket.OPEN) {
                        if (clientSocket.userId === receiver || clientSocket.userId === sender) {
                            clientSocket.send(payload);
                        }
                    }
                });
                return;
            }

            if (['join-room', 'offer', 'answer', 'ice-candidate'].includes(parsed.type)) {
                const { roomId, payload } = parsed;

                if (parsed.type === 'join-room') {
                    ws.roomId = roomId;
                    console.log(`👤 Client joined room: ${roomId}`);
                    return; // Don't broadcast join-room
                }

                clients.forEach((clientSocket) => {
                    if (
                        clientSocket !== ws &&
                        clientSocket.roomId === roomId &&
                        clientSocket.readyState === WebSocket.OPEN
                    ) {
                        console.log(`🔁 Relaying ${parsed.type} to peer in room ${roomId}`);
                        clientSocket.send(JSON.stringify({ type: parsed.type, payload }));
                    }
                });
                return;
            }
        } catch (err) {
            console.error('Error handling message:', err);
        }
    });

    ws.on('close', () => {
        clients.delete(ws);
        ws.roomId = null;
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