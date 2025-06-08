const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const mongoose = require('mongoose');
const messageRoutes = require('./router/messageRouter');
const { saveMessage } = require('./controller/messageController');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/', messageRoutes);

mongoose.connect('mongodb+srv://websocket:websocket@hello.etr3n.mongodb.net/', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => {
    console.log('MongoDB connected');
}).catch(err => {
    console.error('MongoDB connection error:', err);
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const clients = {};

wss.on('connection', (ws) => {
    let currentUserId = null;

    ws.on('message', async (message) => {
        try {
            const parsed = JSON.parse(message);

            if (parsed.type === 'seen') {
                const { sender, receiver } = parsed.data;

                // Update all messages from sender to receiver as seen
                await Message.updateMany(
                    { sender, receiver, seen: false },
                    { $set: { seen: true } }
                );

                // Notify the original sender (the other user) if they're online
                if (clients[sender] && clients[sender].readyState === WebSocket.OPEN) {
                    clients[sender].send(JSON.stringify({
                        type: 'seen',
                        data: { sender, receiver }
                    }));
                }
            }

            if (parsed.type === 'identification') {
                currentUserId = parsed.userId;
                clients[currentUserId] = ws;
                return;
            }

            if (parsed.type === 'chat') {
                const { sender, receiver, text, timestamp } = parsed.data;

                // Save message to MongoDB
                await saveMessage({ sender, receiver, text, timestamp });

                // Forward to receiver if online
                if (clients[receiver] && clients[receiver].readyState === WebSocket.OPEN) {
                    clients[receiver].send(JSON.stringify({
                        type: 'chat',
                        data: parsed.data,
                    }));
                }

                // Echo back to sender
                if (currentUserId && clients[currentUserId].readyState === WebSocket.OPEN) {
                    clients[currentUserId].send(JSON.stringify({
                        type: 'chat',
                        data: parsed.data,
                    }));
                }
            }
        } catch (err) {
            console.error('Error handling message:', err);
        }
    });

    ws.on('close', () => {
        if (currentUserId) delete clients[currentUserId];
    });
});

app.get('/', (req, res) => {
    res.send('<h1>WebSocket server is running</h1>');
});

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`Server running on ws://localhost:${PORT}/`);
});
