// ✅ COMPLETE & UNIFIED server.js with Chat, Notifications, and Audio Messages
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Message = require('./model/messageModel');
const notificationRouter = require('./router/notificationRouter');
const User = require('./model/UserModel');

// --- Basic Setup ---
const app = express();
app.use(cors());
app.use(express.json());

// --- Database Connection ---
mongoose.connect('mongodb+srv://websocket:websocket@hello.etr3n.mongodb.net/', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => console.log('✅ MongoDB connected'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

// --- API Routers ---
app.use('/api/notification', notificationRouter);


// --- File Upload Setup (for Audio Messages) ---
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}
app.use('/uploads', express.static(uploadsDir)); // Make files publicly accessible

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'audio-' + uniqueSuffix + path.extname(file.originalname) || '.m4a');
    }
});
const upload = multer({ storage: storage });

app.post('/upload-audio', upload.single('audio'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    console.log(`🔊 Audio file uploaded. Accessible at: ${fileUrl}`);
    res.json({ url: fileUrl });
});


// --- WebSocket Server Setup ---
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Use a Map to store clients by their userId for easy targeting
const clients = new Map();

wss.on('connection', (ws) => {
    console.log('🔌 New client connected. Waiting for identification...');

    ws.on('message', async (message) => {
        let parsed;
        try {
            parsed = JSON.parse(message);
        } catch (e) {
            console.log('Invalid JSON received', message);
            return;
        }

        const { type, data } = parsed;

        // --- WebSocket Message Routing ---
        switch (type) {
            // Case 1: A user identifies themselves
            case 'identification':
                const userId = parsed.userId;
                ws.userId = userId; // Attach userId to the WebSocket connection object
                clients.set(userId, ws); // Store the connection by userId
                console.log(`👤 Client identified as user: ${userId}`);
                break;

            // Case 2: Handling real-time chat messages
            case 'chat':
                const { sender, receiver, text, timestamp, senderName, receiverName } = data;
                const newMessage = new Message({
                    sender, receiver, senderName, receiverName, text,
                    timestamp: new Date(timestamp), seen: false
                });
                await newMessage.save();

                const payload = JSON.stringify({
                    type: 'chat',
                    data: { ...data, id: newMessage._id.toString(), timestamp: newMessage.timestamp.toISOString() }
                });

                // Send to receiver if they are online
                const receiverSocket = clients.get(receiver);
                if (receiverSocket && receiverSocket.readyState === WebSocket.OPEN) {
                    receiverSocket.send(payload);
                }
                // Send back to sender for confirmation
                const senderSocket = clients.get(sender);
                if (senderSocket && senderSocket.readyState === WebSocket.OPEN) {
                    senderSocket.send(payload);
                }
                break;
            
            // Case 3: Handling the new audio message type
            case 'audio-message':
                const { sender: audioSender, receiver: audioReceiver, url } = data;
                console.log(`📢 Relaying audio message from ${audioSender} to ${audioReceiver}`);

                const audioPayload = JSON.stringify({ type: 'audio-message', data });
                
                // Send to receiver if they are online
                const audioReceiverSocket = clients.get(audioReceiver);
                if (audioReceiverSocket && audioReceiverSocket.readyState === WebSocket.OPEN) {
                    audioReceiverSocket.send(audioPayload);
                }
                break;

            // Case 4: Handling seen status updates
            case 'seen':
                const { sender: seenSender, receiver: seenReceiver } = data;
                await Message.updateMany(
                    { sender: seenSender, receiver: seenReceiver, seen: false },
                    { $set: { seen: true } }
                );
                
                // Notify the original sender that their messages have been seen
                const originalSenderSocket = clients.get(seenSender);
                if (originalSenderSocket && originalSenderSocket.readyState === WebSocket.OPEN) {
                    originalSenderSocket.send(JSON.stringify({
                        type: 'seen',
                        data: { sender: seenReceiver, receiver: seenSender }
                    }));
                }
                break;
        }
    });

    ws.on('close', () => {
        // When a client disconnects, remove them from the Map
        if (ws.userId) {
            clients.delete(ws.userId);
            console.log(`🔌 Client disconnected: ${ws.userId}`);
        } else {
            console.log('🔌 Unidentified client disconnected');
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

app.get('/', (req, res) => {
    res.send('<h1>✅ Unified Chat and Audio Server is Running</h1>');
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});