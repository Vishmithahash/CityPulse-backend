const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            if (token === 'undefined' || !token) {
                console.log('Auth middleware: Token is undefined');
                return res.status(401).json({ msg: 'Not authorized, token is undefined' });
            }
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = await User.findById(decoded.id).select('-password');
            return next();
        } catch (error) {
            console.log('Auth middleware: Token verification failed:', error.message);
            return res.status(401).json({ msg: 'Not authorized, token failed' });
        }
    }

    if (!token) {
        console.log('Auth middleware: No authorization header found');
        return res.status(401).json({ msg: 'Not authorized, no token' });
    }
};

module.exports = protect;
