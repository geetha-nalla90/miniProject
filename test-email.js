require('dotenv').config();
const nodemailer = require('nodemailer');

const t = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

t.sendMail({
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_USER,   // sends to itself as a test
    subject: 'LifeDrop Test OTP',
    text: 'Your test OTP is: 123456. If you received this, email is working!'
}, (err, info) => {
    if (err) {
        console.log('SEND FAILED:', err.message);
    } else {
        console.log('SUCCESS! Email sent. Message ID:', info.messageId);
        console.log('Check inbox of:', process.env.EMAIL_USER, '(also check SPAM folder)');
    }
});
