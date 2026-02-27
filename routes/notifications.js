const express = require('express');
const router = express.Router();
const {
    getNotifications,
    markAsRead,
    markAllRead,
    deleteNotification,
    getUnreadCount
} = require('../controllers/notificationController');
const protect = require('../middleware/auth');

router.use(protect);

router.get('/', getNotifications);
router.get('/count', getUnreadCount);
router.post('/bulk-read', markAllRead);
router.patch('/:id/read', markAsRead);
router.delete('/:id', deleteNotification);

module.exports = router;
