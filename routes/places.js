const express = require('express');
const router = express.Router();

// @route   GET api/places
// @desc    Get all places
// @access  Public
router.get('/', (req, res) => {
    res.json({ message: 'Places route working' });
});

module.exports = router;
