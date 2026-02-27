const Report = require('../models/Report');
const Issue = require('../models/Issue');
const Assignment = require('../models/Assignment');
const User = require('../models/User');
const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');


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

// @desc    Admin Dashboard Overview
// @route   GET /api/reports/dashboard/admin
// @access  Private/Admin
const getAdminDashboard = async (req, res) => {
    try {
        const totalIssues = await Issue.countDocuments();
        const statusStats = await Issue.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);

        const categoryStats = await Issue.aggregate([
            { $group: { _id: '$category', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        const resTimeStats = await Issue.aggregate([
            { $match: { status: 'resolved', resolutionTime: { $ne: null } } },
            { $group: { _id: null, avg: { $avg: '$resolutionTime' } } }
        ]);

        const monthlyTrends = await Issue.aggregate([
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id': 1 } },
            { $limit: 6 }
        ]);

        res.json({
            totalIssues,
            statusStats,
            categoryStats,
            avgResolutionTime: resTimeStats[0]?.avg || 0,
            monthlyTrends
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Officer Dashboard
// @route   GET /api/reports/dashboard/officer/:id
// @access  Private/Officer, Admin
const getOfficerDashboard = async (req, res) => {
    try {
        const officerId = new mongoose.Types.ObjectId(req.params.id);

        const activeAssignments = await Assignment.countDocuments({ assignedTo: officerId, status: { $in: ['active', 'accepted'] } });
        const completedAssignments = await Assignment.countDocuments({ assignedTo: officerId, status: 'completed' });

        const issueStats = await Issue.aggregate([
            { $match: { assignedTo: officerId } },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    resolvedCount: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
                    avgResTime: { $avg: '$resolutionTime' }
                }
            }
        ]);

        // Feedback stats
        const Feedback = require('../models/Feedback');
        const feedbackStats = await Feedback.getOfficerAverageRating(officerId);

        res.json({
            activeAssignments,
            completedAssignments,
            totalAssigned: issueStats[0]?.total || 0,
            resolutionRate: issueStats[0]?.total ? (issueStats[0]?.resolvedCount / issueStats[0]?.total) * 100 : 0,
            avgResolutionTime: issueStats[0]?.avgResTime || 0,
            avgRating: feedbackStats.avgRating || 0,
            feedbackCount: feedbackStats.count || 0
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Citizen Dashboard
// @route   GET /api/reports/dashboard/citizen/:id
// @access  Private/Citizen, Admin
const getCitizenDashboard = async (req, res) => {
    try {
        const citizenId = new mongoose.Types.ObjectId(req.params.id);

        const totalReported = await Issue.countDocuments({ reportedBy: citizenId });
        const statusStats = await Issue.aggregate([
            { $match: { reportedBy: citizenId } },
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);

        // Average resolution time for this citizen's issues
        const resTimeStats = await Issue.aggregate([
            { $match: { reportedBy: citizenId, status: 'resolved', resolutionTime: { $ne: null } } },
            { $group: { _id: null, avg: { $avg: '$resolutionTime' } } }
        ]);

        res.json({
            totalIssues: totalReported,
            statusStats,
            avgResolutionTime: resTimeStats[0]?.avg || 0
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Download report as PDF
// @route   GET /api/reports/:id/download
// @access  Private/Admin, Officer
const downloadReportPdf = async (req, res) => {
    try {
        const report = await Report.findById(req.params.id);
        if (!report) return res.status(404).json({ message: 'Report not found' });
        if (!report.isActive) return res.status(400).json({ message: 'Report is inactive' });

        let results = [];
        let detailedIssues = [];
        const { reportType, filters } = report;
        const matchStage = buildMatchStage(filters);

        if (report.cachedData?.data && report.cachedData.expiresAt > new Date()) {
            results = report.cachedData.data;
        } else {
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
            }
        }

        detailedIssues = await Issue.find(matchStage)
            .sort({ createdAt: -1 })
            .populate('reportedBy', 'name')
            .populate('assignedTo', 'name');

        const doc = new PDFDocument({
            margin: 50,
            bufferPages: true,
            size: 'A4'
        });
        const filename = `Report_${report.title.replace(/\s+/g, '_')}_${Date.now()}.pdf`;

        res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-type', 'application/pdf');

        doc.pipe(res);

        // Design Constants
        const colors = {
            primary: '#0f172a',    // Dark Slate
            accent: '#3b82f6',     // Bright Blue
            secondary: '#64748b',  // Muted Slate
            border: '#e2e8f0',     // Light Gray
            bg: '#f8fafc'          // Very Light Slate
        };

        // Header Section
        doc.rect(0, 0, doc.page.width, 140).fill(colors.primary);

        doc.fillColor('#ffffff').fontSize(28).font('Helvetica-Bold').text('CityPulse', 50, 45);
        doc.fontSize(10).font('Helvetica').text('SMART CITY GOVERNANCE SYSTEM', 50, 75);

        doc.fontSize(14).font('Helvetica-Bold').text('REPORT SUMMARY', 50, 100, { align: 'right', width: doc.page.width - 100 });

        doc.moveDown(5);

        // Report Info Table
        doc.fillColor(colors.primary).fontSize(18).font('Helvetica-Bold').text(report.title, 50, 160);

        doc.fontSize(10).font('Helvetica').fillColor(colors.secondary);
        doc.text(`Type: ${report.reportType.replace('_', ' ')}`, 50, 185);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 50, 200);

        doc.moveTo(50, 220).lineTo(545, 220).strokeColor(colors.border).stroke();
        doc.moveDown(2);

        // 1. Summary Statistics
        doc.fillColor(colors.primary).fontSize(14).font('Helvetica-Bold').text('1. Analytics Overview', 50, 240);
        doc.moveDown(1);

        if (results.length === 0) {
            doc.fontSize(10).font('Helvetica').fillColor(colors.secondary).text('No analytical data found for the selected period.');
        } else {
            let currentY = doc.y;
            results.forEach((item, index) => {
                const label = item._id || 'UNSPECIFIED';
                const count = item.count !== undefined ? item.count : item.total;

                // Draw summary box
                doc.rect(50, currentY, 495, 30).fill(colors.bg);
                doc.fillColor(colors.primary).fontSize(10).font('Helvetica-Bold').text(label.toUpperCase(), 65, currentY + 10);
                doc.fillColor(colors.accent).text(count.toString(), 500, currentY + 10, { align: 'right', width: 30 });

                currentY += 35;
                if (currentY > 700) {
                    doc.addPage();
                    currentY = 50;
                }
            });
            doc.y = currentY;
        }

        doc.moveDown(2);

        // 2. Detailed Issue Registry
        if (doc.y > 600) doc.addPage();
        doc.fillColor(colors.primary).fontSize(14).font('Helvetica-Bold').text('2. Detailed Issue Registry', 50, doc.y);
        doc.moveDown(1);

        if (detailedIssues.length === 0) {
            doc.fontSize(10).font('Helvetica').fillColor(colors.secondary).text('No matching issue records found.');
        } else {
            detailedIssues.forEach((issue, index) => {
                if (doc.y > 650) {
                    doc.addPage();
                    doc.moveDown(1);
                }

                const currentY = doc.y;

                // Issue Card
                doc.fillColor(colors.primary).fontSize(11).font('Helvetica-Bold').text(`${index + 1}. ${issue.title.toUpperCase()}`, 50, currentY);
                doc.fontSize(9).font('Helvetica').fillColor(colors.secondary).text(`ID: ${issue._id}`, 50, currentY + 15);

                // Status Badge
                const statusColor = issue.status === 'resolved' ? '#10b981' : (issue.status === 'open' ? '#ef4444' : '#f59e0b');
                doc.rect(450, currentY, 95, 18).fill(statusColor);
                doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold').text(issue.status.toUpperCase(), 450, currentY + 5, { align: 'center', width: 95 });

                doc.moveDown(1.5);

                // Details Grid
                const reporter = issue.reportedBy ? issue.reportedBy.name : 'Unknown Citizen';
                const officer = issue.assignedTo ? issue.assignedTo.name : 'Unassigned';

                doc.fillColor(colors.primary).fontSize(9).font('Helvetica-Bold').text('REPORTED BY:', 50, doc.y);
                doc.font('Helvetica').text(reporter, 130, doc.y - 9);

                doc.font('Helvetica-Bold').text('ASSIGNED TO:', 300, doc.y - 9);
                doc.font('Helvetica').text(officer, 380, doc.y - 9);

                doc.moveDown(0.5);
                doc.font('Helvetica-Bold').text('CATEGORY:', 50, doc.y);
                doc.font('Helvetica').text(issue.category.toUpperCase(), 130, doc.y - 9);

                doc.font('Helvetica-Bold').text('PRIORITY:', 300, doc.y - 9);
                doc.font('Helvetica').text(issue.priority.toUpperCase(), 380, doc.y - 9);

                doc.moveDown(0.5);
                if (issue.location && issue.location.address) {
                    doc.font('Helvetica-Bold').text('LOCATION:', 50, doc.y);
                    doc.font('Helvetica').text(issue.location.address, 130, doc.y - 9, { width: 415 });
                }

                doc.moveDown(1);
                doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(colors.border).lineWidth(0.5).stroke();
                doc.moveDown(1);
            });
        }

        // Add page numbers and footer
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
            doc.switchToPage(i);

            // Footer separator
            doc.moveTo(50, doc.page.height - 60).lineTo(545, doc.page.height - 60).strokeColor(colors.border).stroke();

            doc.fillColor(colors.secondary).fontSize(8).font('Helvetica').text(
                '© 2026 CityPulse Smart City Solutions',
                50,
                doc.page.height - 45
            );

            doc.text(
                `Page ${i + 1} of ${range.count}`,
                50,
                doc.page.height - 45,
                { align: 'right', width: doc.page.width - 100 }
            );
        }

        doc.end();

    } catch (error) {
        if (!res.headersSent) {
            console.error('PDF Generation Error:', error);
            res.status(500).json({ message: 'Error generating PDF report' });
        }
    }
};


module.exports = {
    createReport,
    getReports,
    getReportById,
    updateReport,
    deleteReport,
    toggleReportActive,
    runReport,
    getAdminDashboard,
    getOfficerDashboard,
    getCitizenDashboard,
    downloadReportPdf
};

