const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
    issue: {
        type: mongoose.Schema.ObjectId,
        ref: 'Issue',
        required: [true, 'Issue reference is required']
    },
    assignedTo: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: [true, 'Officer assignment is required']
    },
    assignedBy: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: [true, 'Admin who assigned is required']
    },
    status: {
        type: String,
        enum: ['active', 'accepted', 'completed', 'reassigned', 'cancelled'],
        default: 'active'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        required: true
    },
    deadline: {
        type: Date
    },
    notes: {
        type: String,
        trim: true,
        maxlength: [500, 'Notes cannot exceed 500 characters']
    },
    estimatedTime: {
        type: Number // Hours
    },
    history: [{
        action: {
            type: String,
            enum: ['assigned', 'accepted', 'reassigned', 'completed']
        },
        officer: {
            type: mongoose.Schema.ObjectId,
            ref: 'User'
        },
        admin: {
            type: mongoose.Schema.ObjectId,
            ref: 'User'
        },
        notes: String,
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

// Virtual for issue details
assignmentSchema.virtual('issueDetails', {
    ref: 'Issue',
    localField: 'issue',
    foreignField: '_id',
    justOne: true
});

// Virtual for officer details
assignmentSchema.virtual('officerDetails', {
    ref: 'User',
    localField: 'assignedTo',
    foreignField: '_id',
    justOne: true
});

// Compound indexes for efficient queries
assignmentSchema.index({ status: 1, assignedTo: 1 });
assignmentSchema.index({ issue: 1 });
assignmentSchema.index({ assignedTo: 1, status: 1, createdAt: -1 });
assignmentSchema.index({ assignedBy: 1 });

module.exports = mongoose.model('Assignment', assignmentSchema);
