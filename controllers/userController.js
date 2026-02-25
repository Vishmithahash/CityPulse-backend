const User = require('../models/User');

// @desc    Get user profile
// @route   GET /api/users/me
// @access  Private
const getUserProfile = async (req, res) => {
    const user = await User.findById(req.user._id);

    if (user) {
        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            location: user.location,
            phone: user.phone
        });
    } else {
        res.status(404).json({ msg: 'User not found' });
    }
};

const updateUserProfile = async (req, res) => {
    const user = await User.findById(req.user._id);

    if (user) {
        user.name = req.body.name || user.name;
        user.email = req.body.email || user.email;
        user.location = req.body.location || user.location;
        user.phone = req.body.phone || user.phone;
        user.bio = req.body.bio || user.bio;
        user.address = req.body.address || user.address;

        if (req.body.profileImage) {
            user.profileImage = {
                url: req.body.profileImage,
                publicId: req.body.publicId || user.profileImage?.publicId
            };
        }

        if (req.body.password) {
            user.password = req.body.password;
        }

        const updatedUser = await user.save();

        res.json({
            _id: updatedUser._id,
            name: updatedUser.name,
            email: updatedUser.email,
            role: updatedUser.role,
            location: updatedUser.location,
            phone: updatedUser.phone,
            bio: updatedUser.bio,
            address: updatedUser.address,
            profileImage: updatedUser.profileImage?.url
        });
    } else {
        res.status(404).json({ msg: 'User not found' });
    }
};

module.exports = { getUserProfile, updateUserProfile };
