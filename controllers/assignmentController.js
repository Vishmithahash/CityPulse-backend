const Assignment = require('../models/Assignment');
const Issue = require('../models/Issue');

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

        res.status(201).json(assignment);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

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
