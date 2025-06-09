const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const mongoose = require('mongoose');
const Message = require('./models/Message');

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

// Get chat history
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

// Save message
app.post('/messages', async (req, res) => {
    try {
        const { sender, receiver, text } = req.body;
        const message = new Message({
            sender,
            receiver,
            text,
            timestamp: new Date(),
            seen: false
        });
        await message.save();
        res.status(201).json(message);
    } catch (err) {
        console.error('Error saving message:', err);
        res.status(500).json({ error: 'Error saving message' });
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

                // Update messages as seen in database
                await Message.updateMany(
                    { sender, receiver, seen: false },
                    { $set: { seen: true } }
                );

                // Notify the sender that messages were seen
                if (clients[sender] && clients[sender].readyState === WebSocket.OPEN) {
                    clients[sender].send(JSON.stringify({
                        type: 'seen',
                        data: { sender, receiver }
                    }));
                }
                
                // Also notify the receiver to update their UI
                if (clients[receiver] && clients[receiver].readyState === WebSocket.OPEN) {
                    clients[receiver].send(JSON.stringify({
                        type: 'seen',
                        data: { sender, receiver }
                    }));
                }
                return;
            }

            if (parsed.type === 'chat') {
                const { sender, receiver, text, timestamp } = parsed.data;

                // Save message to database
                const newMessage = new Message({
                    sender,
                    receiver,
                    text,
                    timestamp: new Date(timestamp),
                    seen: false
                });
                await newMessage.save();

                // Forward to receiver if online
                if (clients[receiver] && clients[receiver].readyState === WebSocket.OPEN) {
                    clients[receiver].send(JSON.stringify({
                        type: 'chat',
                        data: {
                            ...parsed.data,
                            id: newMessage._id.toString(),
                            timestamp: newMessage.timestamp.toISOString()
                        },
                    }));
                }

                // Echo back to sender with the database ID
                if (currentUserId && clients[currentUserId]?.readyState === WebSocket.OPEN) {
                    clients[currentUserId].send(JSON.stringify({
                        type: 'chat',
                        data: {
                            ...parsed.data,
                            id: newMessage._id.toString(),
                            timestamp: newMessage.timestamp.toISOString()
                        },
                    }));
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