const express = require('express');
const router = express.Router();
const UserController = require('../controller/UserController');

router.get('/getAllUsers', UserController.GetAllUsers);

module.exports = router;