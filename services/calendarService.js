const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

// Google Calendar Configuration
let calendar = null;
let isCalendarEnabled = false;

try {
    // Try to use JSON credentials file first (recommended)
    const credentialsPath = path.join(__dirname, '..', 'google-credentials.json');
    
    if (fs.existsSync(credentialsPath)) {
        console.log('📄 Loading Google credentials from JSON file...');
        const credentials = require(credentialsPath);
        
        // Use Google's official method to create auth from JSON
        const auth = google.auth.fromJSON(credentials);
        auth.scopes = ['https://www.googleapis.com/auth/calendar'];
        
        // Explicitly authorize the service account
        auth.authorize()
            .then(() => {
                calendar = google.calendar({ version: 'v3', auth });
                isCalendarEnabled = true;
                console.log('✅ Google Calendar authenticated successfully');
                if (process.env.GOOGLE_SHARED_CALENDAR_ID) {
                    console.log('✅ Using shared calendar:', process.env.GOOGLE_SHARED_CALENDAR_ID);
                } else {
                    console.log('💡 Tip: Set GOOGLE_SHARED_CALENDAR_ID in .env');
                }
            })
            .catch((err) => {
                console.error('❌ Google Calendar Auth Failed:', err.message);
                console.error('❌ Full error:', err);
                isCalendarEnabled = false;
            });
    } else if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
        console.log('📄 Loading Google credentials from environment variables...');
        const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
        
        const auth = new google.auth.JWT(
            process.env.GOOGLE_CLIENT_EMAIL,
            null,
            privateKey,
            ['https://www.googleapis.com/auth/calendar']
        );
        
        auth.authorize()
            .then(() => {
                calendar = google.calendar({ version: 'v3', auth });
                isCalendarEnabled = true;
                console.log('✅ Google Calendar authenticated successfully');
                if (process.env.GOOGLE_SHARED_CALENDAR_ID) {
                    console.log('✅ Using shared calendar:', process.env.GOOGLE_SHARED_CALENDAR_ID);
                }
            })
            .catch((err) => {
                console.error('❌ Google Calendar Auth Failed:', err.message);
                isCalendarEnabled = false;
            });
    } else {
        console.warn('⚠️  Google Calendar credentials not found - calendar features disabled');
    }
} catch (error) {
    console.error('❌ Failed to initialize Google Calendar:', error.message);
    isCalendarEnabled = false;
}

/**
 * Create a calendar event for an assignment
 * @param {Object} officer - Officer details (email, name)
 * @param {Object} assignment - Assignment details (deadline, estimatedTime, notes)
 * @param {Object} issue - Issue details (title, description)
 */
const createAssignmentEvent = async (officer, assignment, issue) => {
    // Return early if calendar not enabled
    if (!isCalendarEnabled || !calendar) {
        console.log('📅 Google Calendar integration disabled - skipping event creation');
        return null;
    }

    console.log('📅 Attempting to create calendar event...');
    console.log('   Officer:', officer.email);
    console.log('   Calendar ID:', process.env.GOOGLE_SHARED_CALENDAR_ID);

    try {
        const startTime = new Date();
        let endTime;

        if (assignment.deadline) {
            endTime = new Date(assignment.deadline);
        } else if (assignment.estimatedTime) {
            endTime = new Date(startTime.getTime() + assignment.estimatedTime * 60 * 60 * 1000);
        } else {
            // Default 1 hour if no info provided
            endTime = new Date(startTime.getTime() + 1 * 60 * 60 * 1000);
        }

        const event = {
            'summary': `CityPulse: ${issue.title}`,
            'location': issue.location ? `${issue.location.coordinates[1]}, ${issue.location.coordinates[0]}` : 'City Site',
            'description': `Assigned to: ${officer.email}\n\nAssignment Details:\n${assignment.notes || 'No notes provided'}\n\nIssue Description:\n${issue.description}`,
            'start': {
                'dateTime': startTime.toISOString(),
                'timeZone': 'UTC',
            },
            'end': {
                'dateTime': endTime.toISOString(),
                'timeZone': 'UTC',
            },
            'reminders': {
                'useDefault': false,
                'overrides': [
                    { 'method': 'popup', 'minutes': 30 },
                ],
            },
        };

        // Use shared calendar if configured, otherwise try officer's email or primary
        const calendarId = process.env.GOOGLE_SHARED_CALENDAR_ID || officer.email || 'primary';

        const response = await calendar.events.insert({
            calendarId: calendarId,
            resource: event,
            sendUpdates: 'all',
        });

        console.log('✅ Calendar event created successfully!');
        console.log('   Event ID:', response.data.id);
        console.log('   Link:', response.data.htmlLink);
        return response.data;
    } catch (error) {
        // Provide detailed error information
        console.error('❌ Google Calendar Error Details:');
        console.error('   Status Code:', error.code);
        console.error('   Message:', error.message);
        if (error.errors) {
            console.error('   Errors:', JSON.stringify(error.errors, null, 2));
        }
        
        if (error.code === 401) {
            console.error('   → Issue: Service account authentication failed');
            console.error('   → Fix: Check GOOGLE_PRIVATE_KEY in .env');
        } else if (error.code === 403) {
            console.error('   → Issue: Permission denied or API not enabled');
            console.error('   → Fix 1: Make sure Calendar API is enabled in Google Cloud Console');
            console.error('   → Fix 2: Verify service account has "Make changes to events" permission');
        } else if (error.code === 404) {
            console.error('   → Issue: Calendar not found');
            console.error('   → Fix: Verify GOOGLE_SHARED_CALENDAR_ID is correct');
        }
        
        // Don't throw - allow assignment creation to continue
        return null;
    }
};

module.exports = {
    createAssignmentEvent
};
