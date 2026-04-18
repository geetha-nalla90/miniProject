/**
 * SMS Notification Service — LifeDrop Blood Donation App
 * Uses Fast2SMS ONLY for sending blood request notifications to eligible donors.
 * OTP authentication is handled separately by email-service.js
 */

const axios = require('axios');
require('dotenv').config();

const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY;
const FAST2SMS_BASE_URL = 'https://www.fast2sms.com/dev/bulkV2';

/**
 * Send Blood Request Notification SMS to a donor via Fast2SMS.
 * @param {string} phoneNumber - Donor's phone number (10 digits)
 * @param {string} bloodType   - Blood type needed
 * @param {string} urgency     - 'urgent' | 'normal'
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function sendBloodRequestNotification(phoneNumber, bloodType, urgency = 'normal') {
    if (!FAST2SMS_API_KEY) {
        console.warn('⚠️  [Fast2SMS] API key not set. Skipping notification.');
        return { success: false, error: 'Fast2SMS API key not configured.' };
    }

    try {
        const cleanedNumber = phoneNumber.replace(/[^\d]/g, '').slice(-10);

        if (cleanedNumber.length !== 10) {
            throw new Error('Invalid phone number format. Must be 10 digits.');
        }

        const urgencyText = urgency === 'urgent' ? '🚨 URGENT' : '📢';
        const message = `${urgencyText} Blood Request Alert: ${bloodType} blood needed urgently. Please open the LifeDrop app to help. Thank you!`;

        const url = `${FAST2SMS_BASE_URL}?authorization=${FAST2SMS_API_KEY}&route=q&message=${encodeURIComponent(message)}&numbers=${cleanedNumber}`;

        console.log(`📱 [Fast2SMS] Sending blood request notification to +91${cleanedNumber}...`);

        const response = await axios.get(url, { timeout: 10000 });

        console.log(`✅ [Fast2SMS] Notification sent to +91${cleanedNumber}`);
        return { success: true, message: response.data };

    } catch (error) {
        console.error(`❌ [Fast2SMS] Notification failed: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Send a generic SMS notification via Fast2SMS.
 * @param {string} phoneNumber - Phone number (10 digits)
 * @param {string} message     - Message to send
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function sendSMS(phoneNumber, message) {
    if (!FAST2SMS_API_KEY) {
        console.warn('⚠️  [Fast2SMS] API key not set. Skipping SMS.');
        return { success: false, error: 'Fast2SMS API key not configured.' };
    }

    try {
        const cleanedNumber = phoneNumber.replace(/[^\d]/g, '').slice(-10);

        if (cleanedNumber.length !== 10) {
            throw new Error('Invalid phone number format.');
        }

        const url = `${FAST2SMS_BASE_URL}?authorization=${FAST2SMS_API_KEY}&route=q&message=${encodeURIComponent(message)}&numbers=${cleanedNumber}`;

        console.log(`📱 [Fast2SMS] Sending SMS to +91${cleanedNumber}...`);
        const response = await axios.get(url, { timeout: 10000 });

        console.log(`✅ [Fast2SMS] SMS sent to +91${cleanedNumber}`);
        return { success: true, message: response.data };

    } catch (error) {
        console.error(`❌ [Fast2SMS] SMS failed: ${error.message}`);
        return { success: false, error: error.message };
    }
}

module.exports = { sendBloodRequestNotification, sendSMS };
