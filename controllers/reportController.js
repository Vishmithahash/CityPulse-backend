const Report = require('../models/Report');
const Issue = require('../models/Issue');
const Assignment = require('../models/Assignment');
const User = require('../models/User');
const mongoose = require('mongoose');

// @desc    Create report config
// @route   POST /api/reports
// @access  Private/Admin
const createReport = async (req, res) => {
    try {
        const report = new Report({
            ...req.body,
            createdBy: req.user._id
        });
        const savedReport = await report.save();
        res.status(201).json(savedReport);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    List all reports
// @route   GET /api/reports
// @access  Private/Admin
const getReports = async (req, res) => {
    try {
        const reports = await Report.find({ createdBy: req.user._id }).sort({ createdAt: -1 });
        res.json(reports);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get single report details
// @route   GET /api/reports/:id
// @access  Private/Admin
const getReportById = async (req, res) => {
    try {
        const report = await Report.findById(req.params.id);
        if (!report) return res.status(404).json({ message: 'Report not found' });
        res.json(report);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update report config
// @route   PUT /api/reports/:id
// @access  Private/Admin
const updateReport = async (req, res) => {
    try {
        const report = await Report.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );
        if (!report) return res.status(404).json({ message: 'Report not found' });
        res.json(report);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Delete report
// @route   DELETE /api/reports/:id
// @access  Private/Admin
const deleteReport = async (req, res) => {
    try {
        const report = await Report.findByIdAndDelete(req.params.id);
        if (!report) return res.status(404).json({ message: 'Report not found' });
        res.json({ message: 'Report config deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Toggle report active status
// @route   PATCH /api/reports/:id/toggle
// @access  Private/Admin
const toggleReportActive = async (req, res) => {
    try {
        const report = await Report.findById(req.params.id);
        if (!report) return res.status(404).json({ message: 'Report not found' });
        report.isActive = !report.isActive;
        await report.save();
        res.json(report);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Helper: Build match stage from filters
const buildMatchStage = (filters) => {
    const match = {};
    if (filters.categories?.length) match.category = { $in: filters.categories };
    if (filters.priorities?.length) match.priority = { $in: filters.priorities };
    if (filters.statuses?.length) match.status = { $in: filters.statuses };
    if (filters.officers?.length) match.assignedTo = { $in: filters.officers.map(id => new mongoose.Types.ObjectId(id)) };

        if (filters.startDate || filters.endDate) {
        match.createdAt = {};
        if (filters.startDate) match.createdAt.$gte = new Date(filters.startDate);
        if (filters.endDate) match.createdAt.$lte = new Date(filters.endDate);
    }

    // Geo matches would typically use $near, but aggregation uses $geoNear (must be first stage)
    return match;
};

// @desc    Execute report
// @route   GET /api/reports/:id/run
// @access  Private/Admin, Officer
const runReport = async (req, res) => {
    try {
        const report = await Report.findById(req.params.id);
        if (!report) return res.status(404).json({ message: 'Report not found' });
        if (!report.isActive) return res.status(400).json({ message: 'Report is inactive' });

        // Check cache
        if (report.cachedData?.data && report.cachedData.expiresAt > new Date()) {
            return res.json(report.cachedData.data);
        }

        const { reportType, filters } = report;
        const matchStage = buildMatchStage(filters);
        let results = [];

        switch (reportType) {
            case 'ISSUE_SUMMARY':
                results = await Issue.aggregate([
                    { $match: matchStage },
                    { $group: { _id: '$status', count: { $sum: 1 } } }
                ]);
                break;

            case 'CATEGORY_ANALYSIS':
                results = await Issue.aggregate([
                    { $match: matchStage },
                    { $group: { _id: '$category', count: { $sum: 1 } } },
                    { $sort: { count: -1 } }
                ]);
                break;

            case 'OFFICER_PERFORMANCE':
                results = await Issue.aggregate([
                    { $match: { assignedTo: { $exists: true }, ...matchStage } },
                    {
                        $group: {
                            _id: '$assignedTo',
                            total: { $sum: 1 },
                            resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
                            avgResolutionTime: { $avg: '$resolutionTime' }
                        }
                    },
                    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'officer' } },
                    { $unwind: '$officer' },
                    { $project: { 'officer.password': 0, 'officer.email': 0 } }
                ]);
                break;

            case 'MONTHLY_TRENDS':
                results = await Issue.aggregate([
                    { $match: matchStage },
                    {
                        $group: {
                            _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
                            count: { $sum: 1 }
                        }
                    },
                    { $sort: { '_id': 1 } }
                ]);
                break;

            default:
                return res.status(400).json({ message: 'Execution logic not implemented for this report type' });
        }

        // Update report execution metadata & cache
        report.lastExecuted = new Date();
        report.executionCount += 1;
        report.cachedData = {
            data: results,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour TTL
        };
        await report.save();

        res.json(results);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

//192...