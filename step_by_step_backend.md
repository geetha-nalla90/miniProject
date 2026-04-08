# Step-by-Step Guide: Adding a Real Backend to the Blood Donation Application

Since we cannot currently execute Node.js commands directly from the terminal, here are the step-by-step instructions and the exact code you need to run to add a real Node.js backend to your Blood Donation Application.

---

## Step 1: Install Node.js
If you haven't already, download and install Node.js from [nodejs.org](https://nodejs.org/). This will allow your computer to run a web server.

## Step 2: Initialize the Project
Open a new **Command Prompt** or **PowerShell** window, navigate to your project folder (`c:/Users/DEEPIKA/Desktop/Boold_Donation`), and run this command:

```bash
npm init -y
```

This creates a `package.json` file to manage your backend dependencies.

## Step 3: Install Required Dependencies
Run the following command to install the required libraries for our server:

```bash
npm install express cors sqlite3 socket.io
```
*   `express`: The web framework for our API.
*   `cors`: Allows our frontend to securely communicate with the backend.
*   `sqlite3`: A lightweight database that saves data to a file on your computer.
*   `socket.io`: Enables real-time chat and notifications.

## Step 4: Create the Server File (`server.js`)
Create a new file named `server.js` in your project folder (`c:/Users/DEEPIKA/Desktop/Boold_Donation`) and paste the following code:

```javascript
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// 1. Database Setup
const db = new sqlite3.Database('./bloodbank.db', (err) => {
    if (err) console.error(err.message);
    else console.log('Connected to SQLite database.');
});

// Create Tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, name TEXT, phone TEXT UNIQUE, role TEXT, bloodType TEXT, city TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS requests (
        id TEXT PRIMARY KEY, seekerId TEXT, bloodType TEXT, quantity INTEGER, location TEXT, 
        urgency TEXT, status TEXT, timestamp TEXT, donorId TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS chats (
        id INTEGER PRIMARY KEY AUTOINCREMENT, requestId TEXT, senderId TEXT, text TEXT, timestamp TEXT
    )`);
});

// 2. REST API Routes
// Register User
app.post('/api/register', (req, res) => {
    const { id, name, phone, role, bloodType, city } = req.body;
    db.run(`INSERT INTO users (id, name, phone, role, bloodType, city) VALUES (?, ?, ?, ?, ?, ?)`,
        [id, name, phone, role, bloodType, city], (err) => {
            if (err) return res.status(400).json({ error: 'Phone already registered.' });
            res.json({ success: true });
        });
});

// Get User by Phone (Login)
app.get('/api/users/:phone', (req, res) => {
    db.get(`SELECT * FROM users WHERE phone = ?`, [req.params.phone], (err, row) => {
        if (err || !row) return res.status(404).json({ error: 'User not found.' });
        res.json(row);
    });
});

// Create Blood Request
app.post('/api/requests', (req, res) => {
    const { id, seekerId, bloodType, quantity, location, urgency } = req.body;
    const timestamp = new Date().toISOString();
    db.run(`INSERT INTO requests (id, seekerId, bloodType, quantity, location, urgency, status, timestamp) 
            VALUES (?, ?, ?, ?, ?, ?, 'Open', ?)`,
        [id, seekerId, bloodType, quantity, location, urgency, timestamp], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            io.emit('new_request'); // Notify donors in real-time
            res.json({ success: true, id });
        });
});

// Get Requests (Matches for Donor / History for Seeker)
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
        [donorId, req.params.id], function(err) {
            if (err || this.changes === 0) return res.status(400).json({ error: 'Failed to accept request.' });
            io.emit('request_updated', req.params.id); // Notify clients to refresh
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
server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
```

## Step 5: Update the Frontend
Once your server is running, the next step would be to update `js/app.js` to modify the `app.getDB` and `app.saveDB` functions to use HTTP requests (`fetch('http://localhost:3000/api/...')`) instead of `localStorage`.

## Step 6: Start the Server
In your command prompt, run:

```bash
node server.js
```

You should see: `Server is running on http://localhost:3000`. You now have a real SQLite database storing your users and blood requests!
