const Assignment = require('../models/Assignment');
const Issue = require('../models/Issue');
const NotificationService = require('../services/notificationService');
const CalendarService = require('../services/calendarService');

const User = require('../models/User');

// @desc    Assign issue to officer
// @route   POST /api/assignments/:issueId
// @access  Private/Admin
const createAssignment = async (req, res) => {
    try {
        const { assignedTo, priority, deadline, notes, estimatedTime } = req.body;
        const { issueId } = req.params;

        // 1. Check if issue exists and is not already resolved/closed
        const issue = await Issue.findById(issueId);
        if (!issue) {
            return res.status(404).json({ message: 'Issue not found' });
        }

        if (['resolved', 'closed'].includes(issue.status)) {
            return res.status(400).json({ message: 'Cannot assign a resolved or closed issue' });
        }

        // 2. Prevent duplicate active assignments for the same issue
        const existingAssignment = await Assignment.findOne({
            issue: issueId,
            status: { $in: ['active', 'accepted'] }
        });

        if (existingAssignment) {
            return res.status(400).json({ message: 'Issue already has an active assignment' });
        }

        // 3. Create assignment
        const assignment = new Assignment({
            issue: issueId,
            assignedTo,
            assignedBy: req.user._id,
            priority,
            deadline,
            notes,
            estimatedTime,
            history: [{
                action: 'assigned',
                admin: req.user._id,
                officer: assignedTo,
                notes: notes || 'Initial assignment'
            }]
        });

        await assignment.save();

        // 4. Update Issue status
        issue.status = 'assigned';
        issue.assignedTo = assignedTo;
        await issue.save();

        // 5. Google Calendar Integration - On Assignment Creation
        try {
            const officer = await User.findById(assignedTo);
            if (officer) {
                console.log('🔄 Creating Google Calendar event for assignment...');
                const calendarResult = await CalendarService.createAssignmentEvent(officer, assignment, issue);
                if (calendarResult) {
                    console.log('✅ Calendar event created successfully');
                } else {
                    console.log('⚠️  Calendar event creation failed (check logs above)');
                }
            }
        } catch (calError) {
            console.error('❌ Google Calendar Error (Creation):', calError.message);
        }

        res.status(201).json(assignment);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Get my assignments (Officer)
// @route   GET /api/assignments/me
// @access  Private/Officer
const getMyAssignments = async (req, res) => {
    try {
        const { status, limit = 10, page = 1 } = req.query;
        const query = { assignedTo: req.user._id };

        if (status) query.status = status;

        const assignments = await Assignment.find(query)
            .populate('issue')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit));

        const total = await Assignment.countDocuments(query);

        res.json({
            assignments,
            page: parseInt(page),
            pages: Math.ceil(total / limit),
            total
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get officer's assignments (Admin)
// @route   GET /api/assignments/officer/:id
// @access  Private/Admin
const getOfficerAssignments = async (req, res) => {
    try {
        const assignments = await Assignment.find({ assignedTo: req.params.id })
            .populate('issue')
            .sort({ createdAt: -1 });
        res.json(assignments);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get single assignment details
// @route   GET /api/assignments/:id
// @access  Private
const getAssignmentById = async (req, res) => {
    try {
        const assignment = await Assignment.findById(req.params.id)
            .populate('issue')
            .populate('assignedTo', 'name email role')
            .populate('assignedBy', 'name email role')
            .populate('history.officer', 'name')
            .populate('history.admin', 'name');

        if (!assignment) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        res.json(assignment);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Officer accepts assignment
// @route   PUT /api/assignments/:id/accept
// @access  Private/Officer
const acceptAssignment = async (req, res) => {
    try {
        const assignment = await Assignment.findById(req.params.id);

        if (!assignment) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        // Check if it belongs to the logged-in officer
        if (assignment.assignedTo.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'You are not authorized to accept this assignment' });
        }

        if (assignment.status !== 'active') {
            return res.status(400).json({ message: `Cannot accept assignment in '${assignment.status}' status` });
        }

        assignment.status = 'accepted';
        assignment.history.push({
            action: 'accepted',
            officer: req.user._id,
            notes: 'Assignment accepted by officer'
        });

        await assignment.save();

        // Update issue status to in-progress
        await Issue.findByIdAndUpdate(assignment.issue, { status: 'in-progress' });

        // Google Calendar Integration - On Assignment Acceptance
        try {
            const assignmentWithDetails = await Assignment.findById(assignment._id)
                .populate('issue')
                .populate('assignedTo');

            if (assignmentWithDetails && assignmentWithDetails.issue && assignmentWithDetails.assignedTo) {
                await CalendarService.createAssignmentEvent(
                    assignmentWithDetails.assignedTo,
                    assignmentWithDetails,
                    assignmentWithDetails.issue
                );
            }
        } catch (calError) {
            console.error('Google Calendar Error (Acceptance):', calError.message);
        }

        // Notify Admin
        const admins = await User.find({ role: 'admin' });
        admins.forEach(async (admin) => {
            await NotificationService.createNotification(
                admin._id,
                'ASSIGNMENT_ACCEPTED',
                'Assignment Accepted',
                `Officer has accepted the assignment for issue "${assignment.issue}"`,
                { assignmentId: assignment._id, issueId: assignment.issue }
            );
        });

        res.json(assignment);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Reassign to new officer
// @route   PUT /api/assignments/:id/reassign
// @access  Private/Admin
const reassignIssue = async (req, res) => {
    try {
        const { newOfficerId, notes } = req.body;
        const oldAssignment = await Assignment.findById(req.params.id);

        if (!oldAssignment) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        if (['completed', 'cancelled'].includes(oldAssignment.status)) {
            return res.status(400).json({ message: 'Cannot reassign a finished or cancelled assignment' });
        }

        // 1. Mark old assignment as reassigned
        oldAssignment.status = 'reassigned';
        oldAssignment.history.push({
            action: 'reassigned',
            admin: req.user._id,
            notes: `Reassigned to officer ${newOfficerId}. ${notes || ''}`
        });
        await oldAssignment.save();

        // 2. Create new assignment
        const newAssignment = new Assignment({
            issue: oldAssignment.issue,
            assignedTo: newOfficerId,
            assignedBy: req.user._id,
            priority: oldAssignment.priority,
            deadline: oldAssignment.deadline,
            notes: notes || `Reassigned from previous officer.`,
            history: [{
                action: 'assigned',
                admin: req.user._id,
                officer: newOfficerId,
                notes: 'New assignment created via reassignment'
            }]
        });
        await newAssignment.save();

        // 3. Update Issue
        const issue = await Issue.findByIdAndUpdate(oldAssignment.issue, {
            assignedTo: newOfficerId,
            status: 'assigned' // Reset status to assigned
        }, { new: true });

        // Google Calendar Integration - On Reassignment
        try {
            const officer = await User.findById(newOfficerId);
            if (officer && issue) {
                await CalendarService.createAssignmentEvent(officer, newAssignment, issue);
            }
        } catch (calError) {
            console.error('Google Calendar Error (Reassignment):', calError.message);
        }

        // 4. Notifications
        // Notify new officer
        await NotificationService.createNotification(
            newOfficerId,
            'ASSIGNMENT_REASSIGNED',
            'Issue Reassigned to You',
            `Issue "${oldAssignment.issue}" has been reassigned to you by an admin.`,
            { assignmentId: newAssignment._id, issueId: oldAssignment.issue }
        );

        // Notify old officer
        await NotificationService.createNotification(
            oldAssignment.assignedTo,
            'ASSIGNMENT_REASSIGNED',
            'Issue Reassigned',
            `Your assignment for issue "${oldAssignment.issue}" has been reassigned to another officer.`,
            { assignmentId: oldAssignment._id }
        );

        res.json({ message: 'Issue successfully reassigned', newAssignment });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Mark as completed
// @route   PUT /api/assignments/:id/complete
// @access  Private/Officer
const completeAssignment = async (req, res) => {
    try {
        const { notes } = req.body;
        const assignment = await Assignment.findById(req.params.id);

        if (!assignment) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        if (assignment.assignedTo.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        assignment.status = 'completed';
        assignment.history.push({
            action: 'completed',
            officer: req.user._id,
            notes: notes || 'Task completed'
        });
        await assignment.save();

        // Update Issue status to resolved
        await Issue.findByIdAndUpdate(assignment.issue, { status: 'resolved' });

        res.json(assignment);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Cancel assignment
// @route   DELETE /api/assignments/:id
// @access  Private/Admin
const deleteAssignment = async (req, res) => {
    try {
        const assignment = await Assignment.findById(req.params.id);

        if (!assignment) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        assignment.status = 'cancelled';
        await assignment.save();

        // Reset issue status to open and remove assigned officer
        await Issue.findByIdAndUpdate(assignment.issue, {
            status: 'open',
            $unset: { assignedTo: 1 }
        });

        res.json({ message: 'Assignment cancelled and issue returned to open pool' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    createAssignment,
    getMyAssignments,
    getOfficerAssignments,
    getAssignmentById,
    acceptAssignment,
    reassignIssue,
    completeAssignment,
    deleteAssignment
};
