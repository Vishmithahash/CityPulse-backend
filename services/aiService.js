const { CohereClient } = require('cohere-ai');
const cohere = new CohereClient({
    token: process.env.COHERE_API_KEY,
});

class AIService {
    // Smart Category Classification using Chat API
    static async suggestCategory(description) {
        try {
            const prompt = `Classify this infrastructure issue into exactly one of these categories: road, water, electricity, waste, streetlight, drainage.

Examples:
"Large pothole on main road, very dangerous for vehicles" -> road
"No water supply for 3 days in our area" -> water
"Street light not working near school" -> streetlight
"Electricity pole leaning dangerously" -> electricity
"Garbage pile blocking drainage" -> drainage
"Broken manhole cover on sidewalk" -> waste

Description: "${description}"

Reply with ONLY the category name.`;

            const response = await cohere.chat({
                model: 'command-r-08-2024',
                message: prompt,
                temperature: 0.1
            });

            const prediction = response.text.trim().toLowerCase();
            const allowedCategories = ['road', 'water', 'electricity', 'waste', 'streetlight', 'drainage'];

            for (const cat of allowedCategories) {
                if (prediction.includes(cat)) {
                    return cat;
                }
            }
            return 'road';
        } catch (error) {
            console.error('Cohere Category Classification Error:', error.message);
            return 'road'; // default fallback
        }
    }

    // Priority Prediction using Chat API
    static async suggestPriority(description) {
        try {
            const prompt = `Analyze urgency of this infrastructure issue description and respond with priority level only (low, medium, high, urgent):

Description: "${description.substring(0, 500)}"

Reply with ONLY the urgency level word.`;

            const response = await cohere.chat({
                model: 'command-r-08-2024',
                message: prompt,
                temperature: 0.1
            });

            const priorityStr = response.text.trim().toLowerCase();
            const match = priorityStr.match(/(low|medium|high|urgent)/);
            return match ? match[1] : 'medium';
        } catch (error) {
            console.error('Cohere Priority Prediction Error:', error.message);
            return 'medium'; // default fallback
        }
    }

    // Smart Title Generation using Chat API
    static async generateTitle(description) {
        try {
            const prompt = `Convert this infrastructure issue description into a highly concise, professional title (maximum 80 characters, just the title itself without quotation marks or extra text).

Description: "${description.substring(0, 300)}"

Title:`;

            const response = await cohere.chat({
                model: 'command-r-08-2024',
                message: prompt,
                temperature: 0.3
            });

            return response.text.trim().replace(/^["']|["']$/g, '') || 'Issue Report';
        } catch (error) {
            console.error('Cohere Title Generation Error:', error.message);
            return 'Issue Report';
        }
    }
}

module.exports = AIService;
