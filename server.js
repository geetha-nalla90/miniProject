const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const twilio = require('twilio');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for Base64 images

// Serve static files (HTML, CSS, JS)
app.use(express.static(__dirname));

// Route to serve index.html for root path
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Route to serve dashboard.html
app.get('/dashboard', (req, res) => {
    res.sendFile(__dirname + '/dashboard.html');
});

// 1. Database Setup
const db = new sqlite3.Database('./bloodbank.db', (err) => {
    if (err) console.error(err.message);
    else console.log('Connected to SQLite database.');
});

// Central store for OTP verification
const otpStore = new Map();

// Create Tables
db.serialize(() => {
    // Drop old table if it exists and recreate with new schema
    db.run(`DROP TABLE IF EXISTS users`, (err) => {
        if (err) console.log("Note: No old users table found");
    });
    
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT,
        phone TEXT UNIQUE,
        role TEXT,
        bloodType TEXT,
        city TEXT,
        age TEXT,
        gender TEXT,
        diseases TEXT,
        lastDonationDate TEXT,
        availability TEXT,
        medicalReportUrl TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS requests (
        id TEXT PRIMARY KEY, seekerId TEXT, bloodType TEXT, quantity INTEGER, 
        location TEXT, urgency TEXT, status TEXT, timestamp TEXT, donorId TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS chats (
        id INTEGER PRIMARY KEY AUTOINCREMENT, requestId TEXT, senderId TEXT, 
        text TEXT, timestamp TEXT
    )`);
});

// 2. REST API Routes

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || 'mock_sid';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || 'mock_token';
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || '+1234567890';
const twilioClient = TWILIO_ACCOUNT_SID !== 'mock_sid' ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) : null;

// ---- OTP Endpoints ----
app.post('/api/send-sms-otp', async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number required' });

    // Generate random 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 mins

    otpStore.set(phone, { otp, expiresAt });

    try {
        if (twilioClient) {
            await twilioClient.messages.create({
                body: `Your LifeDrop OTP code is: ${otp}. Valid for 5 minutes.`,
                from: TWILIO_PHONE_NUMBER,
                to: phone // Format must be E.164 (+1234567890)
            });
            console.log(`\n[TWILIO SMS] Server successfully sent OTP to ${phone}\n`);
            return res.json({ success: true, message: 'OTP sent via SMS' });
        } else {
            console.log(`\n[OFFLINE SMS] Server successfully mocked OTP for ${phone}: ${otp}\n(Note: Set TWILIO_ACCOUNT_SID & TWILIO_AUTH_TOKEN in server.js environment to send real offline SMS)\n`);
            return res.json({ success: true, message: 'OTP generated', demoOtp: otp });
        }
    } catch (err) {
        console.error("Twilio SMS Error: ", err);
        return res.status(500).json({ error: 'Failed to send SMS OTP. ' + err.message });
    }
});

app.post('/api/verify-sms-otp', (req, res) => {
    const { phone, otp } = req.body;
    const record = otpStore.get(phone);

    if (!record) return res.status(400).json({ error: 'OTP not requested or expired.' });
    if (Date.now() > record.expiresAt) {
        otpStore.delete(phone);
        return res.status(400).json({ error: 'OTP has expired.' });
    }
    if (record.otp !== otp) {
        return res.status(400).json({ error: 'Invalid OTP code.' });
    }

    otpStore.delete(phone);
    res.json({ success: true });
});

// Register User
app.post('/api/register', (req, res) => {
    const { id, name, phone, role, bloodType, city, age, gender, diseases, lastDonationDate, availability, medicalReportUrl } = req.body;

    // Validate phone format (10-11 digits for India/UK support)
    const cleanPhone = phone.replace(/\D/g, '');
    if (!phone || cleanPhone.length < 10 || cleanPhone.length > 11) {
        return res.status(400).json({ error: 'Invalid phone number. Please enter a valid 10-11 digit number.' });
    }

    const query = `INSERT INTO users (id, name, phone, role, bloodType, city, age, gender, diseases, lastDonationDate, availability, medicalReportUrl) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    db.run(query, [id, name, phone, role, bloodType, city, age, gender, diseases, lastDonationDate, availability, medicalReportUrl], function (err) {
        if (err) {
            console.error("Registration Error:", err.message);
            return res.status(400).json({ error: 'Phone number already registered. Please Login.' });
        }
        res.json({ success: true, message: 'User registered successfully' });
    });
});

// Get User by Phone (Login)
app.get('/api/users/:phone', (req, res) => {
    db.get(`SELECT * FROM users WHERE phone = ?`, [req.params.phone], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'User not found. Please Register first.' });
        res.json(row);
    });
});

