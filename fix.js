const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./bloodbank.db');
db.run("UPDATE blood_requests SET status = 'DonorNeeded' WHERE status = 'BloodBankChecking'", (err) => {
    if (err) console.error(err);
    else console.log('Fixed stuck requests');
    db.close();
});
