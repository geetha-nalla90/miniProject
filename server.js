/**
 * LifeDrop - Blood Donation App Backend
 * 
 * Authentication : Email OTP via Gmail SMTP (Nodemailer)
 * Notifications  : SMS alerts via Fast2SMS (blood requests only)
 * Blood Banks    : OpenStreetMap Overpass API (free, no key needed)
 */

require('dotenv').config();

const express  = require('express');
const cors     = require('cors');
const http     = require('http');
const https    = require('https');
const { Server } = require('socket.io');
const sqlite3  = require('sqlite3').verbose();

// Services
const { generateOTP, sendOTPEmail }              = require('./services/email-service');
const { sendBloodRequestNotification, sendSMS }  = require('./services/sms-service');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve static files
app.use(express.static(__dirname));

app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));
app.get('/dashboard', (req, res) => res.sendFile(__dirname + '/dashboard.html'));

// ── Test Route ─────────────────────────────────────────────────────────────────
app.get('/api/test', (req, res) => {
    res.send('API is working fine 🚀');
});

// ── Duplicate Check (pre-OTP validation) ──────────────────────────────────────
/**
 * GET /api/check-duplicate?email=...&phone=...
 * Returns { emailExists, phoneExists } so the frontend can warn before OTP send.
 */
app.get('/api/check-duplicate', (req, res) => {
    const email = (req.query.email || '').toLowerCase().trim();
    const phone = (req.query.phone || '').replace(/\D/g, '');

    const checks = [];
    let emailExists = false;
    let phoneExists = false;

    const finish = () => res.json({ emailExists, phoneExists });

    let pending = 0;
    if (email) pending++;
    if (phone) pending++;
    if (pending === 0) return finish();

    const done = () => { pending--; if (pending === 0) finish(); };

    if (email) {
        db.get(`SELECT id FROM users WHERE email = ?`, [email], (err, row) => {
            if (!err && row) emailExists = true;
            done();
        });
    }
    if (phone) {
        db.get(`SELECT id FROM users WHERE phone = ?`, [phone], (err, row) => {
            if (!err && row) phoneExists = true;
            done();
        });
    }
});

// ── Database Setup ─────────────────────────────────────────────────────────────
const db = new sqlite3.Database('./bloodbank.db', (err) => {
    if (err) console.error(err.message);
    else console.log('✅ Connected to SQLite database.');
});

// In-memory OTP store: key = email, value = { otp, expiresAt }
const otpStore = new Map();

