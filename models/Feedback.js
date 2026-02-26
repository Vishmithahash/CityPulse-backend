const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
    issue: {
        type: mongoose.Schema.ObjectId,
        ref: 'Issue',
        required: [true, 'Issue reference is required']
    },
    officer: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: [true, 'Officer reference is required']
    },
    citizen: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: [true, 'Citizen reference is required']
    },
    rating: {
        type: Number,
        required: [true, 'Rating is required'],
        min: [1, 'Rating must be at least 1'],
        max: [5, 'Rating cannot exceed 5']
    },
    comment: {
        type: String,
        trim: true,
        maxlength: [1000, 'Comment cannot exceed 1000 characters']
    },
    isAnonymous: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    helpfulVotes: {
        type: Number,
        default: 0
    },
    replies: [{
        text: {
            type: String,
            required: true,
            maxlength: [500, 'Reply cannot exceed 500 characters']
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

// Virtual for issue details
feedbackSchema.virtual('issueDetails', {
    ref: 'Issue',
    localField: 'issue',
    foreignField: '_id',
    justOne: true
});

// Virtual for average officer rating
feedbackSchema.statics.getOfficerAverageRating = async function (officerId) {
    const stats = await this.aggregate([
        { $match: { officer: officerId, status: 'approved' } },
        { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);
    return stats[0] || { avgRating: 0, count: 0 };
};

// Indexes for performance
feedbackSchema.index({ officer: 1, status: 1, createdAt: -1 });
feedbackSchema.index({ issue: 1 });
feedbackSchema.index({ citizen: 1, issue: 1 }, { unique: true }); // One feedback per citizen per issue
feedbackSchema.index({ rating: 1 });
feedbackSchema.index({ status: 1, helpfulVotes: -1 });

module.exports = mongoose.model('Feedback', feedbackSchema);
