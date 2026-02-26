const express = require('express');
const router = express.Router();
const {
    createReport,
    getReports,
    getReportById,
    updateReport,
    deleteReport,
    toggleReportActive,
    runReport,
    getAdminDashboard,
    getOfficerDashboard,
    getCitizenDashboard
} = require('../controllers/reportController');
const protect = require('../middleware/auth');
const authorize = require('../middleware/roles');

// Dashboard routes (Accessible by relevant roles or Admins)
router.get('/dashboard/admin', protect, authorize('admin'), getAdminDashboard);
router.get('/dashboard/officer/:id', protect, authorize('admin', 'officer'), getOfficerDashboard);
router.get('/dashboard/citizen/:id', protect, authorize('admin', 'citizen'), getCitizenDashboard);

// Execution routes (Admin and Officer for reading analytics)
router.get('/:id/run', protect, authorize('admin', 'officer'), runReport);

// CRUD routes (Admin only)
router.route('/')
    .post(protect, authorize('admin'), createReport)
    .get(protect, authorize('admin'), getReports);

router.route('/:id')
    .get(protect, authorize('admin'), getReportById)
    .put(protect, authorize('admin'), updateReport)
    .delete(protect, authorize('admin'), deleteReport);

router.patch('/:id/toggle', protect, authorize('admin'), toggleReportActive);

module.exports = router;