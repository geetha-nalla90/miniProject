const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./bloodbank.db');

db.serialize(() => {
    db.run("ALTER TABLE blood_requests ADD COLUMN target_user_id INTEGER;", (err) => {
        if (err) {
            console.log("Migration skipped or failed (Column might already exist):", err.message);
        } else {
            console.log("Successfully added target_user_id to blood_requests.");
        }
    });

    db.run("ALTER TABLE blood_requests ADD COLUMN targeted_status TEXT DEFAULT 'pending';", (err) => {
        if (err) {
            console.log("Migration skipped or failed:", err.message);
        } else {
            console.log("Successfully added targeted_status to blood_requests.");
        }
    });
});

db.close();
