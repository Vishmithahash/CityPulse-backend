const nodemailer = require('nodemailer');
const sgMail = require('@sendgrid/mail');

// Set API Key from env
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

function ensureApiKey() {
  if (!process.env.SENDGRID_API_KEY) {
    console.warn('⚠️ SENDGRID_API_KEY is missing in environment variables');
  } else {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  }
}

class EmailService {
  static async sendToCitizen(issue, officer) {
    ensureApiKey();
    const citizenEmail = issue.reportedBy?.email || (typeof issue.reportedBy === 'string' ? null : issue.reportedBy?.email);

    if (!citizenEmail) {
      console.warn('⚠️ Cannot send email to citizen: Email address is missing (is reportedBy populated?)');
      console.log('reportedBy state:', JSON.stringify(issue.reportedBy));
      return;
    }

    const msg = {
      to: citizenEmail,
      from: process.env.FROM_EMAIL,
      subject: `✅ Issue Assigned - ${issue.title}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
          <div style="background: #2563eb; padding: 20px; text-align: center;">
            <h2 style="color: white; margin: 0;">Your Issue Has Been Assigned! 🎉</h2>
          </div>
          <div style="padding: 20px;">
            <p><strong>Title:</strong> ${issue.title || 'N/A'}</p>
            <p><strong>Category:</strong> <span style="text-transform: capitalize;">${issue.category || 'N/A'}</span></p>
            <p><strong>Priority:</strong> <span style="color: #ef4444; font-weight: bold;">${(issue.priority || 'medium').toUpperCase()}</span></p>
            <p><strong>Location:</strong> ${issue.location?.address || issue.formattedLocation || 'N/A'}</p>
            <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;">
            <h3 style="color: #059669;">Assigned to Officer:</h3>
            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px;">
              <p style="margin: 0;"><strong>${officer?.name || 'Assigned Officer'}</strong></p>
              <p style="margin: 5px 0 0 0;"><small>${officer?.role || 'Officer'} - ${officer?.phone || 'N/A'}</small></p>
            </div>
            <p style="margin-top: 20px;"><em>Track progress in your dashboard or reply to this email if urgent.</em></p>
            <div style="text-align: center; margin-top: 30px; margin-bottom: 10px;">
              <a href="${process.env.APP_URL}/issues/${issue._id}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">View Issue Details</a>
            </div>
          </div>
        </div>
      `
    };
    try {
      console.log(`✉️ Sending Assignment Email to Citizen: ${citizenEmail}`);
      await sgMail.send(msg);
      console.log('✅ Citizen notification sent');
    } catch (error) {
      console.error('❌ Citizen email failed:', error.message);
      if (error.response) {
        console.error(error.response.body);
      }
    }
  }

  static async sendToOfficer(issue, officer, citizen) {
    ensureApiKey();
    if (!officer?.email) {
      console.warn('⚠️ Cannot send email to officer: Email address is missing');
      return;
    }

    const msg = {
      to: officer.email,
      from: process.env.FROM_EMAIL,
      subject: `📋 New Assignment: ${issue.title}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
          <div style="background: #dc2626; padding: 20px; text-align: center;">
            <h2 style="color: white; margin: 0;">NEW ASSIGNMENT RECEIVED 🚨</h2>
          </div>
          <div style="padding: 20px;">
            <div style="background: #fef3c7; padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b; margin-bottom: 20px;">
              <p style="margin: 0;"><strong>Priority:</strong> <span style="font-size: 18px;">${(issue.priority || 'medium').toUpperCase()}</span></p>
            </div>
            <h3>Issue Details:</h3>
            <p><strong>Title:</strong> ${issue.title || 'N/A'}</p>
            <p><strong>Description:</strong> ${(issue.description || '').substring(0, 200)}...</p>
            <p><strong>Category:</strong> ${issue.category || 'N/A'}</p>
            <p><strong>Location:</strong> ${issue.location?.address || issue.formattedLocation || 'N/A'}</p>
            
            <h4 style="margin-top: 20px;">Reported by:</h4>
            <div style="background: #f3f4f6; padding: 15px; border-radius: 8px;">
              <p style="margin: 0;"><strong>${citizen?.name || 'Citizen'}</strong></p>
              <p style="margin: 5px 0 0 0;"><small>${citizen?.email || 'N/A'} | ${citizen?.phone || 'N/A'}</small></p>
            </div>
            
            <div style="display: flex; gap: 10px; margin: 30px 0;">
              <a href="${process.env.APP_URL}/issues/${issue._id}" style="flex: 1; background: #059669; color: white; padding: 12px; text-decoration: none; text-align: center; border-radius: 8px; font-weight: bold;">Accept Assignment</a>
              <a href="${process.env.APP_URL}/assignments/me" style="flex: 1; background: #6b7280; color: white; padding: 12px; text-decoration: none; text-align: center; border-radius: 8px; font-weight: bold;">View All Assignments</a>
            </div>
          </div>
        </div>
      `
    };
    try {
      console.log(`✉️ Sending Assignment Email to Officer: ${officer.email}`);
      await sgMail.send(msg);
      console.log('✅ Officer notification sent');
    } catch (error) {
      console.error('❌ Officer email failed:', error.message);
      if (error.response) {
        console.error(error.response.body);
      }
    }
  }

