const express = require('express');
const router = express.Router();
const notificationController = require('../controller/notificationController');


router.post('/setNotificationToken', notificationController.setNotificationToken);
router.get('/getNotificationToken/:emailId', notificationController.getNotificationToken);

module.exports = router;