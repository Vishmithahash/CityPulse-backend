require('dotenv').config();
const AIService = require('./services/aiService');

async function test() {
    console.log("Testing AI Service...");
    const desc = "There is a massive pothole in the middle of Main Street near the central school.";

    try {
        const cat = await AIService.suggestCategory(desc);
        console.log("Category:", cat);

        const prio = await AIService.suggestPriority(desc);
        console.log("Priority:", prio);

        const title = await AIService.generateTitle(desc);
        console.log("Title:", title);

    } catch (e) {
        console.error("Test Error:", e);
    }
}

test();
