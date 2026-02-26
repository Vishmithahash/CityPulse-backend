const Feedback = require('../models/Feedback');
const Issue = require('../models/Issue');
const User = require('../models/User');
const mongoose = require('mongoose');
const NotificationService = require('../services/notificationService');

// @desc    Submit feedback
// @route   POST /api/feedback/:issueId
// @access  Private/Citizen
const createFeedback = async (req, res) => {
    try {
        const { rating, comment, isAnonymous } = req.body;
        const { issueId } = req.params;

        // 1. Check if issue exists and is resolved
        const issue = await Issue.findById(issueId);
        if (!issue) {
            return res.status(404).json({ message: 'Issue not found' });
        }

        if (issue.status !== 'resolved' && issue.status !== 'closed') {
            return res.status(400).json({ message: 'Feedback can only be submitted for resolved or closed issues' });
        }

        // 2. Verify ownership
        if (issue.reportedBy.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Only the citizen who reported the issue can provide feedback' });
        }

        // 3. Check for dedicated officer
        if (!issue.assignedTo) {
            return res.status(400).json({ message: 'No officer was assigned to this issue' });
        }

        const feedback = new Feedback({
            issue: issueId,
            officer: issue.assignedTo,
            citizen: req.user._id,
            rating,
            comment,
            isAnonymous: isAnonymous || false
        });

        await feedback.save();

        // Notify officer immediately
        await NotificationService.createNotification(
            feedback.officer,
            'FEEDBACK_RECEIVED',
            'New Feedback Received',
            `A citizen has rated your work ${feedback.rating}/5 stars`,
            { feedbackId: feedback._id, issueId: feedback.issue }
        );

        res.status(201).json(feedback);
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ message: 'You have already submitted feedback for this issue' });
        }
        res.status(400).json({ message: error.message });
    }
};

