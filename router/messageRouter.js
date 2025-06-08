const express = require('express');
const router = express.Router();
const messageController = require('../controller/messageController');

// Route to get chat history between two users
router.get('/history/:user1/:user2', messageController.getChatHistory);
router.post('/seen', messageController.markMessagesAsSeen);


module.exports = router;
