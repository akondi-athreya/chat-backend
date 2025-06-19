const notificationSchema = require('../model/NotificationModel');
const userSchema = require('../model/UserModel');

const setNotificationToken = async (req, res) => {
    const { userId, emailId, notificationToken, data } = req.body;

    try {
        // Check if the notification token already exists for the user
        let notification = await notificationSchema.findOne({ emailId });
        if (notification) {
            // Update the existing notification token
            notification.notificationToken = notificationToken;
            notification.updatedAt = Date.now();

        } else {
            // Create a new notification token
            notification = new notificationSchema({
                userId,
                emailId,
                notificationToken
            });
        }
        await notification.save();
        const existingUser = await userSchema.findOne({
            $or: [{ userId: data.userId }, { email: data.email }]
        });

        if (!existingUser) {
            const newUser = new userSchema(data);
            await newUser.save();
        }

        console.log('Notification token set successfully:', notification);
        res.status(200).json({ message: 'Notification token set successfully', notification });
    }
    catch (error) {
        console.error('Error setting notification token:', error);
        res.status(500).json({ message: 'Internal server error', error });
    }
}
const getNotificationToken = async (req, res) => {
    console.log(req.body);
    const { emailId } = req.body;

    try {
        const notification = await notificationSchema.findOne({ emailId });
        if (!notification) {
            return res.status(404).json({ message: 'Notification token not found' });
        }
        console.log(notification);
        return res.status(200).json({ notification });
    }
    catch (error) {
        console.error('Error getting notification token:', error);
        return res.status(500).json({ message: 'Internal server error', error });
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