db.serialize(() => {
    // ── users table ────────────────────────────────────────────────────────────
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT,
        phone TEXT UNIQUE,
        blood_group TEXT,
        location TEXT,
        email_verified INTEGER DEFAULT 0,
        age TEXT,
        gender TEXT,
        diseases TEXT,
        lastDonationDate TEXT,
        availability TEXT,
        medicalReportUrl TEXT,
        lat REAL,
        lng REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // ── blood_requests table ───────────────────────────────────────────────────
    db.run(`CREATE TABLE IF NOT EXISTS blood_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        blood_group TEXT NOT NULL,
        quantity INTEGER,
        location TEXT NOT NULL,
        urgency TEXT,
        message TEXT,
        status TEXT DEFAULT 'Open',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        donorId INTEGER,
        bloodBankResult TEXT,
        donorNotified INTEGER DEFAULT 0,
        target_user_id INTEGER,
        availableUnits INTEGER,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // ── request_recipients table ───────────────────────────────────────────────
    db.run(`CREATE TABLE IF NOT EXISTS request_recipients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id INTEGER,
        receiver_id INTEGER,
        is_seen INTEGER DEFAULT 0,
        is_responded INTEGER DEFAULT 0,
        FOREIGN KEY (request_id) REFERENCES blood_requests(id),
        FOREIGN KEY (receiver_id) REFERENCES users(id)
    )`);

    // ── chats table ────────────────────────────────────────────────────────────
    db.run(`CREATE TABLE IF NOT EXISTS chats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id INTEGER,
        sender_id INTEGER,
        receiver_id INTEGER,
        message TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (request_id) REFERENCES blood_requests(id)
    )`);
});

// ── Safe column migrations (run once, ignore if column already exists) ──────────
const MIGRATIONS = [
    `ALTER TABLE blood_requests ADD COLUMN target_user_id INTEGER`,
    `ALTER TABLE blood_requests ADD COLUMN availableUnits INTEGER`
];
MIGRATIONS.forEach(sql => {
    db.run(sql, err => {
        if (err && !err.message.includes('duplicate column')) {
            // Column already exists — safe to ignore
        }
    });
});

// ── Blood Bank Utility (Overpass API) ─────────────────────────────────────────

/**
 * Blood Compatibility Map
 * Key = requested blood type, Value = array of donor blood types that can donate to it.
 */
const BLOOD_COMPATIBILITY = {
    'A+':  ['A+', 'A-', 'O+', 'O-'],
    'A-':  ['A-', 'O-'],
    'B+':  ['B+', 'B-', 'O+', 'O-'],
    'B-':  ['B-', 'O-'],
    'AB+': ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
    'AB-': ['A-', 'B-', 'AB-', 'O-'],
    'O+':  ['O+', 'O-'],
    'O-':  ['O-']
};

/**
 * Haversine formula — distance between two lat/lng points in km
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * simulateFromClientBanks
 *
 * Uses the REAL hospital/blood-bank list already fetched by the browser
 * (from the map picker Overpass query) and layers a simulated availability check
 * on top. This is the primary path — no server-side Overpass call needed.
 *
 * @param {Array}  banks       Array of {name, type, lat, lon} from the browser
 * @param {string} bloodType   Requested blood group
 * @param {number} quantity    Units requested
 * @param {string} locationStr "Name|lat,lon" from the request record
 * @returns {{ available: boolean, banks: Array }}
 */
function simulateFromClientBanks(banks, bloodType, quantity, locationStr) {
    // Parse request coordinates for distance labelling
    let reqLat = null, reqLon = null;
    const parts = (locationStr || '').split('|');
    if (parts[1]) {
        const c = parts[1].split(',');
        reqLat = parseFloat(c[0]);
        reqLon = parseFloat(c[1]);
    }

    // Take up to 6 closest facilities and simulate availability
    const result = banks.slice(0, 6).map(bank => {
        const dist = (reqLat && bank.lat)
            ? haversineDistance(reqLat, reqLon, bank.lat, bank.lon)
            : null;
        const isAvailable = Math.random() < 0.60;
        const units = isAvailable ? Math.ceil(Math.random() * quantity) + 1 : 0;
        return {
            name:        bank.name,
            type:        bank.type || 'Hospital',
            distanceKm:  dist ? dist.toFixed(1) : 'N/A',
            contact:     bank.tags && bank.tags.phone ? bank.tags.phone : '+91 ' + Math.floor(8000000000 + Math.random() * 1000000000),
            available:   isAvailable,
            units,
            bloodType
        };
    });

    const hasStock = result.some(b => b.available && b.units > 0);
    console.log(`🏥 [BloodBank] simulateFromClientBanks: ${result.length} facilities, available=${hasStock}`);
    return { available: hasStock, banks: result };
}

/**
 * Query Overpass API for hospitals/blood banks within 10 km and simulate availability.
 * @param {string} locationStr  - "Hospital Name|lat,lng" or plain location text
 * @param {string} bloodType    - blood type needed
 * @param {number} quantity     - units requested
 * @returns {Promise<{available: boolean, banks: Array}>}
 */
async function checkNearbyBloodBanks(locationStr, bloodType, quantity) {
    try {
        // Parse lat/lng from location string format "Name|lat,lng"
        const parts = locationStr.split('|');
        const coordsStr = parts[1];

        let lat = 17.3850; // default: Hyderabad
        let lon = 78.4867;

        if (coordsStr) {
            const c = coordsStr.split(',');
            lat = parseFloat(c[0]);
            lon = parseFloat(c[1]);
        }

        const radius = 10000; // 10 km
        const query = `
            [out:json][timeout:15];
            (
              node["amenity"="hospital"](around:${radius},${lat},${lon});
              node["healthcare"="blood_bank"](around:${radius},${lat},${lon});
              way["amenity"="hospital"](around:${radius},${lat},${lon});
              way["healthcare"="blood_bank"](around:${radius},${lat},${lon});
            );
            out center;
        `;

        console.log(`🔍 [BloodBank] Querying Overpass API for banks near ${lat},${lon}...`);

        const data = await new Promise((resolve, reject) => {
            const postData = query;
            const options = {
                hostname: 'overpass-api.de',
                path: '/api/interpreter',
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };
            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    // Guard against XML error responses from Overpass
                    const contentType = res.headers['content-type'] || '';
                    if (contentType.includes('xml') || body.trim().startsWith('<')) {
                        reject(new Error('Overpass returned XML (rate-limited or query error)'));
                        return;
                    }
                    try { resolve(JSON.parse(body)); }
                    catch (e) { reject(new Error('Overpass JSON parse failed: ' + e.message)); }
                });
            });
            req.on('error', reject);
            req.setTimeout(6000, () => { req.destroy(); reject(new Error('Overpass timeout (6s)')); });
            req.write(postData);
            req.end();
        });

        const elements = (data.elements || []).filter(el => el.tags && el.tags.name);

        // Build list of named facilities with simulated availability
        const banks = elements.slice(0, 8).map(el => {
            const elLat = el.center ? el.center.lat : el.lat;
            const elLon = el.center ? el.center.lon : el.lon;
            const dist = (elLat && elLon) ? haversineDistance(lat, lon, elLat, elLon) : null;

            // 50% chance available, random quantity between 1 and max requested
            const isAvailable = Math.random() < 0.50;
            const availableUnits = isAvailable ? Math.ceil(Math.random() * quantity) : 0;
            const phone = el.tags.phone || '+91 ' + Math.floor(8000000000 + Math.random() * 1000000000);

            return {
                name: el.tags.name,
                type: el.tags['healthcare'] === 'blood_bank' ? 'Blood Bank' : 'Hospital',
                contact: phone,
                distanceKm: dist ? dist.toFixed(1) : 'N/A',
                available: isAvailable,
                units: availableUnits,
                bloodType
            };
        });

        // If no banks found, generate 2 simulated nearby banks
        if (banks.length === 0) {
            console.log('⚠️  [BloodBank] No real banks from Overpass; using simulated fallback.');
            ['City Central Blood Bank', 'Regional Medical Centre'].forEach((name, i) => {
                const isAvailable = Math.random() < 0.50;
                banks.push({
                    name,
                    type: i === 0 ? 'Blood Bank' : 'Hospital',
                    distanceKm: (Math.random() * 8 + 1).toFixed(1),
                    contact: '+91 ' + Math.floor(8000000000 + Math.random() * 1000000000),
                    available: isAvailable,
                    units: isAvailable ? Math.ceil(Math.random() * quantity) : 0,
                    bloodType
                });
            });
        }

        const availableBanks = banks.filter(b => b.available && b.units > 0);
        const hasAvailability = availableBanks.length > 0;

        console.log(`✅ [BloodBank] Found ${banks.length} banks. Available: ${hasAvailability}`);
        return { available: hasAvailability, banks };

    } catch (err) {
        console.error(`❌ [BloodBank] Overpass error: ${err.message}`);
        // Fallback: simulate with 50/50 random
        const isAvailable = Math.random() < 0.50;
        return {
            available: isAvailable,
            banks: [{
                name: 'Nearby Blood Bank (simulated)',
                type: 'Blood Bank',
                distanceKm: (Math.random() * 5 + 1).toFixed(1),
                contact: '+91 ' + Math.floor(8000000000 + Math.random() * 1000000000),
                available: isAvailable,
                units: isAvailable ? Math.ceil(Math.random() * quantity) : 0,
                bloodType
            }]
        };
    }
}

// ── OTP Endpoints (Email-based) ────────────────────────────────────────────────

/**
 * POST /api/send-email-otp
 * Sends a 6-digit OTP to the user's email address.
 */
app.post('/api/send-email-otp', async (req, res) => {
    const { email } = req.body;

    if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'A valid email address is required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Rate-limit: block resend if OTP still valid
    const existing = otpStore.get(normalizedEmail);
    if (existing && Date.now() < existing.expiresAt) {
        const remainingSeconds = Math.ceil((existing.expiresAt - Date.now()) / 1000);
        return res.status(429).json({
            error: `OTP already sent. Please wait ${remainingSeconds} seconds before retrying.`,
            remainingSeconds
        });
    }

    const otp       = generateOTP();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    otpStore.set(normalizedEmail, { otp, expiresAt });

    const result = await sendOTPEmail(normalizedEmail, otp);

    if (result.success) {
        console.log(`\n✅ [OTP] Sent to ${normalizedEmail}\n`);
        return res.json({ success: true, message: 'OTP sent to your email address.' });
    } else {
        // Clean up store on failure so user can retry immediately
        otpStore.delete(normalizedEmail);
        console.error(`\n❌ [OTP] Failed for ${normalizedEmail}: ${result.error}\n`);
        return res.status(500).json({ error: 'Failed to send OTP email. ' + result.error });
    }
});

/**
 * POST /api/verify-email-otp
 * Verifies the OTP entered by the user.
 */
app.post('/api/verify-email-otp', (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ error: 'Email and OTP are required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const record = otpStore.get(normalizedEmail);

    if (!record) {
        return res.status(400).json({ error: 'No OTP found for this email. Please request a new one.' });
    }

    if (Date.now() > record.expiresAt) {
        otpStore.delete(normalizedEmail);
        return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
    }

    if (record.otp !== otp.toString().trim()) {
        return res.status(400).json({ error: 'Invalid OTP. Please check your email and try again.' });
    }

    otpStore.delete(normalizedEmail);
    return res.json({ success: true, message: 'OTP verified successfully.' });
});

// ── Login — get user by email ──────────────────────────────────────────────────
app.get('/api/users/email/:email', (req, res) => {
    const email = decodeURIComponent(req.params.email).toLowerCase().trim();
    db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, row) => {
        if (err)  return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'No account found with this email. Please register first.' });
        res.json(row);
    });
});

// ── Register User ──────────────────────────────────────────────────────────────
app.post('/api/register', (req, res) => {
    // Note: 'id' from frontend is ignored as DB uses AUTOINCREMENT
    // 'role' is intentionally ignored (unified user system)
    const {
        name, phone, email, bloodType, city, location,
        age, gender, diseases, lastDonationDate, availability, medicalReportUrl
    } = req.body;

    // Support both old and new payload keys
    const bloodGroupValue = req.body.blood_group || bloodType;
    const locationValue = req.body.location || city || location;

    // Basic phone validation
    const cleanPhone = (phone || '').replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 10 || cleanPhone.length > 11) {
        return res.status(400).json({ error: 'Invalid phone number. Please enter a valid 10-digit number.' });
    }

    if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'A valid email address is required.' });
    }

    const query = `
        INSERT INTO users
          (name, phone, email, email_verified, blood_group, location, age, gender, diseases, lastDonationDate, availability, medicalReportUrl)
        VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(
        query,
        [name, cleanPhone, email.toLowerCase().trim(), bloodGroupValue, locationValue, age, gender, diseases, lastDonationDate, availability, medicalReportUrl],
        function (err) {
            if (err) {
                console.error('Registration Error:', err.message);
                if (err.message.includes('UNIQUE')) {
                    return res.status(400).json({ error: 'Phone or email already registered. Please login instead.' });
                }
                return res.status(400).json({ error: err.message });
            }
            // Return the auto-generated integer ID
            res.json({ success: true, user_id: this.lastID, message: 'User registered successfully.' });
        }
    );
});