// @desc    Get my feedback history
// @route   GET /api/feedback/me
// @access  Private
const getMyFeedback = async (req, res) => {
    try {
        let query = {};
        if (req.user.role === 'citizen') {
            query.citizen = req.user._id;
        } else if (req.user.role === 'officer') {
            query.officer = req.user._id;
            query.status = 'approved'; // Officers only see approved feedback
        }

        const feedbacks = await Feedback.find(query)
            .populate('issue', 'title category status')
            .populate('citizen', 'name')
            .sort({ createdAt: -1 });

        res.json(feedbacks);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get single feedback details
// @route   GET /api/feedback/:id
// @access  Private
const getFeedbackById = async (req, res) => {
    try {
        const feedback = await Feedback.findById(req.params.id)
            .populate('issue')
            .populate('officer', 'name email role')
            .populate('citizen', 'name')
            .populate('replies.user', 'name role');

        if (!feedback) {
            return res.status(404).json({ message: 'Feedback not found' });
        }

        res.json(feedback);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update feedback (Citizen - before approval)
// @route   PUT /api/feedback/:id
// @access  Private/Citizen
const updateFeedback = async (req, res) => {
    try {
        const feedback = await Feedback.findById(req.params.id);

        if (!feedback) return res.status(404).json({ message: 'Feedback not found' });

        if (feedback.citizen.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        if (feedback.status === 'approved') {
            return res.status(400).json({ message: 'Cannot update feedback once it has been approved' });
        }

        feedback.rating = req.body.rating || feedback.rating;
        feedback.comment = req.body.comment || feedback.comment;
        feedback.isAnonymous = req.body.isAnonymous !== undefined ? req.body.isAnonymous : feedback.isAnonymous;

        const updatedFeedback = await feedback.save();
        res.json(updatedFeedback);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Delete feedback
// @route   DELETE /api/feedback/:id
// @access  Private/Admin, Citizen (own)
const deleteFeedback = async (req, res) => {
    try {
        const feedback = await Feedback.findById(req.params.id);
        if (!feedback) return res.status(404).json({ message: 'Feedback not found' });

        if (req.user.role !== 'admin' && feedback.citizen.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        await feedback.deleteOne();
        res.json({ message: 'Feedback removed' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Approve feedback
// @route   PATCH /api/feedback/:id/approve
// @access  Private/Admin
const approveFeedback = async (req, res) => {
    try {
        const feedback = await Feedback.findById(req.params.id);
        if (!feedback) return res.status(404).json({ message: 'Feedback not found' });

        feedback.status = 'approved';
        await feedback.save();

        // Update officer rating stats
        const stats = await Feedback.getOfficerAverageRating(feedback.officer);
        await User.findByIdAndUpdate(feedback.officer, {
            avgRating: stats.avgRating,
            feedbackCount: stats.count
        });

        // Notify citizen that their feedback was approved
        await NotificationService.createNotification(
            feedback.citizen,
            'FEEDBACK_APPROVED',
            'Feedback Approved',
            'Your feedback has been reviewed and approved by an admin.',
            { feedbackId: feedback._id }
        );

        res.json(feedback);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Reject feedback
// @route   PATCH /api/feedback/:id/reject
// @access  Private/Admin
const rejectFeedback = async (req, res) => {
    try {
        const feedback = await Feedback.findById(req.params.id);
        if (!feedback) return res.status(404).json({ message: 'Feedback not found' });

        feedback.status = 'rejected';
        await feedback.save();
        res.json(feedback);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Add reply
// @route   POST /api/feedback/:id/reply
// @access  Private/Officer, Admin
const addReply = async (req, res) => {
    try {
        const feedback = await Feedback.findById(req.params.id);
        if (!feedback) return res.status(404).json({ message: 'Feedback not found' });

        // Only assigned officer or admin can reply
        if (req.user.role !== 'admin' && feedback.officer.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized to reply to this feedback' });
        }

        feedback.replies.push({
            text: req.body.text,
            user: req.user._id
        });

        await feedback.save();

        // Notify citizen about the reply
        await NotificationService.createNotification(
            feedback.citizen,
            'SYSTEM_ALERT',
            'New Reply to Your Feedback',
            `An ${req.user.role} has replied to your feedback.`,
            { feedbackId: feedback._id }
        );

        res.status(201).json(feedback);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Get officer feedback stats
// @route   GET /api/feedback/officer/:id/stats
// @access  Private
const getOfficerStats = async (req, res) => {
    try {
        const stats = await Feedback.getOfficerAverageRating(new mongoose.Types.ObjectId(req.params.id));

        // Rating distribution
        const distribution = await Feedback.aggregate([
            { $match: { officer: new mongoose.Types.ObjectId(req.params.id), status: 'approved' } },
            { $group: { _id: '$rating', count: { $sum: 1 } } },
            { $sort: { _id: -1 } }
        ]);

        res.json({
            averageRating: stats.avgRating,
            totalFeedback: stats.count,
            distribution
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    System-wide feedback stats
// @route   GET /api/feedback/stats
// @access  Private/Admin
const getSystemStats = async (req, res) => {
    try {
        const stats = await Feedback.aggregate([
            { $match: { status: 'approved' } },
            {
                $group: {
                    _id: null,
                    avgRating: { $avg: '$rating' },
                    total: { $sum: 1 }
                }
            }
        ]);

        const topOfficers = await Feedback.aggregate([
            { $match: { status: 'approved' } },
            { $group: { _id: '$officer', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
            { $sort: { avg: -1 } },
            { $limit: 5 },
            { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'officer' } },
            { $unwind: '$officer' },
            { $project: { 'officer.password': 0, 'officer.email': 0 } }
        ]);

        res.json({
            systemAverage: stats[0]?.avgRating || 0,
            totalFeedback: stats[0]?.total || 0,
            topOfficers
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    createFeedback,
    getMyFeedback,
    getFeedbackById,
    updateFeedback,
    deleteFeedback,
    approveFeedback,
    rejectFeedback,
    addReply,
    getOfficerStats,
    getSystemStats
};
