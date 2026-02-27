const express = require('express');
const router = express.Router();
const {
    createAssignment,
    getMyAssignments,
    getOfficerAssignments,
    getAssignmentById,
    acceptAssignment,
    reassignIssue,
    completeAssignment,
    deleteAssignment
} = require('../controllers/assignmentController');
const protect = require('../middleware/auth');
const authorize = require('../middleware/roles');

// Officer routes
router.get('/me', protect, authorize('officer'), getMyAssignments);
router.put('/:id/accept', protect, authorize('officer'), acceptAssignment);
router.put('/:id/complete', protect, authorize('officer'), completeAssignment);

// Admin routes
router.post('/:issueId', protect, authorize('admin'), createAssignment);
router.get('/officer/:id', protect, authorize('admin'), getOfficerAssignments);
router.put('/:id/reassign', protect, authorize('admin'), reassignIssue);
router.delete('/:id', protect, authorize('admin'), deleteAssignment);

// Shared route
router.get('/:id', protect, getAssignmentById);

module.exports = router;