const express = require('express');
const router = express.Router();
const notificationController = require('../controller/notificationController');


router.post('/setNotificationToken', notificationController.setNotificationToken);
router.post('/getNotificationToken', notificationController.getNotificationToken);

router.post('/BloodRequestNotification', notificationController.BloodRequestNotification);

module.exports = router;