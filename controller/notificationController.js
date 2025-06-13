const notificationSchema = require('../model/NotificationModel');

const setNotificationToken = async (req, res) => {
    const { userId, notificationToken } = req.body;

    try {
        // Check if the notification token already exists for the user
        let notification = await notificationSchema.findOne({ userId });
        if (notification) {
            // Update the existing notification token
            notification.notificationToken = notificationToken;
            notification.updatedAt = Date.now();
        } else {
            // Create a new notification token
            notification = new notificationSchema({
                userId,
                notificationToken
            });
        }
        await notification.save();
        console.log('Notification token set successfully:', notification);
        res.status(200).json({ message: 'Notification token set successfully', notification });
    }
    catch (error) {
        console.error('Error setting notification token:', error);
        res.status(500).json({ message: 'Internal server error', error });
    }
}
const getNotificationToken = async (req, res) => {
    const { userId } = req.body;

    try {
        const notification = await notificationSchema.findOne({ userId });
        if (!notification) {
            return res.status(404).json({ message: 'Notification token not found' });
        }
        res.status(200).json({ notificationToken: notification.notificationToken });
    }
    catch (error) {
        console.error('Error getting notification token:', error);
        res.status(500).json({ message: 'Internal server error', error });
    }
}

const herenotification = async (userId) => {
    return await notificationSchema.findOne({ userId });
}
module.exports = {
    setNotificationToken,
    getNotificationToken,
    herenotification
};