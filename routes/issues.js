const express = require('express');
const router = express.Router();
const {
    createIssue,
    getIssues,
    getIssueById,
    updateIssue,
    deleteIssue,
    getIssuesNearby,
    getAISuggestions
} = require('../controllers/issueController');
const protect = require('../middleware/auth');
const authorize = require('../middleware/roles');
const { aiLimiter } = require('../middleware/rateLimit');

const upload = require('../middleware/multer');

// @route   POST /api/issues/ai-suggest
router.post('/ai-suggest', protect, aiLimiter, getAISuggestions);

// @route   GET /api/issues/nearby
// Order matters: place specific routes before parameterized routes
router.get('/nearby', protect, getIssuesNearby);

router.route('/')
    .get(protect, getIssues)
    .post(protect, authorize('citizen'), upload, createIssue);

router.route('/:id')
    .get(protect, getIssueById)
    .put(protect, authorize('officer', 'admin'), updateIssue)
    .delete(protect, authorize('admin'), deleteIssue);

module.exports = router;
