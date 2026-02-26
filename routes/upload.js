const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const protect = require('../middleware/auth');

// Cloudinary Config
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.warn('WARNING: Cloudinary environment variables are missing! Image uploads will fail.');
}

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'citypulse/profiles',
        allowed_formats: ['jpg', 'png', 'jpeg'],
        transformation: [{ width: 500, height: 500, crop: 'limit' }]
    }
});

const upload = multer({ storage: storage });

// @desc    Upload profile image
// @route   POST /api/upload/profile
// @access  Private
router.post('/profile', protect, (req, res) => {
    upload.single('image')(req, res, (err) => {
        if (err) {
            console.error('Multer/Cloudinary Upload Error:', err);
            return res.status(500).json({ msg: 'Cloudinary upload failed', error: err.message });
        }

        if (!req.file) {
            return res.status(400).json({ msg: 'No file uploaded' });
        }

        console.log('Successfully uploaded to Cloudinary:', req.file.path);
        res.json({
            url: req.file.path,
            publicId: req.file.filename
        });
    });
});

module.exports = router;
