const mongoose = require('mongoose');

const issueSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Title is required'],
        trim: true,
        maxlength: [100, 'Title cannot exceed 100 characters']
    },
    description: {
        type: String,
        required: [true, 'Description is required'],
        trim: true,
        maxlength: [1000, 'Description cannot exceed 1000 characters']
    },
    category: {
        type: String,
        required: [true, 'Category is required'],
        enum: {
            values: ['road', 'water', 'electricity', 'waste', 'streetlight', 'drainage'],
            message: 'Invalid category'
        }
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    location: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number], // [longitude, latitude]
            required: [true, 'Location coordinates are required'],
            index: '2dsphere'
        },
        address: String // Human readable address
    },
    images: [{
        url: {
            type: String,
            required: true
        },
        publicId: String // Cloudinary public ID for deletion
    }],
    status: {
        type: String,
        enum: ['open', 'assigned', 'in-progress', 'resolved', 'closed'],
        default: 'open'
    },
    reportedBy: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
    assignedTo: {
        type: mongoose.Schema.ObjectId,
        ref: 'User' // Officer
    },
    resolutionTime: {
        type: Number, // Hours
        default: null
    },
    comments: [{
        text: {
            type: String,
            required: true
        },
        user: {
            type: mongoose.Schema.ObjectId,
            ref: 'User'
        },
        timestamp: {
            type: Date,
            default: Date.now
        }
    }]
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for formatted location
issueSchema.virtual('formattedLocation').get(function () {
    if (this.location && this.location.coordinates) {
        return `${this.location.coordinates[1].toFixed(4)}, ${this.location.coordinates[0].toFixed(4)}`;
    }
    return null;
});

// Index for efficient queries
issueSchema.index({ status: 1 });
issueSchema.index({ category: 1 });
issueSchema.index({ priority: 1, status: 1 });
issueSchema.index({ location: '2dsphere' });
issueSchema.index({ createdAt: -1 });

// Notification Triggers
issueSchema.post('save', async function (doc) {
    const NotificationService = require('../services/notificationService');
    const User = mongoose.model('User');

    // 1. New Issue Created -> Notify all admins
    if (doc.createdAt.getTime() === doc.updatedAt.getTime()) {
        const admins = await User.find({ role: 'admin' });
        admins.forEach(async (admin) => {
            await NotificationService.createNotification(
                admin._id,
                'ISSUE_CREATED',
                `New Issue: ${doc.title}`,
                `Citizen reported: ${doc.description.substring(0, 100)}...`,
                { issueId: doc._id, url: `/issues/${doc._id}` }
            );
        });
    }

    // 2. Status Changed Triggers
    // Note: To precisely track status change in post-save, we can check if it's new or was recently modified
    // Simplified version based on business rules:
    if (doc.status === 'assigned' && doc.assignedTo) {
        // Notify officer
        await NotificationService.createNotification(
            doc.assignedTo,
            'ISSUE_ASSIGNED',
            'New Assignment',
            `Issue "${doc.title}" has been assigned to you`,
            { issueId: doc._id }
        );

        // Notify citizen
        await NotificationService.createNotification(
            doc.reportedBy,
            'ISSUE_ASSIGNED',
            'Issue Assigned',
            `Your issue "${doc.title}" has been assigned to an officer`,
            { issueId: doc._id }
        );
    }

    if (doc.status === 'resolved') {
        await NotificationService.createNotification(
            doc.reportedBy,
            'ISSUE_RESOLVED',
            'Issue Resolved!',
            `Your issue "${doc.title}" has been resolved. Please provide your feedback.`,
            { issueId: doc._id }
        );
    }
});

module.exports = mongoose.model('Issue', issueSchema);
