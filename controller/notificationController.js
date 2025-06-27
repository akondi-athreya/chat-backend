const User = require('../model/UserModel');
const axios = require('axios');

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


const BloodRequestNotification = async (req, res) => {
    try {
        const { senderId, bloodGroup, location } = req.body;

        const userData = await User.findOne({ userId: senderId });

        const receivers = await User.aggregate([
            {
                $match: {
                    userId: {
                        $ne: senderId
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    notificationTokens: {
                        $push: "$notificationToken"
                    }
                }
            },
            { $project: { _id: 0, notificationTokens: 1 } }
        ])
        console.log(receivers);
        receivers[0]?.notificationTokens?.map(async (item, index) => {
            const response = await axios.post('https://exp.host/--/api/v2/push/send', {
                to: item,
                title: `New Blood Request For ${bloodGroup}`,
                body: `${bloodGroup} blood is required at ${location}. Please contact ${userData.senderName} at ${userData.senderPhoneNumber} for more details.`,
                sound: 'default',
                badge: 1,
            }, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                }
            });
        })
        return res.status(200).json({  message: 'Notification sent successfully'});
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal server error', error });
    }
}

module.exports = {
    setNotificationToken,
    getNotificationToken,
    BloodRequestNotification
};