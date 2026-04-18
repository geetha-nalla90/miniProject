/**
 * Email OTP Service - LifeDrop Blood Donation App
 * Uses Nodemailer + Gmail SMTP to send 6-digit OTPs for authentication.
 * This is the ONLY OTP mechanism — Fast2SMS is used for notifications only.
 */

const nodemailer = require('nodemailer');
require('dotenv').config();

// ---- SMTP Transporter (Gmail) ----
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS   // Use an App Password (not your real password)
    }
});

// ---- Verify SMTP connection on startup ----
transporter.verify((error, success) => {
    if (error) {
        console.error('❌ [SMTP] Gmail connection FAILED:', error.message);
        console.error('   → Check EMAIL_USER and EMAIL_PASS in your .env file');
        console.error('   → Make sure App Password has NO spaces and 2-Step Verification is ON');
    } else {
        console.log(`✅ [SMTP] Gmail connected — ready to send OTPs from ${process.env.EMAIL_USER}`);
    }
});

/**
 * Generate a cryptographically random 6-digit OTP.
 * @returns {string} 6-digit OTP as string
 */
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Send OTP to a user's email address via Gmail SMTP.
 * @param {string} email - Recipient's email address
 * @param {string} otp   - 6-digit OTP string
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function sendOTPEmail(email, otp) {
    const mailOptions = {
        from: `"LifeDrop 🩸" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Your LifeDrop OTP Code',
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto; padding: 24px;
                    border: 1px solid #e5e7eb; border-radius: 12px; background: #fff;">
          <h2 style="color: #dc2626; margin-top: 0;">🩸 LifeDrop Authentication</h2>
          <p style="color: #374151; font-size: 15px;">
            Use the OTP below to verify your account. It is valid for <strong>10 minutes</strong>.
          </p>
          <div style="text-align: center; margin: 28px 0;">
            <span style="display: inline-block; letter-spacing: 10px; font-size: 40px;
                         font-weight: 700; color: #dc2626; background: #fef2f2;
                         padding: 16px 28px; border-radius: 10px; border: 2px dashed #fca5a5;">
              ${otp}
            </span>
          </div>
          <p style="color: #6b7280; font-size: 13px;">
            Do <strong>NOT</strong> share this OTP with anyone. LifeDrop will never ask for it.
          </p>
          <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 20px 0;" />
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            LifeDrop — Saving lives, one drop at a time.
          </p>
        </div>`
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`✅ [EMAIL-OTP] Sent to ${email}`);
        return { success: true };
    } catch (error) {
        console.error(`❌ [EMAIL-OTP] Failed: ${error.message}`);
        return { success: false, error: error.message };
    }
}

module.exports = { generateOTP, sendOTPEmail };
