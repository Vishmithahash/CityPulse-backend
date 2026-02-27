require('dotenv').config();
const { CohereClient } = require('cohere-ai');
const cohere = new CohereClient({
    token: process.env.COHERE_API_KEY,
});

async function findModels() {
    try {
        const models = await cohere.models.list();
        console.log(models.models.map(m => m.name).join(', '));
    } catch (e) {
        console.error(e);
    }
}

findModels();
