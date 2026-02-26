const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    recipient: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: [true, 'Recipient is required']
    },
    type: {
        type: String,
        required: [true, 'Notification type is required'],
        enum: [
            'ISSUE_CREATED', 'ISSUE_ASSIGNED', 'ISSUE_RESOLVED',
            'ASSIGNMENT_ACCEPTED', 'ASSIGNMENT_REASSIGNED',
            'FEEDBACK_RECEIVED', 'FEEDBACK_APPROVED',
            'REPORT_GENERATED', 'SYSTEM_ALERT'
        ]
    },
    title: {
        type: String,
        required: true,
        maxlength: 100
    },
    message: {
        type: String,
        required: true,
        maxlength: 500
    },
    data: {
        issueId: mongoose.Schema.ObjectId,
        assignmentId: mongoose.Schema.ObjectId,
        feedbackId: mongoose.Schema.ObjectId,
        reportId: mongoose.Schema.ObjectId,
        url: String // Deep link for mobile
    },
    source: {
        type: mongoose.Schema.ObjectId,
        ref: 'User', // Who triggered (optional)
        required: false
    },
    related: {
        issue: mongoose.Schema.ObjectId,
        assignment: mongoose.Schema.ObjectId,
        feedback: mongoose.Schema.ObjectId
    },
    channel: {
        type: [String],
        enum: ['web', 'mobile', 'email', 'sms'],
        default: ['web']
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    isRead: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Indexes
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ type: 1 });
notificationSchema.index({ priority: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, priority: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