// ── Get User by Phone (legacy / chat context) ──────────────────────────────────
app.get('/api/users/:phone', (req, res) => {
    db.get(`SELECT * FROM users WHERE phone = ?`, [req.params.phone], (err, row) => {
        if (err)  return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'User not found.' });
        res.json(row);
    });
});

// ── Update User ────────────────────────────────────────────────────────────────
app.post('/api/users/:id/update', (req, res) => {
    const { name, bloodType, age, gender, lastDonationDate, availability, diseases, medicalReportUrl, city, location, blood_group } = req.body;

    const fields = [];
    const values = [];

    if (name             !== undefined) { fields.push('name = ?');             values.push(name); }
    
    const bg = blood_group || bloodType;
    if (bg               !== undefined && bg !== null && bg !== '') {
                                          fields.push('blood_group = ?');      values.push(bg);   }
    
    if (age              !== undefined) { fields.push('age = ?');               values.push(age); }
    if (gender           !== undefined) { fields.push('gender = ?');            values.push(gender); }
    if (lastDonationDate !== undefined) { fields.push('lastDonationDate = ?');  values.push(lastDonationDate); }
    if (availability     !== undefined) { fields.push('availability = ?');      values.push(availability); }
    if (diseases         !== undefined) { fields.push('diseases = ?');          values.push(diseases); }
    if (medicalReportUrl !== undefined) { fields.push('medicalReportUrl = ?');  values.push(medicalReportUrl); }

    const loc = location || city;
    if (loc              !== undefined) { fields.push('location = ?');          values.push(loc); }

    if (fields.length === 0) {
        return res.json({ success: true, message: 'No fields to update.' });
    }

    values.push(req.params.id);
    db.run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        db.get('SELECT * FROM users WHERE id = ?', [req.params.id], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, user: row });
        });
    });
});

