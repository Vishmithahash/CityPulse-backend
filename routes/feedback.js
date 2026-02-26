const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/feedbackController');
const protect = require('../middleware/auth');
const authorize = require('../middleware/roles');

// General authenticated routes
router.get('/me', protect, getMyFeedback);
router.get('/stats', protect, authorize('admin'), getSystemStats);
router.get('/officer/:id/stats', protect, getOfficerStats);

// Parameterized routes
router.route('/:id')
    .get(protect, getFeedbackById)
    .put(protect, authorize('citizen'), updateFeedback)
    .delete(protect, (req, res, next) => protect(req, res, next), deleteFeedback);

// Contextual submission
router.post('/:issueId', protect, authorize('citizen'), createFeedback);

// Moderation and Interaction
router.patch('/:id/approve', protect, authorize('admin'), approveFeedback);
router.patch('/:id/reject', protect, authorize('admin'), rejectFeedback);
router.post('/:id/reply', protect, authorize('admin', 'officer'), addReply);

module.exports = router;
