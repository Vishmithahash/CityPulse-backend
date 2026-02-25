const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Report title is required'],
        trim: true,
        maxlength: [100, 'Title cannot exceed 100 characters']
    },
    description: {
        type: String,
        trim: true,
        maxlength: [500, 'Description cannot exceed 500 characters']
    },
    reportType: {
        type: String,
        required: [true, 'Report type is required'],
        enum: {
            values: [
                'ISSUE_SUMMARY',
                'CATEGORY_ANALYSIS',
                'OFFICER_PERFORMANCE',
                'MONTHLY_TRENDS',
                'GEO_ANALYSIS',
                'PRIORITY_BREAKDOWN'
            ],
            message: 'Invalid report type'
        }
    },
    filters: {
        categories: [String],
        priorities: [String],
        statuses: [String],
        officers: [{
            type: mongoose.Schema.ObjectId,
            ref: 'User'
        }],
        startDate: Date,
        endDate: Date,
        location: {
            lat: Number,
            lng: Number,
            radius: Number // meters
        }
    },
    createdBy: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: [true, 'Creator is required']
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastExecuted: {
        type: Date
    },
    executionCount: {
        type: Number,
        default: 0
    },
    cachedData: {
        data: mongoose.Schema.Types.Mixed,
        expiresAt: Date
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for performance
reportSchema.index({ reportType: 1, isActive: 1 });
reportSchema.index({ createdBy: 1 });
reportSchema.index({ 'filters.startDate': 1, 'filters.endDate': 1 });
reportSchema.index({ lastExecuted: -1 });

module.exports = mongoose.model('Report', reportSchema);