// ── Update Donor Location ──────────────────────────────────────────────────────
/**
 * POST /api/donors/update-location
 * Updates a donor's real-time lat/lng in the users table.
 * Called when the donor opens their dashboard.
 */
app.post('/api/donors/update-location', (req, res) => {
    const { donorId, lat, lng } = req.body;

    if (!donorId || lat == null || lng == null) {
        return res.status(400).json({ error: 'donorId, lat, and lng are required.' });
    }

    db.run(
        `UPDATE users SET lat = ?, lng = ? WHERE id = ?`,
        [lat, lng, donorId],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            console.log(`📍 [Location] Updated donor ${donorId}: ${lat}, ${lng}`);
            res.json({ success: true });
        }
    );
});

// ── Fetch All Donors ───────────────────────────────────────────────────────────
app.get('/api/donors', (req, res) => {
    db.all(`SELECT id, name, blood_group, location, age, gender FROM users WHERE availability != 'No'`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ── Blood Requests ─────────────────────────────────────────────────────────────

/**
 * Search Overpass API for blood banks + hospitals within radiusM metres.
 * Returns array of { name, type, lat, lon, contact }.
 * Falls back to 2 simulated entries on timeout / error.
 */
async function fetchNearbyBanksFromOverpass(lat, lon, radiusM = 10000) {
    const query = `
        [out:json][timeout:8];
        (
          node["amenity"="hospital"](around:${radiusM},${lat},${lon});
          node["healthcare"="blood_bank"](around:${radiusM},${lat},${lon});
          way["amenity"="hospital"](around:${radiusM},${lat},${lon});
          way["healthcare"="blood_bank"](around:${radiusM},${lat},${lon});
        );
        out center;
    `;
    try {
        const data = await new Promise((resolve, reject) => {
            const options = {
                hostname: 'overpass-api.de',
                path: '/api/interpreter',
                method: 'POST',
                headers: { 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(query) }
            };
            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', c => body += c);
                res.on('end', () => {
                    const ct = res.headers['content-type'] || '';
                    if (ct.includes('xml') || body.trim().startsWith('<')) {
                        reject(new Error('Overpass returned XML (rate-limited)'));
                        return;
                    }
                    try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
                });
            });
            req.on('error', reject);
            req.setTimeout(8000, () => { req.destroy(); reject(new Error('Overpass timeout')); });
            req.write(query);
            req.end();
        });

        const banks = (data.elements || [])
            .filter(el => el.tags && el.tags.name)
            .map(el => {
                const eLat = el.center ? el.center.lat : el.lat;
                const eLon = el.center ? el.center.lon : el.lon;
                const dist = (eLat && eLon) ? haversineDistance(lat, lon, eLat, eLon) : null;
                return {
                    name:       el.tags.name,
                    type:       el.tags['healthcare'] === 'blood_bank' ? 'Blood Bank' : 'Hospital',
                    lat:        eLat,
                    lon:        eLon,
                    distanceKm: dist ? dist.toFixed(1) : 'N/A',
                    contact:    el.tags.phone || el.tags['contact:phone'] ||
                                '+91 ' + Math.floor(8000000000 + Math.random() * 1000000000)
                };
            })
            .filter(b => b.lat && b.lon);

        if (banks.length > 0) {
            console.log(`🏥 [Overpass] Found ${banks.length} facilities within ${radiusM / 1000} km.`);
            return banks;
        }
    } catch (err) {
        console.warn(`⚠️  [Overpass] ${err.message} — using simulated fallback banks.`);
    }

    // Fallback: return 2 simulated banks
    return [
        {
            name: 'City Central Blood Bank',
            type: 'Blood Bank',
            lat: lat + 0.04, lon: lon + 0.03,
            distanceKm: (2 + Math.random() * 4).toFixed(1),
            contact: '+91 ' + Math.floor(8000000000 + Math.random() * 1000000000)
        },
        {
            name: 'Regional Medical Centre',
            type: 'Hospital',
            lat: lat - 0.03, lon: lon - 0.02,
            distanceKm: (1 + Math.random() * 3).toFixed(1),
            contact: '+91 ' + Math.floor(8000000000 + Math.random() * 1000000000)
        }
    ];
}

/**
 * Controlled-random availability decision.
 * Returns: { mode: 'available'|'partial'|'unavailable', ... }
 */
function decideAvailability(banks, requestedQty, bloodType) {
    const bank = banks[Math.floor(Math.random() * banks.length)];
    const roll = Math.random();

    if (roll < 0.40) {
        // AVAILABLE — full units
        return {
            mode:           'available',
            bank,
            requestedUnits: requestedQty,
            availableUnits: requestedQty
        };
    } else if (roll < 0.70) {
        // PARTIAL — some units
        const partial = Math.max(1, Math.floor(requestedQty * (0.3 + Math.random() * 0.6)));
        return {
            mode:           'partial',
            bank,
            requestedUnits: requestedQty,
            availableUnits: partial
        };
    } else {
        // NOT AVAILABLE
        return {
            mode:           'unavailable',
            bank,
            requestedUnits: requestedQty,
            availableUnits: 0
        };
    }
}

// Tracks auto-complete timers so manual completion can cancel them
const autoCompleteTimers = new Map();

/**
 * POST /api/requests
 * New 5-phase pipeline:
 *  1. Save row with status = BloodBankChecking, reply immediately
 *  2. Server-side Overpass search (10 km radius)
 *  3. Controlled-random: AVAILABLE (40%) / PARTIAL (30%) / NOT_AVAILABLE (30%)
 *  4. Auto-complete in 60 s for AVAILABLE / PARTIAL
 *  5. SMS eligible nearby donors for NOT_AVAILABLE
 */
app.post('/api/requests', (req, res) => {
    // Map backwards-compatible fields
    const user_id    = req.body.seekerId || req.body.user_id;
    const blood_group = req.body.bloodType || req.body.blood_group;
    const { quantity, location, urgency, message, id: oldId } = req.body;
    const msg = message || '';
    const qty = parseInt(quantity) || 1;

    // ── Targeted request (donor explicitly chosen by seeker) ──────────────────
    const target_user_id = req.body.target_user_id;
    if (target_user_id) {
        db.run(
            `INSERT INTO blood_requests (user_id, blood_group, quantity, location, urgency, message, status, target_user_id)
             VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
            [user_id, blood_group, qty, location, urgency, msg, target_user_id],
            function (err) {
                if (err) return res.status(500).json({ error: err.message });
                const reqId = this.lastID;
                io.emit('new_request');
                res.json({ success: true, id: reqId, status: 'pending', target_user_id });
            }
        );
        return;
    }

    // ── Phase 1: insert row immediately, reply to client ─────────────────────
    db.run(
        `INSERT INTO blood_requests (user_id, blood_group, quantity, location, urgency, message, status)
         VALUES (?, ?, ?, ?, ?, ?, 'BloodBankChecking')`,
        [user_id, blood_group, qty, location, urgency, msg],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });

            const reqId = this.lastID;
            io.emit('new_request');
            res.json({ success: true, id: reqId, status: 'BloodBankChecking', oldId });

            // ── Phase 2 & 3: async blood bank search + availability decision ──
            (async () => {
                // Parse coordinates from location string "Name|lat,lon"
                let reqLat = 17.3850, reqLon = 78.4867; // default Hyderabad
                const locParts = (location || '').split('|');
                const locationDisplayName = locParts[0] || location;
                if (locParts[1]) {
                    const c = locParts[1].split(',');
                    reqLat = parseFloat(c[0]) || reqLat;
                    reqLon = parseFloat(c[1]) || reqLon;
                }

                console.log(`🔍 [Request ${reqId}] Starting Overpass search at ${reqLat},${reqLon} (10 km radius)...`);

                // Fetch real banks from Overpass (10 km)
                const banks = await fetchNearbyBanksFromOverpass(reqLat, reqLon, 10000);

                // Decide availability (controlled random)
                const decision = decideAvailability(banks, qty, blood_group);
                const { mode, bank, requestedUnits, availableUnits } = decision;

                console.log(`🎲 [Request ${reqId}] Roll: ${mode.toUpperCase()} | Bank: ${bank.name} | Req: ${requestedUnits} | Avail: ${availableUnits}`);

                let finalStatus, bankResultPayload;

                if (mode === 'available') {
                    finalStatus = 'BloodBankAvailable';
                    bankResultPayload = JSON.stringify([{
                        name:           bank.name,
                        type:           bank.type,
                        distanceKm:     bank.distanceKm,
                        contact:        bank.contact,
                        available:      true,
                        units:          availableUnits,
                        requestedUnits,
                        availableUnits,
                        mode:           'available'
                    }]);
                } else if (mode === 'partial') {
                    finalStatus = 'BloodBankPartial';
                    bankResultPayload = JSON.stringify([{
                        name:           bank.name,
                        type:           bank.type,
                        distanceKm:     bank.distanceKm,
                        contact:        bank.contact,
                        available:      true,
                        units:          availableUnits,
                        requestedUnits,
                        availableUnits,
                        mode:           'partial'
                    }]);
                } else {
                    finalStatus = 'DonorNeeded';
                    bankResultPayload = JSON.stringify([{
                        name:           bank.name,
                        type:           bank.type,
                        distanceKm:     bank.distanceKm,
                        contact:        bank.contact,
                        available:      false,
                        units:          0,
                        requestedUnits,
                        availableUnits: 0,
                        mode:           'unavailable'
                    }]);
                }

                // Persist the result
                db.run(
                    `UPDATE blood_requests
                     SET status = ?, bloodBankResult = ?, availableUnits = ?, donorNotified = ?
                     WHERE id = ?`,
                    [finalStatus, bankResultPayload, availableUnits, mode === 'unavailable' ? 1 : 0, reqId],
                    function (updateErr) {
                        if (updateErr) {
                            console.error(`❌ [Request ${reqId}] DB update failed: ${updateErr.message}`);
                            return;
                        }
                        io.emit('request_updated', reqId);

                        // ── Phase 4: 60-second auto-complete for AVAILABLE / PARTIAL ──
                        if (mode === 'available' || mode === 'partial') {
                            const timer = setTimeout(() => {
                                autoCompleteTimers.delete(reqId);
                                db.run(
                                    `UPDATE blood_requests SET status = 'Completed'
                                     WHERE id = ? AND status IN ('BloodBankAvailable','BloodBankPartial')`,
                                    [reqId],
                                    function (tErr) {
                                        if (!tErr && this.changes > 0) {
                                            console.log(`✅ [Request ${reqId}] Auto-completed after 60 s (${mode}).`);
                                            io.emit('request_updated', reqId);
                                        }
                                    }
                                );
                            }, 60000);
                            autoCompleteTimers.set(reqId, timer);
                        }

                        // ── Phase 5: SMS donors if NOT AVAILABLE ──────────────────────
                        if (mode === 'unavailable') {
                            const compatibleTypes = BLOOD_COMPATIBILITY[blood_group] || [blood_group];
                            const placeholders    = compatibleTypes.map(() => '?').join(',');

                            db.all(
                                `SELECT u.id, u.phone, u.lat, u.lng, u.name
                                 FROM users u
                                 WHERE u.blood_group IN (${placeholders})
                                   AND u.availability != 'No'
                                   AND u.id != ?`,
                                [...compatibleTypes, Number(user_id)],
                                async (errDb, donors) => {
                                    if (errDb || !donors || donors.length === 0) {
                                        console.log(`ℹ️  [Request ${reqId}] No eligible donors found for SMS.`);
                                        return;
                                    }
                                    console.log(`📱 [Request ${reqId}] Sending SMS to ${donors.length} eligible donor(s)...`);
                                    for (const donor of donors) {
                                        if (donor.lat && donor.lng) {
                                            const dist = haversineDistance(reqLat, reqLon, donor.lat, donor.lng);
                                            if (dist > 20) continue;
                                        }
                                        if (donor.phone) {
                                            const smsMsg = `Urgent: Blood request needed for ${blood_group} near your location. Please accept in the app.`;
                                            await sendSMS(donor.phone, smsMsg);
                                        }
                                    }
                                }
                            );
                        }
                    }
                );
            })();
        }
    );
});

app.get('/api/requests', (req, res) => {
    // Return aliased columns so frontend doesn't break
    db.all(
        `SELECT r.id, r.user_id as seekerId, r.blood_group as bloodType, r.quantity,
                r.location, r.urgency, r.status, r.created_at as timestamp, r.donorId,
                r.bloodBankResult, r.availableUnits,
                u1.name  AS seekerName,  u1.phone AS seekerPhone,
                u2.name  AS donorName,   u2.phone AS donorPhone
         FROM blood_requests r
         LEFT JOIN users u1 ON r.user_id = u1.id
         LEFT JOIN users u2 ON r.donorId  = u2.id
         ORDER BY r.created_at DESC`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

app.get('/api/requests/new', (req, res) => {
    const userId = req.query.userId || req.user_id; // Frontend may pass it in query
    if (!userId) return res.status(400).json({ error: 'userId required' });
    db.all(
        `SELECT r.id, r.user_id as seekerId, r.blood_group as bloodType, r.quantity, 
                r.location, r.urgency, r.status, r.created_at as timestamp, r.donorId, r.target_user_id,
                u1.name  AS seekerName,  u1.phone AS seekerPhone,
                u2.name  AS donorName,   u2.phone AS donorPhone
         FROM blood_requests r
         LEFT JOIN users u1 ON r.user_id = u1.id
         LEFT JOIN users u2 ON r.donorId  = u2.id
         WHERE r.target_user_id = ? AND r.status = 'pending'
         ORDER BY r.created_at DESC`,
        [userId],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

/**
 * GET /api/requests/:id/blood-banks
 * Returns the bloodBankResult JSON for a given request.
 */
app.get('/api/requests/:id/blood-banks', (req, res) => {
    db.get(`SELECT bloodBankResult FROM blood_requests WHERE id = ?`, [req.params.id], (err, row) => {
        if (err)  return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Request not found.' });

        let banks = [];
        try { banks = JSON.parse(row.bloodBankResult || '[]'); } catch (e) {}
        res.json({ banks });
    });
});

app.post('/api/requests/:id/accept', (req, res) => {
    const { donorId } = req.body;
    const reqId = req.params.id;
    db.run(
        `UPDATE blood_requests SET status = 'Accepted', donorId = ?
         WHERE id = ? AND (status = 'Open' OR status = 'DonorNeeded')`,
        [donorId, reqId],
        function (err) {
            if (err || this.changes === 0) return res.status(400).json({ error: 'Request already accepted or not available.' });
            io.emit('request_updated', reqId);
            console.log(`✅ [Request ${reqId}] Accepted by donor ${donorId}.`);
            res.json({ success: true });
        }
    );
});

app.post('/api/requests/:id/accept-targeted', (req, res) => {
    const reqId = req.params.id;
    db.run(
        `UPDATE blood_requests SET status = 'Accepted', donorId = target_user_id
         WHERE id = ? AND status = 'pending'`,
        [reqId],
        function (err) {
            if (err || this.changes === 0) return res.status(400).json({ error: 'Request not available.' });
            io.emit('request_updated', reqId);
            res.json({ success: true });
        }
    );
});

app.post('/api/requests/:id/reject-targeted', (req, res) => {
    const reqId = req.params.id;
    db.run(
        `UPDATE blood_requests SET status = 'Rejected'
         WHERE id = ? AND status = 'pending'`,
        [reqId],
        function (err) {
            if (err || this.changes === 0) return res.status(400).json({ error: 'Request not available.' });
            io.emit('request_updated', reqId);
            res.json({ success: true });
        }
    );
});

/**
 * POST /api/requests/:id/cancel
 * Seeker cancels their own request.
 * Only works if the request is not already Completed or Cancelled.
 */
app.post('/api/requests/:id/cancel', (req, res) => {
    const { seekerId } = req.body;
    if (!seekerId) return res.status(400).json({ error: 'seekerId required.' });

    db.run(
        `UPDATE blood_requests SET status = 'Cancelled'
         WHERE id = ? AND user_id = ? AND status NOT IN ('Completed','Cancelled')`,
        [req.params.id, seekerId],
        function (err) {
            if (err || this.changes === 0) {
                return res.status(400).json({ error: 'Cannot cancel this request — it may already be completed or cancelled.' });
            }
            io.emit('request_updated', req.params.id);
            res.json({ success: true });
        }
    );
});

app.post('/api/requests/:id/cancel-acceptance', (req, res) => {
    db.run(
        `UPDATE blood_requests SET status = 'DonorNeeded', donorId = NULL WHERE id = ? AND status = 'Accepted'`,
        [req.params.id],
        function (err) {
            if (err || this.changes === 0) {
                return res.status(400).json({ error: 'Could not cancel acceptance.' });
            }
            io.emit('request_updated', req.params.id);
            res.json({ success: true });
        }
    );
});

app.post('/api/requests/:id/complete-bank', (req, res) => {
    const reqId = req.params.id;
    // Cancel auto-complete timer if running
    if (autoCompleteTimers.has(Number(reqId))) {
        clearTimeout(autoCompleteTimers.get(Number(reqId)));
        autoCompleteTimers.delete(Number(reqId));
    }
    db.run(
        `UPDATE blood_requests SET status = 'Completed'
         WHERE id = ? AND status IN ('BloodBankAvailable','BloodBankPartial')`,
        [reqId],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            io.emit('request_updated', reqId);
            res.json({ success: true });
        }
    );
});

app.post('/api/requests/:id/complete', (req, res) => {
    const { donorId } = req.body;
    db.run(
        `UPDATE blood_requests SET status = 'Completed' WHERE id = ? AND status = 'Accepted'`,
        [req.params.id],
        function (err) {
            if (err || this.changes === 0) return res.status(400).json({ error: 'Failed to complete request.' });
            io.emit('request_updated', req.params.id);
            res.json({ success: true });
            
            if (donorId) {
                db.run(
                    `UPDATE users SET lastDonationDate = ?, availability = 'No' WHERE id = ?`,
                    [new Date().toISOString(), donorId]
                );
            }
        }
    );
});

// ── Fetch Chat History ───────────────────────────────────────────────────────────
app.get('/api/chats/:id', (req, res) => {
    db.all(
        `SELECT id, request_id, sender_id, message as text, timestamp FROM chats WHERE request_id = ? ORDER BY timestamp ASC`,
        [req.params.id],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

// ── Real-Time Chat (Socket.io) ─────────────────────────────────────────────────

io.on('connection', (socket) => {
    socket.on('join_chat', (requestId) => socket.join(requestId));

    socket.on('send_message', (data) => {
        const { requestId, senderId, text } = data;
        const timestamp = new Date().toISOString();
        db.run(
            `INSERT INTO chats (requestId, senderId, text, timestamp) VALUES (?, ?, ?, ?)`,
            [requestId, senderId, text, timestamp],
            () => {
                io.to(requestId).emit('receive_message', { requestId, senderId, text, timestamp });
            }
        );
    });
});

app.get('/api/chats/:requestId', (req, res) => {
    db.all(
        `SELECT * FROM chats WHERE requestId = ? ORDER BY timestamp ASC`,
        [req.params.requestId],
        (err, rows) => res.json(rows || [])
    );
});

// ── Start Server ───────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 LifeDrop Backend running on http://192.168.0.14:${PORT} (and localhost)`);
    console.log(`   📧 OTP      → Gmail SMTP (${process.env.EMAIL_USER || 'EMAIL_USER not set'})`);
    console.log(`   📱 SMS      → Fast2SMS (notifications only)`);
    console.log(`   🏥 BloodBank → OpenStreetMap Overpass API\n`);
});