  static async sendStatusUpdateToCitizen(issue, status) {
    let statusText = status === 'in-progress' ? 'is now In Progress 🚧' : 'has been Resolved! ✅';
    let color = status === 'in-progress' ? '#f59e0b' : '#059669';
    let message = status === 'in-progress'
      ? 'An officer has started working on your issue. We will keep you updated on the progress.'
      : 'Great news! Your reported issue has been marked as resolved. Please check the details and provide your feedback if possible.';

    const msg = {
      to: issue.reportedBy.email,
      from: process.env.FROM_EMAIL,
      subject: `🔄 Issue Update: ${issue.title}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
          <div style="background: ${color}; padding: 20px; text-align: center;">
            <h2 style="color: white; margin: 0;">Issue ${statusText}</h2>
          </div>
          <div style="padding: 20px;">
            <p><strong>Title:</strong> ${issue.title}</p>
            <p><strong>Status:</strong> <span style="text-transform: capitalize; font-weight: bold; color: ${color};">${status.replace('-', ' ')}</span></p>
            <p>${message}</p>
            <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;">
            <div style="text-align: center; margin-top: 30px; margin-bottom: 10px;">
              <a href="${process.env.APP_URL}/issues/${issue._id}" style="background: ${color}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">View Details</a>
            </div>
          </div>
        </div>
      `
    };
    try {
      await sgMail.send(msg);
      console.log(`✅ Citizen status update (${status}) sent`);
    } catch (error) {
      console.error(`❌ Citizen status update (${status}) email failed:`, error.message);
    }
  }

  static async sendIssueReportedEmail(issue, citizen) {
    ensureApiKey();
    if (!citizen?.email) {
      console.warn('⚠️ Cannot send welcome email: Citizen email is missing');
      return;
    }
    const msg = {
      to: citizen.email,
      from: process.env.FROM_EMAIL,
      subject: `📥 Issue Report Received: ${issue.title}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
          <div style="background: #6366f1; padding: 20px; text-align: center;">
            <h2 style="color: white; margin: 0;">We've Received Your Report! 📥</h2>
          </div>
          <div style="padding: 20px;">
            <p>Hello ${citizen.name},</p>
            <p>Thank you for reporting an issue to CityPulse. Our team has received your report and we will review it shortly.</p>
            <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Issue ID:</strong> #${issue?._id || 'N/A'}</p>
              <p><strong>Title:</strong> ${issue?.title || 'N/A'}</p>
              <p><strong>Category:</strong> ${issue?.category || 'N/A'}</p>
              <p><strong>Priority:</strong> ${(issue?.priority || 'medium').toUpperCase()}</p>
            </div>
            <p>You can track the progress of your report through your dashboard.</p>
            <div style="text-align: center; margin-top: 30px; margin-bottom: 10px;">
              <a href="${process.env.APP_URL}/issues/${issue._id}" style="background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Track My Issue</a>
            </div>
          </div>
        </div>
      `
    };
    try {
      console.log(`✉️ Sending Welcome Email to: ${citizen.email} from: ${process.env.FROM_EMAIL}`);
      await sgMail.send(msg);
      console.log('✅ Citizen welcome email sent');
    } catch (error) {
      console.error('❌ Citizen welcome email failed:', error.message);
      if (error.response) console.error(error.response.body);
    }
  }
}

module.exports = EmailService;
