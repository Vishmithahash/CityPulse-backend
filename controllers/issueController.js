const Issue = require('../models/Issue');
const AIService = require('../services/aiService');
const cloudinary = require('cloudinary').v2;

// Cloudinary Config
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// @desc    Create new issue
// @route   POST /api/issues
// @access  Private/Citizen
const createIssue = async (req, res) => {
    try {
        const { title, description, category, priority, location, useAI } = req.body;

        let aiSuggestions = {};
        if (useAI === 'true' && description) {
            const [suggestedCategory, suggestedPriority, suggestedTitle] = await Promise.all([
                AIService.suggestCategory(description),
                AIService.suggestPriority(description),
                AIService.generateTitle(description)
            ]);

            aiSuggestions = {
                suggestedCategory,
                suggestedPriority,
                suggestedTitle
            };
        }

        // Handle images upload to Cloudinary
        const files = req.files;
        let imageUrls = [];

        if (files && files.length > 0) {
            imageUrls = await Promise.all(files.map(async (file) => {
                const b64 = Buffer.from(file.buffer).toString("base64");
                let dataURI = "data:" + file.mimetype + ";base64," + b64;
                const result = await cloudinary.uploader.upload(dataURI, {
                    folder: 'citypulse/issues'
                });
                return {
                    url: result.secure_url,
                    publicId: result.public_id
                };
            }));
        }

        // Parse location if it's a string (from FormData)
        let parsedLocation = location;
        if (typeof location === 'string') {
            try {
                parsedLocation = JSON.parse(location);
            } catch (e) {
                return res.status(400).json({ message: 'Invalid location format' });
            }
        }

        const finalTitle = title || aiSuggestions.suggestedTitle || 'Issue Report';
        const finalCategory = category || aiSuggestions.suggestedCategory || 'road';
        const finalPriority = priority || aiSuggestions.suggestedPriority || 'medium';

        const issue = new Issue({
            title: finalTitle,
            description,
            category: finalCategory,
            priority: finalPriority,
            location: parsedLocation,
            images: imageUrls,
            reportedBy: req.user._id
        });

        const createdIssue = await issue.save();
        res.status(201).json({
            success: true,
            issue: createdIssue,
            aiSuggestions
        });
    } catch (error) {
        console.error('Create Issue Error:', error);
        res.status(400).json({ message: error.message });
    }
};

// @desc    Get AI Suggestions for Issue
// @route   POST /api/issues/ai-suggest
// @access  Private
const getAISuggestions = async (req, res) => {
    try {
        const { description } = req.body;

        if (!description || description.length < 10) {
            return res.status(400).json({ message: 'Description too short' });
        }

        const [category, priority, title] = await Promise.all([
            AIService.suggestCategory(description),
            AIService.suggestPriority(description),
            AIService.generateTitle(description)
        ]);

        res.json({
            category,
            priority,
            title,
            confidence: Math.random() * 0.3 + 0.7 // Mock confidence
        });
    } catch (error) {
        console.error('AI Service Error:', error);
        res.status(500).json({ error: 'AI service unavailable' });
    }
};

// @desc    List all issues with filters
// @route   GET /api/issues
// @access  Private
const getIssues = async (req, res) => {
    try {
        const {
            status,
            category,
            priority,
            assignedTo,
            reportedBy,
            limit = 10,
            page = 1,
            lat,
            lng,
            radius = 5000 // meters
        } = req.query;

        const query = {};

        if (status) query.status = status;
        if (category) query.category = category;
        if (priority) query.priority = priority;
        if (assignedTo) query.assignedTo = assignedTo;
        if (reportedBy) query.reportedBy = reportedBy;

        // Geo search if lat/lng are provided
        if (lat && lng) {
            query.location = {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [parseFloat(lng), parseFloat(lat)]
                    },
                    $maxDistance: parseInt(radius)
                }
            };
        }

        const total = await Issue.countDocuments(query);
        const issues = await Issue.find(query)
            .populate('reportedBy', 'name email')
            .populate('assignedTo', 'name email')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit));

        res.json({
            issues,
            page: parseInt(page),
            pages: Math.ceil(total / limit),
            total
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get single issue details
// @route   GET /api/issues/:id
// @access  Private
const getIssueById = async (req, res) => {
    try {
        const issue = await Issue.findById(req.params.id)
            .populate('reportedBy', 'name email')
            .populate('assignedTo', 'name email')
            .populate('comments.user', 'name role');

        if (!issue) {
            return res.status(404).json({ message: 'Issue not found' });
        }

        res.json(issue);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update issue (Officer/Admin)
// @route   PUT /api/issues/:id
// @access  Private/Officer, Admin
const updateIssue = async (req, res) => {
    try {
        const issue = await Issue.findById(req.params.id);

        if (!issue) {
            return res.status(404).json({ message: 'Issue not found' });
        }

        const { status, priority, assignedTo, comment, resolutionTime } = req.body;

        // Workflow Logic
        if (status) {
            issue.status = status;

            // Calculate resolution time if status is being set to 'resolved'
            if (status === 'resolved' && !issue.resolutionTime) {
                const diffInMs = new Date() - issue.createdAt;
                const diffInHours = Math.round(diffInMs / (1000 * 60 * 60));
                issue.resolutionTime = resolutionTime || diffInHours;
            }
        }

        if (priority) issue.priority = priority;
        if (assignedTo) issue.assignedTo = assignedTo;

        // Add comment if provided
        if (comment) {
            issue.comments.push({
                text: comment,
                user: req.user._id
            });
        }

        const updatedIssue = await issue.save();
        res.json(updatedIssue);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Delete issue
// @route   DELETE /api/issues/:id
// @access  Private/Admin
const deleteIssue = async (req, res) => {
    try {
        const issue = await Issue.findById(req.params.id);

        if (!issue) {
            return res.status(404).json({ message: 'Issue not found' });
        }

        await issue.deleteOne();
        res.json({ message: 'Issue removed' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Find issues within radius
// @route   GET /api/issues/nearby
// @access  Private
const getIssuesNearby = async (req, res) => {
    try {
        const { lat, lng, radius = 5000 } = req.query;

        if (!lat || !lng) {
            return res.status(400).json({ message: 'Latitude and longitude are required' });
        }

        const issues = await Issue.find({
            location: {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [parseFloat(lng), parseFloat(lat)]
                    },
                    $maxDistance: parseInt(radius)
                }
            }
        }).populate('reportedBy', 'name email');

        res.json(issues);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    createIssue,
    getIssues,
    getIssueById,
    updateIssue,
    deleteIssue,
    getIssuesNearby,
    getAISuggestions
};
