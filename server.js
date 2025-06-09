// ✅ Updated server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const mongoose = require('mongoose');
const Message = require('./model/messageModel');

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect('mongodb+srv://websocket:websocket@hello.etr3n.mongodb.net/', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => {
    console.log('MongoDB connected');
}).catch(err => {
    console.error('MongoDB connection error:', err);
});

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
                        data: { sender, receiver }
                    }));
                }

                if (clients[receiver]?.readyState === WebSocket.OPEN) {
                    clients[receiver].send(JSON.stringify({
                        type: 'seen',
                        data: { sender, receiver }
                    }));
                }

                return;
            }

            if (parsed.type === 'chat') {
                const { sender, receiver, text, timestamp } = parsed.data;

                const newMessage = new Message({
                    sender,
                    receiver,
                    text,
                    timestamp: new Date(timestamp),
                    seen: false
                });

                await newMessage.save();
                const payload = JSON.stringify({
                    type: 'chat',
                    data: {
                        ...parsed.data,
                        id: newMessage._id.toString(),
                        timestamp: newMessage.timestamp.toISOString()
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

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});