const rateLimit = require('express-rate-limit');

const aiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 AI calls per IP
    message: 'Too many AI requests'
});

module.exports = { aiLimiter };
