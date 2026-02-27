const sgMail = require('@sendgrid/mail');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const msg = {
    to: process.env.FROM_EMAIL, // Send to yourself for testing
    from: process.env.FROM_EMAIL,
    subject: 'SendGrid Test - CityPulse',
    text: 'If you receive this, SendGrid is working!',
    html: '<strong>If you receive this, SendGrid is working!</strong>',
};

console.log('Attempting to send test email...');
console.log('API Key starts with:', process.env.SENDGRID_API_KEY?.substring(0, 10));
console.log('From Email:', process.env.FROM_EMAIL);

sgMail.send(msg)
    .then(() => {
        console.log('✅ Test email sent successfully');
    })
    .catch((error) => {
        console.error('❌ Test email failed');
        console.error('Error Code:', error.code);
        console.error('Message:', error.message);
        if (error.response) {
            console.error('Response Body:', JSON.stringify(error.response.body, null, 2));
        }
    });