// Create Blood Request
app.post('/api/requests', (req, res) => {
    const { id, seekerId, bloodType, quantity, location, urgency } = req.body;
    const timestamp = new Date().toISOString();
    db.run(`INSERT INTO requests (id, seekerId, bloodType, quantity, location, urgency, status, timestamp) 
            VALUES (?, ?, ?, ?, ?, ?, 'Open', ?)`,
        [id, seekerId, bloodType, quantity, location, urgency, timestamp], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            io.emit('new_request');
            res.json({ success: true, id });
        });
});

// Update User
app.post('/api/users/:id/update', (req, res) => {
    const { name, bloodType, age, gender, lastDonationDate, availability, diseases, medicalReportUrl, city } = req.body;
    
    // Build update query dynamically to preserve fields that aren't being updated
    let updateFields = [];
    let updateValues = [];

    // Only update fields that are provided
    if (name !== undefined) {
        updateFields.push('name = ?');
        updateValues.push(name);
    }
    if (bloodType !== undefined && bloodType !== null && bloodType !== '') {
        // Only update bloodType if it's not empty - prevents it from becoming N/A
        updateFields.push('bloodType = ?');
        updateValues.push(bloodType);
    }
    if (age !== undefined) {
        updateFields.push('age = ?');
        updateValues.push(age);
    }
    if (gender !== undefined) {
        updateFields.push('gender = ?');
        updateValues.push(gender);
    }
    if (lastDonationDate !== undefined) {
        updateFields.push('lastDonationDate = ?');
        updateValues.push(lastDonationDate);
    }
    if (availability !== undefined) {
        updateFields.push('availability = ?');
        updateValues.push(availability);
    }
    if (diseases !== undefined) {
        updateFields.push('diseases = ?');
        updateValues.push(diseases);
    }
    if (medicalReportUrl !== undefined) {
        updateFields.push('medicalReportUrl = ?');
        updateValues.push(medicalReportUrl);
    }
    if (city !== undefined) {
        updateFields.push('city = ?');
        updateValues.push(city);
    }

    if (updateFields.length === 0) {
        return res.json({ success: true, message: 'No fields to update' });
    }

    updateValues.push(req.params.id);
    const updateQuery = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;

    db.run(updateQuery, updateValues, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        
        // Fetch and return the updated user data
        db.get('SELECT * FROM users WHERE id = ?', [req.params.id], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, user: row });
        });
    });
});

// Get Requests
app.get('/api/requests', (req, res) => {
    db.all(`SELECT r.*, u1.name as seekerName, u1.phone as seekerPhone, 
                   u2.name as donorName, u2.phone as donorPhone 
            FROM requests r 
            LEFT JOIN users u1 ON r.seekerId = u1.id 
            LEFT JOIN users u2 ON r.donorId = u2.id 
            ORDER BY r.timestamp DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Accept a Request
app.post('/api/requests/:id/accept', (req, res) => {
    const { donorId } = req.body;
    db.run(`UPDATE requests SET status = 'Accepted', donorId = ? WHERE id = ? AND status = 'Open'`,
        [donorId, req.params.id], function (err) {
            if (err || this.changes === 0) return res.status(400).json({ error: 'Failed to accept request.' });
            io.emit('request_updated', req.params.id);
            res.json({ success: true });
        });
});

// Complete a Request
app.post('/api/requests/:id/complete', (req, res) => {
    db.run(`UPDATE requests SET status = 'Completed' WHERE id = ?`, [req.params.id], function (err) {
        if (err || this.changes === 0) return res.status(400).json({ error: 'Failed to complete.' });
        io.emit('request_updated', req.params.id);
        res.json({ success: true });
    });
});

// 3. Real-Time Chat (Socket.io)
io.on('connection', (socket) => {
    socket.on('join_chat', (requestId) => socket.join(requestId));

    socket.on('send_message', (data) => {
        const { requestId, senderId, text } = data;
        const timestamp = new Date().toISOString();
        db.run(`INSERT INTO chats (requestId, senderId, text, timestamp) VALUES (?, ?, ?, ?)`,
            [requestId, senderId, text, timestamp], () => {
                io.to(requestId).emit('receive_message', { requestId, senderId, text, timestamp });
            });
    });
});

app.get('/api/chats/:requestId', (req, res) => {
    db.all(`SELECT * FROM chats WHERE requestId = ? ORDER BY timestamp ASC`, [req.params.requestId], (err, rows) => {
        res.json(rows || []);
    });
});

// Start Server
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Backend Server running on http://localhost:${PORT}`);
});
