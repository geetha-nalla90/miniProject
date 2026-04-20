const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./bloodbank.db');

console.log('Checking existing DonorNeeded requests...');

db.serialize(() => {
    // Get all DonorNeeded requests
    db.all(
        `SELECT r.id, r.blood_group, r.user_id, r.location
         FROM blood_requests r
         WHERE r.status = 'DonorNeeded'`,
        [],
        (err, requests) => {
            if (err) {
                console.error('Error fetching requests:', err);
                return;
            }

            console.log(`Found ${requests.length} DonorNeeded requests`);

            requests.forEach(req => {
                console.log(`Processing request ${req.id} for ${req.blood_group}`);

                // Get compatible blood types
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

                const compatibleTypes = BLOOD_COMPATIBILITY[req.blood_group] || [req.blood_group];
                const placeholders = compatibleTypes.map(() => '?').join(',');

                // Parse location for distance check
                let reqLat = 17.3850, reqLon = 78.4867; // default Hyderabad
                const locParts = (req.location || '').split('|');
                if (locParts[1]) {
                    const c = locParts[1].split(',');
                    reqLat = parseFloat(c[0]) || reqLat;
                    reqLon = parseFloat(c[1]) || reqLon;
                }

                // Haversine distance function
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

                // Find eligible donors
                db.all(
                    `SELECT u.id, u.phone, u.lat, u.lng, u.name
                     FROM users u
                     WHERE u.blood_group IN (${placeholders})
                       AND u.availability != 'No'
                       AND u.id != ?`,
                    [...compatibleTypes, Number(req.user_id)],
                    (err2, donors) => {
                        if (err2) {
                            console.error(`Error fetching donors for request ${req.id}:`, err2);
                            return;
                        }

                        console.log(`Found ${donors.length} potential donors for request ${req.id}`);

                        donors.forEach(donor => {
                            let shouldInclude = true;
                            if (donor.lat && donor.lng) {
                                const dist = haversineDistance(reqLat, reqLon, donor.lat, donor.lng);
                                if (dist > 20) shouldInclude = false;
                            }

                            if (shouldInclude) {
                                // Check if already exists
                                db.get(
                                    `SELECT id FROM request_recipients WHERE request_id = ? AND receiver_id = ?`,
                                    [req.id, donor.id],
                                    (checkErr, row) => {
                                        if (!checkErr && !row) {
                                            // Insert
                                            db.run(
                                                `INSERT INTO request_recipients (request_id, receiver_id) VALUES (?, ?)`,
                                                [req.id, donor.id],
                                                (insertErr) => {
                                                    if (insertErr) {
                                                        console.error(`Failed to add recipient ${donor.id} for request ${req.id}:`, insertErr.message);
                                                    } else {
                                                        console.log(`✅ Added donor ${donor.name} (${donor.blood_group}) to request ${req.id}`);
                                                    }
                                                }
                                            );
                                        } else if (row) {
                                            console.log(`⏭️  Donor ${donor.name} already recipient for request ${req.id}`);
                                        }
                                    }
                                );
                            }
                        });
                    }
                );
            });
        }
    );
});

setTimeout(() => {
    db.close();
    console.log('Done processing existing requests.');
}, 5000);