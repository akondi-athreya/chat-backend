const UserSchema = require('../model/UserModel');

const GetAllUsers = async (req, res) => {
    try {
        const users = await UserSchema.find({}, '-passwordHash'); // Exclude passwordHash from the response
        return res.status(200).json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = {
    GetAllUsers,
};