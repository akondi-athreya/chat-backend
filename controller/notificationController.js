const User = require('../model/UserModel');

const setNotificationToken = async (req, res) => {
    const { userId, notificationToken, data, bloodGroup } = req.body;
    try {
        let user = await User.findOne({ userId });
        if (user) {
            user.notificationToken = notificationToken;
            user.bloodGroup = bloodGroup;
            user.updatedAt = Date.now();
            await user.save();
        } else {
            user = new User({ ...data, userId, notificationToken, bloodGroup });
            await user.save();
        }
        res.status(200).json({ message: 'Notification token set successfully', user });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error', error });
    }
};

const getNotificationToken = async (req, res) => {
    const { emailId } = req.body;
    try {
        const user = await User.findOne({ email: emailId });
        console.log(emailId);
        if (!user || !user.notificationToken) {
            return res.status(404).json({ message: 'Notification token not found' });
        }
        res.status(200).json({ notificationToken: user.notificationToken, user });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error', error });
    }
};

module.exports = {
    setNotificationToken,
    getNotificationToken,
};