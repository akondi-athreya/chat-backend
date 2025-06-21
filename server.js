// ✅ Final and Complete server.js
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

// --- Database Connection ---
mongoose.connect('mongodb+srv://websocket:websocket@hello.etr3n.mongodb.net/', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => console.log('✅ MongoDB connected'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

app.use('/api/notification', notificationRouter);

// --- HTTP Server and WebSocket Server Setup ---
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Use a Map to store rooms and their clients for efficient management
const rooms = new Map();

wss.on('connection', (ws) => {
    console.log('🔌 New client connected');
    // We assign these properties when the client sends a message
    ws.userId = null;
    ws.roomId = null;

    ws.on('message', async (message) => {
        let parsed;
        try {
            parsed = JSON.parse(message);
        } catch (e) {
            console.error('Error parsing JSON message:', e);
            return;
        }

        const { type, roomId, payload, data } = parsed;

        // --- SECTION 1: Handling Chat, Seen Status, and User Identification ---
        // This logic is preserved from your original file.

        if (type === 'identification') {
            ws.userId = parsed.userId; // Assign userId to the websocket connection
            console.log(`👤 Client identified as user: ${ws.userId}`);
            return;
        }

        if (type === 'seen') {
            const { sender, receiver } = data;
            await Message.updateMany(
                { sender, receiver, seen: false },
                { $set: { seen: true } }
            );
            // Find the sender's websocket to notify them
            wss.clients.forEach((clientSocket) => {
                if (clientSocket.userId === sender && clientSocket.readyState === WebSocket.OPEN) {
                    clientSocket.send(JSON.stringify({
                        type: 'seen',
                        data: { sender: receiver, receiver: sender }
                    }));
                }
            });
            return;
        }

        if (type === 'chat') {
            const { sender, receiver, text, timestamp, senderName, receiverName } = data;
            const newMessage = new Message({
                sender, receiver, senderName, receiverName, text,
                timestamp: new Date(timestamp), seen: false
            });
            await newMessage.save();

            const chatPayload = JSON.stringify({
                type: 'chat',
                data: { ...data, id: newMessage._id.toString(), timestamp: newMessage.timestamp.toISOString() }
            });

            // Send message to both sender and receiver
            wss.clients.forEach((clientSocket) => {
                if (clientSocket.readyState === WebSocket.OPEN && (clientSocket.userId === receiver || clientSocket.userId === sender)) {
                    clientSocket.send(chatPayload);
                }
            });
            return;
        }


        // --- SECTION 2: Robust WebRTC Signaling Logic ---

        switch (type) {
            case 'join-room':
                if (!roomId) return;
                ws.roomId = roomId;

                // Get or create the room
                let room = rooms.get(roomId);
                if (!room) {
                    room = new Set();
                    rooms.set(roomId, room);
                }

                // Add the new client to the room
                room.add(ws);
                console.log(`[Room: ${roomId}] Client joined. Room size is now ${room.size}`);

                // If another peer is already in the room, notify that peer.
                // This is the trigger for the first peer to start the connection.
                if (room.size > 1) {
                     room.forEach(client => {
                        if (client !== ws && client.readyState === WebSocket.OPEN) {
                            console.log(`[Room: ${roomId}] Notifying peer that a new client has joined.`);
                            client.send(JSON.stringify({ type: 'peer-joined' }));
                        }
                    });
                }
                break;

            case 'offer':
            case 'answer':
            case 'ice-candidate':
                // Relay WebRTC messages to the other peer in the same room.
                const targetRoom = rooms.get(roomId);
                if (targetRoom) {
                    targetRoom.forEach(client => {
                        if (client !== ws && client.readyState === WebSocket.OPEN) {
                            console.log(`[Room: ${roomId}] Relaying '${type}' to peer.`);
                            client.send(JSON.stringify({ type, payload }));
                        }
                    });
                }
                break;
        }
    });

    ws.on('close', () => {
        console.log(`🔌 Client disconnected (User: ${ws.userId}, Room: ${ws.roomId})`);
        const { roomId } = ws;

        if (roomId) {
            const room = rooms.get(roomId);
            if (room) {
                room.delete(ws); // Remove the client from the room's Set

                console.log(`[Room: ${roomId}] Client left. Room size is now ${room.size}`);

                // Notify the remaining peer that the other has left the call
                room.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        console.log(`[Room: ${roomId}] Notifying remaining peer that client has left.`);
                        client.send(JSON.stringify({ type: 'peer-left' }));
                    }
                });

                // If the room is now empty, remove it from the Map to free up memory
                if (room.size === 0) {
                    rooms.delete(roomId);
                    console.log(`[Room: ${roomId}] Room is empty and has been removed.`);
                }
            }
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

app.get('/', (req, res) => {
    res.send('<h1>Realtime Voice & Chat Server is Running</h1>');
});

// This is for keeping the server alive on some platforms, it's fine
cron.schedule('*/15 * * * * *', () => {
    async function keepAlive() {
        try {
            const res = await fetch("https://chat-backend-xsri.onrender.com");
        }
        catch (error) {
            console.error('Error during keep-alive:', error);
        }
    }
    keepAlive();
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});