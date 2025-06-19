// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true,
    },
    firstName: {
        type: String,
        required: true,
        trim: true,
    },
    lastName: {
        type: String,
        required: true,
        trim: true,
    },
    gender: {
        type: String,
        enum: ['Male', 'Female', 'Other'],
    },
    dateOfBirth: {
        type: Date,
    },
    age: {
        type: Number,
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    phoneNumber: {
        type: String,
    },
    passwordHash: {
        type: String,
    },
    profilePhotoUrl: {
        type: String,
        default: null,
    },
    homeAddress: {
        type: String,
    },
    gpsLocation: {
        latitude: {
            type: Number,
        },
        longitude: {
            type: Number,
        },
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
});

// Automatically update `updatedAt` on save
userSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('UserSchema', userSchema);
