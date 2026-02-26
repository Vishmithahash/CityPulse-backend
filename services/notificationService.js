const Notification = require('../models/Notification');
const socket = require('../socket');

class NotificationService {
    static async createNotification(recipientId, type, title, message, data = {}) {
        try {
            const notification = await Notification.create({
                recipient: recipientId,
                type,
                title,
                message,
                data,
                channel: data.channel || ['web']
            });

            // Real-time socket notification
            const io = socket.getIO();
            io.to(`user_${recipientId}`).emit('newNotification', notification);

            // Note: Email/SMS queuing would be added here

            return notification;
        } catch (error) {
            console.error('Notification Error:', error);
        }
    }

    static async markAsRead(notificationId, userId) {
        return Notification.findOneAndUpdate(
            { _id: notificationId, recipient: userId },
            { isRead: true },
            { new: true }
        );
    }

    static async markAllAsRead(userId) {
        return Notification.updateMany(
            { recipient: userId, isRead: false },
            { isRead: true }
        );
    }
}

module.exports = NotificationService;
