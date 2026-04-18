/**
 * LifeDrop - Blood Donation App Logic
 * Backend Integration: Connects to Node.js/Express Server
 */

// Replace these with your actual Supabase URL and Anon Key
// const SUPABASE_URL = 'https://xrhtolzapmrcskwajgtu.supabase.co';
// const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';

// let supabase = null; // Removed Supabase instantiation, using Node.js Local backend

const DB_KEY_SESSION = 'bt_currentUser';

window.app = {
    // ==== Utility ====
    showToast: (message, duration = 3000) => {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.innerText = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), duration);
    },

    getLocation: () => {
        if (navigator.geolocation && document.getElementById('regCity')) {
            app.showToast('Getting location...');
            navigator.geolocation.getCurrentPosition((pos) => {
                document.getElementById('regCity').value = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)} (GPS)`;
                app.showToast('Location fetched successfully!');
            }, (err) => {
                app.showToast('Location access denied. Please enter manually.');
            });
        }
    },

    // ==== Location Search (OpenStreetMap Overpass API) ====
    findNearbyHospitals: () => {
        const btn = document.getElementById('findHospitalsBtn');
        const list = document.getElementById('locationSuggestions');
        const input = document.getElementById('reqLocation');

        list.classList.add('hidden');

        if (!navigator.geolocation) {
            app.showToast('Geolocation is not supported by your browser');
            return;
        }

        btn.disabled = true;
        btn.innerText = '⏳';
        app.showToast('Locating you...', 2000);

        navigator.geolocation.getCurrentPosition(async (pos) => {
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            const radius = 5000; // 5km radius

            const query = `
                [out:json];
                (
                  node["amenity"="hospital"](around:${radius},${lat},${lon});
                  node["amenity"="clinic"](around:${radius},${lat},${lon});
                  node["healthcare"="blood_bank"](around:${radius},${lat},${lon});
                  way["amenity"="hospital"](around:${radius},${lat},${lon});
                  way["amenity"="clinic"](around:${radius},${lat},${lon});
                );
                out center;
            `;

            try {
                app.showToast('Searching nearby medical facilities...', 2000);
                const res = await fetch('https://overpass-api.de/api/interpreter', {
                    method: 'POST',
                    body: query
                });

                if (!res.ok) throw new Error('API request failed');

                const data = await res.json();
                const elements = data.elements || [];

                const locations = elements.filter(el => el.tags && el.tags.name).map(el => {
                    let address = [];
                    if (el.tags['addr:street']) address.push(el.tags['addr:street']);
                    if (el.tags['addr:city']) address.push(el.tags['addr:city']);

                    const elLat = el.center ? el.center.lat : el.lat;
                    const elLon = el.center ? el.center.lon : el.lon;

                    return {
                        name: el.tags.name,
                        type: el.tags.amenity || el.tags.healthcare || 'Medical Facility',
                        address: address.length > 0 ? address.join(', ') : 'Nearby location',
                        lat: elLat,
                        lon: elLon
                    };
                });

                if (locations.length === 0) {
                    app.showToast('No facilities found within 5km.');
                } else {
                    app.renderLocationSuggestions(locations);
                }

            } catch (err) {
                console.error(err);
                app.showToast('Error finding nearby locations.');
            } finally {
                btn.disabled = false;
                btn.innerText = '📍 Find Nearby';
            }
        }, (err) => {
            btn.disabled = false;
            btn.innerText = '📍 Find Nearby';
            app.showToast('Location permission denied.');
        });
    },

    renderLocationSuggestions: (locations) => {
        const list = document.getElementById('locationSuggestions');
        list.innerHTML = '';

        locations.forEach(loc => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.innerHTML = `
                <h4>${loc.name}</h4>
                <p>${loc.type === 'hospital' ? '🏥' : (loc.type === 'blood_bank' ? '🩸' : '⚕️')} ${loc.address}</p>
            `;
            div.onclick = () => {
                const addressStr = loc.address !== 'Nearby location' ? `, ${loc.address}` : '';
                const coordStr = (loc.lat && loc.lon) ? `|${loc.lat},${loc.lon}` : '';
                document.getElementById('reqLocation').value = `${loc.name}${addressStr}${coordStr}`;
                list.classList.add('hidden');
            };
            list.appendChild(div);
        });

        list.classList.remove('hidden');
    },

    // ==== Authentication (Email OTP via SMTP) ====
    sendOTP: async (email) => {
        const res = await fetch('http://localhost:3000/api/send-email-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to send OTP email.');
        return true;
    },

    verifyOTP: async (email, otpStr) => {
        const res = await fetch('http://localhost:3000/api/verify-email-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp: otpStr })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Invalid OTP. Please check your email.');
        return true;
    },

    handleAuthSubmit: async (e, formId) => {
        e.preventDefault();

        if (formId === 'registerForm') {
            const phone = document.getElementById('regPhone').value;

            try {
                // Remove all non-digit characters for validation
                const cleanPhone = phone.replace(/\D/g, '');
                
                if (cleanPhone.length !== 10) {
                    throw new Error('Please enter a valid 10-digit phone number');
                }
            } catch (err) {
                app.showToast(err.message);
                return;
            }

            // Construct registration data early and save to memory
            app.tempRegData = {
                name: document.getElementById('regName').value,
                phone: phone,
                role: document.getElementById('regRole') ? document.getElementById('regRole').value : 'donor',
                bloodType: document.getElementById('regBloodType') ? document.getElementById('regBloodType').value : 'O+',
                city: document.getElementById('regCity') ? document.getElementById('regCity').value : '',
                age: document.getElementById('regAge') ? document.getElementById('regAge').value : null,
                gender: document.getElementById('regGender') ? document.getElementById('regGender').value : null,
                diseases: document.getElementById('regDiseases') ? document.getElementById('regDiseases').value : null,
                lastDonationDate: document.getElementById('regLastDonationDate') ? document.getElementById('regLastDonationDate').value : null,
                availability: 'Yes',
                medicalReportUrl: null
            };

            // Handle optional file upload via Base64 FileReader
            const fileInput = document.getElementById('regMedicalReport');

            if (fileInput && fileInput.files.length > 0) {
                const file = fileInput.files[0];
                const reader = new FileReader();
                reader.onloadend = () => {
                    app.tempRegData.medicalReportUrl = reader.result;
                    app.processRegistration(phone);
                };
                reader.readAsDataURL(file);
            } else {
                app.processRegistration(phone);
            }
        }

        if (formId === 'loginForm') {
            const email = document.getElementById('loginEmail')
                ? document.getElementById('loginEmail').value.trim()
                : '';

            try {
                if (!email || !email.includes('@')) {
                    throw new Error('Please enter a valid email address.');
                }

                app.showToast('Looking up your account...');

                // Fetch user by email from backend
                const response = await fetch(
                    `http://localhost:3000/api/users/email/${encodeURIComponent(email)}`
                );
                const data = await response.json();

                if (!response.ok) throw new Error(data.error || 'Account not found. Please register.');
                const user = data;

                app.showToast('Sending OTP to your email...');
                await app.sendOTP(email);

                // Show email in OTP subtitle if element exists
                const otpDisplay = document.getElementById('otpEmailDisplay');
                if (otpDisplay) otpDisplay.textContent = email;

                app.tempLoginUser = user;
                document.getElementById('loginForm').classList.add('hidden');
                document.getElementById('otpForm').classList.remove('hidden');
                document.querySelectorAll('.otp-input').forEach(i => i.value = '');
                const first = document.querySelector('.otp-input');
                if (first) first.focus();
            } catch (err) {
                app.showToast(err.message);
            }
        }
    },

    processRegistration: async (email) => {
        try {
            // email param is the actual email address for OTP
            const targetEmail = app.tempRegData && app.tempRegData.email ? app.tempRegData.email : email;
            await app.sendOTP(targetEmail);
            const otpDisplay = document.getElementById('otpEmailDisplay');
            if (otpDisplay) otpDisplay.textContent = targetEmail;
            document.getElementById('registerForm').classList.add('hidden');
            document.getElementById('otpForm').classList.remove('hidden');
            document.querySelectorAll('.otp-input').forEach(i => i.value = '');
            const first = document.querySelector('.otp-input');
            if (first) first.focus();
        } catch (err) {
            app.showToast('Failed to send OTP: ' + err.message);
        }
    },

    handleOTPVerify: async (e) => {
        e.preventDefault();
        const inputs = document.querySelectorAll('.otp-input');
        const otpStr = Array.from(inputs).map(i => i.value).join('');

        // Determine email to verify against
        let emailToVerify = null;
        if (app.tempRegData)   emailToVerify = app.tempRegData.email;
        else if (app.tempLoginUser) emailToVerify = app.tempLoginUser.email;

        if (!emailToVerify) {
            app.showToast('Session lost. Please refresh and try again.');
            return;
        }

        try {
            // Verify OTP via Email endpoint
            await app.verifyOTP(emailToVerify, otpStr);

            if (app.tempRegData) {
                const response = await fetch('http://localhost:3000/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(app.tempRegData)
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Registration failed. Email or phone may already exist.');
                }

                app.tempRegData.id = data.user_id;
                localStorage.setItem(DB_KEY_SESSION, JSON.stringify(app.tempRegData));
                app.showToast('✅ Registration Successful! Redirecting...');
                setTimeout(() => window.location.replace('dashboard.html'), 1000);

            } else if (app.tempLoginUser) {
                localStorage.setItem(DB_KEY_SESSION, JSON.stringify(app.tempLoginUser));
                app.showToast('✅ Login Successful! Redirecting...');
                setTimeout(() => window.location.replace('dashboard.html'), 1000);
            }
        } catch (err) {
            console.error('OTP Verification Error:', err);
            app.showToast(err.message);
        }
    },

    logout: () => {
        localStorage.removeItem(DB_KEY_SESSION);
        window.location.href = 'index.html';
    },

    getCurrentUser: () => {
        const userStr = localStorage.getItem(DB_KEY_SESSION);
        if (!userStr || userStr === 'null' || userStr === 'undefined') return null;
        const user = JSON.parse(userStr);
        // Normalize bloodType from backend blood_group
        if (user && !user.bloodType && user.blood_group) {
            user.bloodType = user.blood_group;
        }
        return user;
    },

    fetchRequests: async () => {
        try {
            const response = await fetch('http://localhost:3000/api/requests');
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            return data;
        } catch (err) {
            console.error('Error fetching requests', err);
            return [];
        }
    },

    // ==== Map-based Location Picker ====
    /**
     * Initialise the interactive Leaflet map inside the New Request form.
     * Uses OpenStreetMap + Overpass API to show nearby hospitals/blood banks.
     * User clicks a marker popup button to select that facility.
     */
    initLocationMapPicker: () => {
        // Destroy stale map instance (e.g. navigating back to the form)
        if (app.locationPickerMap) {
            app.locationPickerMap.remove();
            app.locationPickerMap = null;
        }

        const mapDiv = document.getElementById('locationPickerMap');
        if (!mapDiv) return;

        // Reset selection state
        const locInput   = document.getElementById('reqSelectedLocation');
        const locDisplay = document.getElementById('selectedLocationDisplay');
        const locMsg     = document.getElementById('locationPickerMsg');
        if (locInput)   locInput.value = '';
        if (locDisplay) locDisplay.classList.add('hidden');
        if (locMsg)     locMsg.textContent = '⏳ Detecting your location…';

        if (!navigator.geolocation) {
            if (locMsg) locMsg.textContent = '⚠️ Geolocation is not supported by your browser.';
            return;
        }

        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const lat = pos.coords.latitude;
                const lon = pos.coords.longitude;

                // Build map
                app.locationPickerMap = L.map('locationPickerMap').setView([lat, lon], 14);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap contributors'
                }).addTo(app.locationPickerMap);

                // "You are here" pulse marker
                L.circleMarker([lat, lon], {
                    radius: 9, color: '#dc2626', fillColor: '#dc2626', fillOpacity: 0.35, weight: 2
                }).addTo(app.locationPickerMap).bindPopup('<b>📍 Your Location</b>').openPopup();

                if (locMsg) locMsg.textContent = '🔍 Searching nearby hospitals & blood banks…';

                // Query Overpass for hospitals + blood banks within 5 km
                try {
                    const radius = 5000;
                    const query = `
                        [out:json];
                        (
                          node["amenity"="hospital"](around:${radius},${lat},${lon});
                          node["amenity"="clinic"](around:${radius},${lat},${lon});
                          node["healthcare"="blood_bank"](around:${radius},${lat},${lon});
                          way["amenity"="hospital"](around:${radius},${lat},${lon});
                          way["amenity"="clinic"](around:${radius},${lat},${lon});
                        );
                        out center;
                    `;

                    const res = await fetch('https://overpass-api.de/api/interpreter', {
                        method: 'POST', body: query
                    });
                    const data = await res.json();
                    const elements = (data.elements || []).filter(el => el.tags && el.tags.name);

                    // ── Store for inclusion in the request POST body ──────────────
                    // This lets the server use REAL nearby facilities instead of
                    // re-querying the Overpass API (which is rate-limited server-side).
                    app._mapPickerBanks = elements
                        .map(el => ({
                            name: el.tags.name,
                            type: el.tags['healthcare'] === 'blood_bank' ? 'Blood Bank' : 'Hospital',
                            lat:  el.center ? el.center.lat : el.lat,
                            lon:  el.center ? el.center.lon : el.lon
                        }))
                        .filter(b => b.lat && b.lon);

                    if (elements.length === 0) {
                        if (locMsg) locMsg.textContent = '⚠️ No hospitals found within 5 km. Please try to request from a different location.';
                    } else {
                        if (locMsg) locMsg.textContent = `✅ Found ${elements.length} facilit${elements.length === 1 ? 'y' : 'ies'}. Click a red marker then "Select" to choose.`;
                    }

                    elements.forEach(el => {
                        const eLat = el.center ? el.center.lat : el.lat;
                        const eLon = el.center ? el.center.lon : el.lon;
                        if (!eLat || !eLon) return;

                        const type = el.tags['healthcare'] === 'blood_bank' ? '🩸 Blood Bank' : '🏥 Hospital';
                        const name = el.tags.name;
                        // Escape single quotes for inline onclick
                        const safeName = name.replace(/'/g, '\\u0027');

                        const icon = L.divIcon({
                            className: 'custom-drop-marker',
                            html: type === '🏥 Hospital'
                                  ? `<div style="font-size: 24px; text-shadow: 0 0 5px rgba(0,0,0,0.5);">🏥</div>`
                                  : `<div style="font-size: 24px; text-shadow: 0 0 5px rgba(0,0,0,0.5);">🩸</div>`,
                            iconSize: [24, 24],
                            iconAnchor: [12, 12]
                        });

                        L.marker([eLat, eLon], { icon })
                            .addTo(app.locationPickerMap)
                            .bindPopup(`
                                <div style="min-width:160px">
                                  <strong style="font-size:0.9rem">${name}</strong><br>
                                  <small style="color:#6b7280">${type}</small><br>
                                  <button type="button"
                                    onclick="app.selectLocation('${safeName}',${eLat},${eLon})"
                                    style="margin-top:6px;padding:5px 12px;background:#dc2626;color:white;border:none;border-radius:6px;cursor:pointer;font-size:0.8rem;font-weight:600;">
                                    ✅ Select
                                  </button>
                                </div>
                            `);
                    });

                } catch (err) {
                    if (locMsg) locMsg.textContent = '⚠️ Could not load real hospitals via API. Displaying fallback facilities nearby.';
                    
                    // Fallback to simulated hospitals so the user is not stuck
                    const fallbackHospitals = [
                        { name: 'City Central Blood Bank', lat: lat + 0.015, lon: lon + 0.012, type: '🩸 Blood Bank' },
                        { name: 'Regional Medical Centre', lat: lat - 0.010, lon: lon - 0.008, type: '🏥 Hospital' }
                    ];

                    fallbackHospitals.forEach(el => {
                        const icon = L.divIcon({
                            className: 'custom-drop-marker',
                            html: el.type === '🏥 Hospital'
                                  ? `<div style="font-size: 24px; text-shadow: 0 0 5px rgba(0,0,0,0.5);">🏥</div>`
                                  : `<div style="font-size: 24px; text-shadow: 0 0 5px rgba(0,0,0,0.5);">🩸</div>`,
                            iconSize: [24, 24],
                            iconAnchor: [12, 12]
                        });

                        L.marker([el.lat, el.lon], { icon })
                            .addTo(app.locationPickerMap)
                            .bindPopup(`
                                <div style="min-width:160px">
                                  <strong style="font-size:0.9rem">${el.name}</strong><br>
                                  <small style="color:#6b7280">${el.type}</small><br>
                                  <button type="button"
                                    onclick="app.selectLocation('${el.name}',${el.lat},${el.lon})"
                                    style="margin-top:6px;padding:5px 12px;background:#dc2626;color:white;border:none;border-radius:6px;cursor:pointer;font-size:0.8rem;font-weight:600;">
                                    ✅ Select
                                  </button>
                                </div>
                            `);
                    });
                }
            },
            () => {
                if (locMsg) locMsg.textContent = '⚠️ Location access denied. Please enable it in your browser and refresh.';
            },
            { timeout: 10000 }
        );
    },

    /**
     * Called from marker popup button — stores the chosen hospital.
     */
    selectLocation: (name, lat, lon) => {
        const value = `${name}|${lat},${lon}`;
        const locInput   = document.getElementById('reqSelectedLocation');
        const locDisplay = document.getElementById('selectedLocationDisplay');
        const locName    = document.getElementById('selectedLocationName');
        const locMsg     = document.getElementById('locationPickerMsg');

        if (locInput)   locInput.value = value;
        if (locName)    locName.textContent = name;
        if (locDisplay) locDisplay.classList.remove('hidden');
        if (locMsg)     locMsg.textContent = '✅ Hospital selected. Fill in the form and submit.';

        if (app.locationPickerMap) app.locationPickerMap.closePopup();
    },

    /**
     * Open a mini-map modal to show the hospital location (seeker & donor).
     */
    openLocationModal: (locationStr, title) => {
        const modal = document.getElementById('locationViewModal');
        if (!modal) return;

        document.getElementById('locationViewTitle').textContent = title || 'Hospital Location';
        modal.classList.remove('hidden');
        modal.style.display = 'flex';

        // Destroy old modal map
        if (app._locViewMap) { app._locViewMap.remove(); app._locViewMap = null; }

        const parts     = (locationStr || '').split('|');
        const namePart  = parts[0];
        const coordPart = parts[1];

        let lat = 17.3850, lon = 78.4867;
        if (coordPart) { const c = coordPart.split(','); lat = parseFloat(c[0]); lon = parseFloat(c[1]); }

        setTimeout(() => {
            app._locViewMap = L.map('locationViewMap').setView([lat, lon], 15);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(app._locViewMap);

            L.marker([lat, lon]).addTo(app._locViewMap)
                .bindPopup(`<b>🏥 ${namePart}</b>`).openPopup();
        }, 80); // slight delay so modal is visible
    },

    // ==== User Location Update ====
    /**
     * Sends the user's current GPS coordinates to the backend.
     * Called when the dashboard loads.
     */
    updateUserLocation: () => {
        const user = app.getCurrentUser();
        if (!user) return;

        if (!navigator.geolocation) return;

        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                try {
                    await fetch('http://localhost:3000/api/donors/update-location', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            donorId: user.id,
                            lat: pos.coords.latitude,
                            lng: pos.coords.longitude
                        })
                    });
                    console.log(`📍 [Location] Updated: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
                } catch (err) {
                    console.warn('📍 [Location] Could not update location:', err.message);
                }
            },
            (err) => {
                console.warn('📍 [Location] Permission denied or unavailable.');
            },
            { timeout: 8000, maximumAge: 60000 }
        );
    },

    // ==== Create Blood Request ====
    createRequest: async (e) => {
        e.preventDefault();
        const user = app.getCurrentUser();
        if (!user) return;

        // Read location from the hidden input populated by the map picker
        const locationStr = (document.getElementById('reqSelectedLocation') || {}).value || '';
        if (!locationStr) {
            app.showToast('📍 Please select a hospital from the map first.');
            return;
        }

        const requestData = {
            seekerId: user.id,
            bloodType: document.getElementById('reqBloodType').value,
            quantity: document.getElementById('reqQuantity').value,
            location: locationStr,
            urgency: document.getElementById('reqUrgency').value
            // nearbyBanks removed: server now queries Overpass directly
        };

        const submitBtn = document.querySelector('#createRequestForm button[type="submit"]');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting…'; }

        try {
            const response = await fetch('http://localhost:3000/api/requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);

            app.showToast('🔍 Request submitted! Checking nearby blood banks…');
            document.getElementById('createRequestForm').reset();
            // Clear map selection
            const locInput = document.getElementById('reqSelectedLocation');
            const locDisplay = document.getElementById('selectedLocationDisplay');
            if (locInput) locInput.value = '';
            if (locDisplay) locDisplay.classList.add('hidden');

            switchView('my-requests');
            app.renderSeekerRequests();
        } catch (err) {
            app.showToast(err.message);
        } finally {
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Submit Request'; }
        }
    },

    renderSeekerRequests: async () => {
        const user = app.getCurrentUser();
        const requests = await app.fetchRequests();
        const myRequests = requests.filter(r => r.seekerId === user.id);

        const container = document.getElementById('requestsListContainer');
        container.innerHTML = '';

        if (myRequests.length === 0) {
            container.innerHTML = '<p style="color: var(--text-muted);">You have not made any requests yet.</p>';
            return;
        }

        myRequests.forEach(req => container.appendChild(app.createRequestCardHTML(req, true)));
    },

    renderNewRequests: async () => {
        const user = app.getCurrentUser();
        const container = document.getElementById('requestsListContainer');
        container.innerHTML = '';

        if (!user) return;

        try {
            const response = await fetch(`http://localhost:3000/api/requests/new?userId=${user.id}`);
            const matches = await response.json();
            
            if (!response.ok) throw new Error(matches.error);

            if (matches.length === 0) {
                container.innerHTML = '<p style="color: var(--text-muted);">No open targeted requests found for you.</p>';
                return;
            }

            matches.forEach(req => container.appendChild(app.createRequestCardHTML(req, false)));
        } catch (err) {
            container.innerHTML = `<p style="color: var(--primary-red);">Error loading requests: ${err.message}</p>`;
        }
    },

    // ==== Request Card HTML (redesigned) ====
    createRequestCardHTML: (req, isSeeker) => {
        const date = new Date(req.timestamp).toLocaleString();
        const user = app.getCurrentUser();

        // Status colour mapping
        const statusColorMap = {
            'Open':               'status-open',
            'BloodBankChecking':  'status-checking',
            'BloodBankAvailable': 'status-bank-available',
            'BloodBankPartial':   'status-bank-partial',
            'DonorNeeded':        'status-donor-needed',
            'Accepted':           'status-accepted',
            'Completed':          'status-completed',
            'Cancelled':          'status-cancelled',
            'pending':            'status-open',
            'Rejected':           'status-cancelled'
        };

        const statusLabelMap = {
            'Open':               '🟢 Open',
            'BloodBankChecking':  '🔍 Checking Blood Banks...',
            'BloodBankAvailable': '🏥 Blood Available at Bank',
            'BloodBankPartial':   '🟡 Partial Stock at Blood Bank',
            'DonorNeeded':        '🩸 Donor Needed',
            'Accepted':           '✅ Accepted',
            'Completed':          '🏁 Completed',
            'Cancelled':          '🚫 Cancelled',
            'pending':            '🕒 Pending targeted request',
            'Rejected':           '❌ Rejected'
        };

        const statusColor = statusColorMap[req.status] || 'status-open';
        const statusLabel = statusLabelMap[req.status] || req.status;

        // Parse location nicely
        const locationDisplay = req.location ? req.location.split('|')[0] : 'Unknown';

        // Blood bank result section
        let bloodBankSection = '';
        if (req.status === 'Completed') {
            let completionMsg = 'Thank you for saving a life. This request has been fulfilled.';
            let bankName = '';
            if (req.bloodBankResult) {
                let banks = [];
                try { banks = JSON.parse(req.bloodBankResult); } catch(e){}
                if (banks[0]) {
                    bankName = banks[0].name;
                    completionMsg = `Donation completed successfully from blood bank`;
                }
            }
            bloodBankSection = `
                <div class="blood-bank-panel" style="background:linear-gradient(135deg,#d1fae5,#ecfdf5);border:1.5px solid #10b981;">
                    <div class="bb-panel-header">
                        <span style="font-size:1.5rem">🎉</span>
                        <strong style="color:#065f46">Donation Completed Successfully!</strong>
                    </div>
                    ${bankName ? `<p class="bb-note" style="color:#065f46; margin-top:0.3rem;">Blood Bank: <strong>${bankName}</strong></p>` : ''}
                    <p class="bb-note" style="color:#065f46; margin-top:0.3rem;">${completionMsg}</p>
                </div>
            `;
        } else if (req.bloodBankResult) {
            let banks = [];
            try { banks = JSON.parse(req.bloodBankResult); } catch (e) {}
            const b = banks[0]; // always one bank in new pipeline

            if (req.status === 'BloodBankAvailable' && b) {
                bloodBankSection = `
                    <div class="blood-bank-panel blood-bank-available">
                        <div class="bb-panel-header">
                            <span>🏥</span>
                            <strong>Blood is available at ${b.name}</strong>
                        </div>
                        <div class="bb-bank-row" style="display:flex; flex-direction:column; gap:0.3rem; margin-top:0.5rem;">
                            <div style="display:flex; justify-content:space-between;">
                                <span class="bb-bank-name">${b.name}</span>
                                <span style="color:#059669; font-weight:600;">Request Accepted ✅</span>
                            </div>
                            <div style="font-size:0.85rem; color:var(--text-muted);">Contact: <strong>${b.contact}</strong></div>
                            <div style="font-size:0.85rem;">
                                Requested Units: <strong>${b.requestedUnits}</strong> &nbsp;|
                                Available Units: <strong style="color:#059669;">${b.availableUnits}</strong>
                            </div>
                            <div style="font-size:0.75rem; color:var(--text-muted);">📍 ${b.distanceKm} km away</div>
                        </div>
                        <p class="bb-note" style="margin-top:0.5rem; color:#065f46; font-size:0.8rem;">⏳ Auto-completing in 60 seconds...</p>
                    </div>
                `;
            } else if (req.status === 'BloodBankPartial' && b) {
                bloodBankSection = `
                    <div class="blood-bank-panel blood-bank-partial">
                        <div class="bb-panel-header">
                            <span>🟡</span>
                            <strong>Blood partially available at ${b.name}</strong>
                        </div>
                        <div class="bb-bank-row" style="display:flex; flex-direction:column; gap:0.3rem; margin-top:0.5rem;">
                            <div style="font-size:0.85rem; color:var(--text-muted);">Contact: <strong>${b.contact}</strong></div>
                            <div style="font-size:0.85rem;">
                                Requested Units: <strong>${b.requestedUnits}</strong> &nbsp;|
                                Available Units: <strong style="color:#d97706;">${b.availableUnits}</strong>
                            </div>
                            <div style="font-size:0.75rem; color:var(--text-muted);">📍 ${b.distanceKm} km away</div>
                        </div>
                        <p class="bb-note" style="margin-top:0.5rem; color:#92400e; font-size:0.8rem;">Proceeding with available units. Auto-completing in 60 seconds...</p>
                    </div>
                `;
            } else if (req.status === 'DonorNeeded' && b) {
                bloodBankSection = `
                    <div class="blood-bank-panel blood-bank-unavailable">
                        <div class="bb-panel-header">
                            <span>⚠️</span>
                            <strong>Blood is not available in nearby blood banks</strong>
                        </div>
                        <div style="font-size:0.85rem; color:var(--text-muted); margin-top:0.4rem;">Checked: <strong>${b.name}</strong> (${b.distanceKm} km away)</div>
                        <p class="bb-note" style="margin-top:0.4rem;">${isSeeker ? 'Nearby eligible donors have been alerted via SMS.' : 'Your help is urgently needed!'}</p>
                    </div>
                `;
            } else if (req.status === 'BloodBankChecking') {
                bloodBankSection = `
                    <div class="blood-bank-panel blood-bank-checking">
                        <div class="bb-panel-header">
                            <span class="bb-spinner">⏳</span>
                            <strong>Searching nearby blood banks...</strong>
                        </div>
                        <div class="bb-progress-bar"><div class="bb-progress-fill"></div></div>
                    </div>
                `;
            }
        } else if (req.status === 'BloodBankChecking') {
            bloodBankSection = `
                <div class="blood-bank-panel blood-bank-checking">
                    <div class="bb-panel-header">
                        <span class="bb-spinner">⏳</span>
                        <strong>Searching nearby blood banks (10 km radius)...</strong>
                    </div>
                    <div class="bb-progress-bar"><div class="bb-progress-fill"></div></div>
                </div>
            `;
        }

        // Action buttons
        const isAcceptingDonor = !isSeeker && req.donorId === user.id;
        let actionButtons = '';

        if (isSeeker && req.status === 'Accepted') {
            actionButtons = `<button type="button" class="btn btn-outline" style="padding:0.5rem 1rem; border-color:#2563eb; color:#2563eb;" onclick="switchView('chats'); setTimeout(()=>app.openChat('${req.id}'),100)">💬 Chat with Donor</button>`;
        }

        if (isSeeker && (req.status === 'BloodBankAvailable' || req.status === 'BloodBankPartial')) {
            actionButtons = `<button type="button" class="btn btn-primary" onclick="app.completeBloodBankDonation('${req.id}')">Mark as Donation Completed</button>`;
        }

        if (!isSeeker && (req.status === 'DonorNeeded' || req.status === 'Open')) {
            actionButtons = `<button type="button" class="btn btn-primary" id="accept-btn-${req.id}" onclick="app.acceptRequest(event, '${req.id}')">🩸 Accept Request</button>`;
        }

        if (!isSeeker && req.status === 'pending') {
            actionButtons = `
                <button type="button" class="btn btn-primary" style="background:#16a34a; border-color:#16a34a; color:white; padding:0.5rem 1rem;" onclick="app.acceptTargetedRequest('${req.id}')">✅ Accept</button>
                <button type="button" class="btn btn-outline" style="border-color:#dc2626; color:#dc2626; padding:0.5rem 1rem; margin-left:0.5rem;" onclick="app.rejectTargetedRequest('${req.id}')">❌ Reject</button>
            `;
        }

        if (!isSeeker && req.status === 'Accepted' && !isAcceptingDonor) {
            actionButtons = `<button type="button" class="btn btn-outline" disabled style="padding:0.5rem 1rem; border-color:#6b7280; color:#6b7280; opacity:0.6; cursor:not-allowed;">Already Accepted by Another Donor</button>`;
        }

        if (isAcceptingDonor && req.status === 'Accepted') {
            actionButtons = `
                <button type="button" class="btn btn-outline" style="padding:0.5rem 1rem; border-color:#2563eb; color:#2563eb;" onclick="switchView('chats'); setTimeout(()=>app.openChat('${req.id}'),100)">💬 Chat with Seeker</button>
                <button type="button" class="btn btn-cancel" id="cancel-btn-${req.id}" onclick="app.cancelAcceptance('${req.id}')">↩ Cancel Acceptance</button>
            `;
        }

        // Can seeker cancel this request?
        const canCancel = isSeeker && !['Completed', 'Cancelled'].includes(req.status);
        const safeLocation = (req.location || '').replace(/'/g, '\\u0027');
        const safeTitle    = locationDisplay.replace(/'/g, '\\u0027');

        const card = document.createElement('div');
        card.className = 'request-card';
        card.style = 'border-left: 4px solid #dc2626; border-radius: 8px; padding: 1.5rem; background: #fff; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem;';
        card.dataset.requestId = req.id;

        // Custom visual logic for "MATCH FOUND" badge
        let topBadgeInfo = '';
        if (canCancel) {
            topBadgeInfo = `<button type="button" class="btn-card-cancel" id="cancel-req-${req.id}" title="Cancel Request" onclick="app.cancelRequest('${req.id}')">✕ Cancel</button>`;
        } else if (!isSeeker && (req.status === 'Open' || req.status === 'DonorNeeded')) {
            topBadgeInfo = `<span style="background: #e0f2fe; color: #0369a1; border-radius: 999px; padding: 4px 12px; font-weight: bold; font-size: 0.75rem; text-transform: uppercase;">MATCH FOUND</span>`;
        } else {
            topBadgeInfo = `<span class="status-badge ${statusColor}">${req.status === 'Accepted' && !isAcceptingDonor ? '✅ Accepted' : statusLabel}</span>`;
        }

        let contactDisplay = '';
        if (req.bloodBankResult) {
            try { 
                let bks = JSON.parse(req.bloodBankResult); 
                const availableBank = bks.find(b => b.available && b.units > 0);
                if (availableBank) contactDisplay = `<br><span style="color:#2563eb; font-size:0.8rem">📞 ${availableBank.contact}</span>`;
            } catch(e){}
        }

        let styledActionButtons = actionButtons.replace('class="btn btn-primary"', 'class="btn btn-primary shadow-sm" style="background:#dc2626; color:white; padding:0.5rem 1rem;"');

        card.innerHTML = `
            <!-- Top row -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <div style="background: #fee2e2; color: #dc2626; width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 1px solid #fecaca; font-size: 1.1rem;">
                        ${req.bloodType}
                    </div>
                    <span style="font-weight: 600; color: #1f2937;">${isSeeker ? req.quantity : 'Needed: ' + req.quantity} Units</span>
                </div>
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    ${topBadgeInfo}
                </div>
            </div>

            <!-- Requested by -->
            <div style="margin-top: 0.5rem;">
                <span style="font-size: 0.85rem; color: #6b7280;">Requested by:</span>
                <span style="background: #f3f4f6; color: #4b5563; border: 1px solid #e5e7eb; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; margin-left: 4px;">${isSeeker ? '(You)' : 'Anonymous Seeker (Hidden)'}</span>
            </div>

            <!-- Three columns -->
            <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 1rem; margin-top: 1rem; border-top: 1px solid #f3f4f6; padding-top: 1rem;">
                <div style="display: flex; flex-direction: column; gap: 0.2rem;">
                    <span style="color: #6b7280; font-size: 0.70rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;">Hospital Location</span>
                    <strong style="color: #1f2937; font-size: 0.85rem; line-height: 1.2;">
                        ${locationDisplay}
                        ${req.location && req.location.includes('|') ? `<br><button type="button" onclick="app.openLocationModal('${safeLocation}','${safeTitle}')" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:0.75rem;padding:0;text-decoration:underline;white-space:nowrap;margin-top:2px;">📍 View Map</button>` : ''}
                    </strong>
                </div>
                <div style="display: flex; flex-direction: column; gap: 0.2rem;">
                    <span style="color: #6b7280; font-size: 0.70rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;">Urgency</span>
                    <strong style="color: ${req.urgency === 'Critical' ? '#dc2626' : '#1f2937'}; font-size: 0.85rem;">${req.urgency}</strong>
                </div>
                <div style="display: flex; flex-direction: column; gap: 0.2rem;">
                    <span style="color: #6b7280; font-size: 0.70rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;">Posted On</span>
                    <strong style="color: #1f2937; font-size: 0.85rem;">${date}</strong>
                </div>
            </div>

            <!-- Blood Bank Search Result Panel -->
            ${bloodBankSection}

            <div style="margin-top: 0.5rem; display: flex; gap: 0.75rem; flex-wrap: wrap;">
                ${styledActionButtons}
            </div>
        `;
        return card;
    },

    // ==== Cancel Request (Seeker only) ====
    cancelRequest: async (reqId) => {
        if (!confirm('Cancel this blood request? This cannot be undone.')) return;
        const user = app.getCurrentUser();

        const btn = document.getElementById(`cancel-req-${reqId}`);
        if (btn) { btn.disabled = true; btn.textContent = 'Cancelling…'; }

        try {
            const response = await fetch(`http://localhost:3000/api/requests/${reqId}/cancel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ seekerId: user.id })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            app.showToast('🚫 Request cancelled.');
            app.renderSeekerRequests();
        } catch (err) {
            if (btn) { btn.disabled = false; btn.textContent = '✕ Cancel'; }
            app.showToast(err.message);
        }
    },

    // ==== Accept Request ====
    acceptRequest: async (e, reqId) => {
        if (e) e.preventDefault();
        const user = app.getCurrentUser();

        // Disable button immediately
        const btn = document.getElementById(`accept-btn-${reqId}`);
        if (btn) { btn.disabled = true; btn.innerText = 'Accepting...'; }

        try {
            const response = await fetch(`http://localhost:3000/api/requests/${reqId}/accept`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ donorId: user.id })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);

            app.showToast('✅ Request Accepted! You can now communicate with the seeker.');
            switchView('chats');
            setTimeout(() => app.openChat(reqId), 100);
            app.updateDashboardStats();
        } catch (err) {
            if (btn) { btn.disabled = false; btn.innerText = '🩸 Accept Request'; }
            app.showToast(err.message);
        }
    },

    acceptTargetedRequest: async (reqId) => {
        try {
            const response = await fetch(`http://localhost:3000/api/requests/${reqId}/accept-targeted`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            app.showToast('✅ Targeted Request Accepted!');
            // Reload requests
            app.renderNewRequests();
        } catch (err) {
            app.showToast(err.message);
        }
    },

    rejectTargetedRequest: async (reqId) => {
        try {
            const response = await fetch(`http://localhost:3000/api/requests/${reqId}/reject-targeted`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            app.showToast('❌ Targeted Request Rejected.');
            // Reload requests
            app.renderNewRequests();
        } catch (err) {
            app.showToast(err.message);
        }
    },

    // ==== Cancel Acceptance ====
    cancelAcceptance: async (reqId) => {
        if (!confirm('Are you sure you want to cancel your acceptance? The request will be opened to other donors.')) return;

        const btn = document.getElementById(`cancel-btn-${reqId}`);
        if (btn) { btn.disabled = true; btn.innerText = 'Cancelling...'; }

        try {
            const response = await fetch(`http://localhost:3000/api/requests/${reqId}/cancel-acceptance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);

            app.showToast('↩ Acceptance cancelled. The request is now open to other donors.');
            app.renderDonorMatches();
        } catch (err) {
            if (btn) { btn.disabled = false; btn.innerText = '↩ Cancel Acceptance'; }
            app.showToast(err.message);
        }
    },

    completeDonation: async (e) => {
        if (e) e.preventDefault();
        if (!app.currentChatReqId) return;
        if (confirm('Are you sure the donation is completed? This will close the request.')) {
            try {
                // Update request
                const response = await fetch(`http://localhost:3000/api/requests/${app.currentChatReqId}/complete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ donorId: app.getCurrentUser().id })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error);

                // Update donor
                const user = app.getCurrentUser();
                await fetch(`http://localhost:3000/api/users/${user.id}/update`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        lastDonationDate: new Date().toISOString(),
                        availability: 'No'
                    })
                });

                // Update local storage
                user.lastDonationDate = new Date().toISOString();
                user.availability = 'No';
                localStorage.setItem(DB_KEY_SESSION, JSON.stringify(user));

                app.showToast('Donation marked as completed. Thank you!');
                app.openChat(app.currentChatReqId); // Refresh UI
            } catch (err) {
                app.showToast(err.message);
            }
        }
    },

    completeBloodBankDonation: async (reqId) => {
        try {
            app.showToast('Completing donation...');
            const response = await fetch(`http://localhost:3000/api/requests/${reqId}/complete-bank`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            if(!response.ok) throw new Error(data.error);

            app.showToast('Donation completed successfully');
            app.renderSeekerRequests();
        } catch (err) {
            app.showToast(err.message);
        }
    },

    updateDashboardStats: async () => {
        const user = app.getCurrentUser();
        if (!user) return;
        const requests = await app.fetchRequests();

        if (user.role === 'seeker') {
            const count = requests.filter(r => r.seekerId === user.id).length;
            document.getElementById('stat-1').innerText = count;
        } else {
            const count = requests.filter(r =>
                (r.status === 'Open' || r.status === 'DonorNeeded') &&
                (r.bloodType === user.bloodType || user.bloodType === 'O-')
            ).length;
            document.getElementById('stat-1').innerText = count;
        }
    },

    // ==== Chat Logic (Socket.io) ====
    setupSockets: () => {
        if (typeof io === 'undefined') return;
        app.socket = io('http://localhost:3000');

        app.socket.on('request_updated', (reqId) => {
            app.updateDashboardStats();
            // Re-render whatever list is currently active
            if (document.getElementById('nav-available') && document.getElementById('nav-available').classList.contains('active')) {
                app.renderNewRequests();
            } else if (document.getElementById('nav-my-requests') && document.getElementById('nav-my-requests').classList.contains('active')) {
                app.renderSeekerRequests();
            }
            if (app.currentChatReqId === reqId) app.openChat(reqId);
        });

        app.socket.on('new_request', () => {
            app.showToast('🩸 A new blood request was just posted!');
            app.updateDashboardStats();
            if (document.getElementById('nav-available') && document.getElementById('nav-available').classList.contains('active')) {
                app.renderNewRequests();
            } else if (document.getElementById('nav-my-requests') && document.getElementById('nav-my-requests').classList.contains('active')) {
                app.renderSeekerRequests();
            }
        });

        app.socket.on('receive_message', (msg) => {
            if (app.currentChatReqId === msg.requestId) {
                app.appendSingleMessage(msg);
            }
        });
    },

    renderChatList: async () => {
        const user = app.getCurrentUser();
        const requests = await app.fetchRequests();
        const activeRequests = requests.filter(r =>
            (r.seekerId === user.id || r.donorId === user.id) &&
            (r.status === 'Accepted' || r.status === 'Completed')
        );

        const sidebar = document.getElementById('chatListSidebar');
        sidebar.innerHTML = '';

        if (activeRequests.length === 0) {
            sidebar.innerHTML = '<p style="color: var(--text-muted); padding: 1rem;">No active communications.</p>';
            document.getElementById('activeChatWindow').style.display = 'none';
            return;
        } else if (!app.currentChatReqId || !activeRequests.some(r => r.id === app.currentChatReqId)) {
            // Auto open first chat if none is selected
            setTimeout(() => app.openChat(activeRequests[0].id), 50);
        }

        activeRequests.forEach(req => {
            const div = document.createElement('div');
            const isSeeker = req.seekerId === user.id;
            const partnerName = isSeeker ? req.donorName : req.seekerName;

            div.className = 'nav-item';
            div.style.borderBottom = '1px solid var(--glass-border)';
            div.style.borderRadius = '0';
            div.innerHTML = `
                <div style="flex:1;">
                    <strong style="display:block; color:var(--text-main);">${partnerName}</strong>
                    <span style="font-size: 0.8rem; color:var(--text-muted);">Request: ${req.bloodType} - ${req.quantity}U</span>
                </div>
            `;
            div.onclick = () => app.openChat(req.id);
            sidebar.appendChild(div);
        });
    },

    openChat: async (reqId) => {
        const user = app.getCurrentUser();
        const requests = await app.fetchRequests();
        const request = requests.find(r => r.id === reqId);
        if (!request) return;

        app.currentChatReqId = reqId;
        if (app.socket) app.socket.emit('join_chat', reqId);

        const isSeeker = request.seekerId === user.id;

        document.getElementById('chatPartnerName').innerText = isSeeker ? `Donor: ${request.donorName}` : `Seeker: ${request.seekerName}`;
        document.getElementById('chatPartnerDetails').innerText = isSeeker ? `Phone: ${request.donorPhone || 'Hidden'}` : `Phone: ${request.seekerPhone} | Location: ${request.location ? request.location.split('|')[0] : 'Unknown'}`;

        const statusBadge = document.getElementById('chatRequestStatus');
        statusBadge.innerText = request.status;
        statusBadge.className = `status-badge ${request.status === 'Completed' ? 'status-completed' : 'status-accepted'}`;

        document.getElementById('activeChatWindow').style.display = 'flex';

        const donorActions = document.getElementById('donorActions');
        if (!isSeeker && request.status === 'Accepted') donorActions.classList.remove('hidden');
        else donorActions.classList.add('hidden');

        document.getElementById('chatMessageInput').disabled = request.status === 'Completed';

        // ==== Map Integration for Donors ====
        app.toggleChatMap(false); // Hide by default
        if (!isSeeker && request.location) {
            // Add a "View Map" button next to the location details
            const detailsEl = document.getElementById('chatPartnerDetails');
            if (!detailsEl.innerHTML.includes('View on Map')) {
                detailsEl.innerHTML += ` <button type="button" onclick="app.loadMapForLocation('${request.location}')" style="background:none;border:none;color:var(--primary-red);cursor:pointer;text-decoration:underline;font-size:0.8rem;margin-left:5px;">(View on Map)</button>`;
            }
        }

        app.loadChatMessages();
    },

    toggleChatMap: (show) => {
        const container = document.getElementById('chatMapContainer');
        if (container) {
            if (show) container.classList.remove('hidden');
            else container.classList.add('hidden');
        }
    },

    loadMapForLocation: async (locationString) => {
        app.toggleChatMap(true);
        app.showToast('Loading map data...');

        if (app.chatMap) {
            app.chatMap.remove();
            app.chatMap = null;
        }

        try {
            // Parse specific coordinates from our saved format: "Hospital Name|lat,lng"
            const parts = locationString.split('|');
            const displayName = parts[0];
            const coordsStr = parts[1];

            let seekerLat = 28.6139; // Default
            let seekerLon = 77.2090;
            let exactFound = false;

            if (coordsStr) {
                const c = coordsStr.split(',');
                seekerLat = parseFloat(c[0]);
                seekerLon = parseFloat(c[1]);
                exactFound = true;
            } else {
                // Fallback to text search if no coords saved
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(displayName)}`);
                const data = await res.json();
                if (data && data.length > 0) {
                    seekerLat = parseFloat(data[0].lat);
                    seekerLon = parseFloat(data[0].lon);
                    exactFound = true;
                }
            }

            if (!exactFound) app.showToast('Using default coordinates. Exact location not found.', 4000);

            // Initialize Leaflet Map
            app.chatMap = L.map('seekerLocationMap').setView([seekerLat, seekerLon], 13);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(app.chatMap);

            // Add Seeker Marker
            L.marker([seekerLat, seekerLon]).addTo(app.chatMap)
                .bindPopup(`<b>Seeker Location</b><br>${displayName}`)
                .openPopup();

            // 3. Prompt Donor for Location & Draw Route
            const user = app.getCurrentUser();
            if (user.role === 'donor') {
                app.showToast('Fetching your location for routing...');
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                        (pos) => {
                            const donorLat = pos.coords.latitude;
                            const donorLon = pos.coords.longitude;

                            // Add Donor Marker
                            L.marker([donorLat, donorLon], { icon: L.icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png', iconSize: [25, 41], iconAnchor: [12, 41] }) })
                                .addTo(app.chatMap)
                                .bindPopup("<b>Your Location</b>");

                            // Draw Route using Leaflet Routing Machine
                            if (L.Routing) {
                                L.Routing.control({
                                    waypoints: [
                                        L.latLng(donorLat, donorLon),
                                        L.latLng(seekerLat, seekerLon)
                                    ],
                                    routeWhileDragging: false,
                                    addWaypoints: false,
                                    fitSelectedRoutes: true,
                                    show: false, // Don't show the step-by-step instructions box
                                    lineOptions: {
                                        styles: [{ color: '#dc2626', opacity: 0.8, weight: 6 }]
                                    }
                                }).addTo(app.chatMap);
                            }
                        },
                        (err) => {
                            app.showToast('Could not get your location for routing.');
                        }
                    );
                }
            }

            // Fix container sizing issue in Leaflet when unhidden
            setTimeout(() => {
                app.chatMap.invalidateSize();
            }, 100);

        } catch (err) {
            console.error(err);
            app.showToast('Failed to load map.');
            app.toggleChatMap(false);
        }
    },

    loadChatMessages: async () => {
        if (!app.currentChatReqId) return;
        try {
            const response = await fetch(`http://localhost:3000/api/chats/${app.currentChatReqId}`);
            const chats = await response.json();

            const area = document.getElementById('chatMessagesArea');
            area.innerHTML = '';
            chats.forEach(msg => app.appendSingleMessage(msg));
        } catch (err) { console.error('Error loading chats'); }
    },

    appendSingleMessage: (msg) => {
        const user = app.getCurrentUser();
        const area = document.getElementById('chatMessagesArea');
        const isMine = msg.senderId === user.id;

        const div = document.createElement('div');
        div.className = `message ${isMine ? 'msg-sent' : 'msg-received'}`;

        if (msg.text.includes('LOC:')) {
            const parts = msg.text.split('LOC:');
            div.innerHTML = `${parts[0]} <br><a href="https://maps.google.com/?q=${parts[1]}" target="_blank" style="color:inherit;text-decoration:underline;">📍 View Shared Location</a>`;
        } else {
            div.innerText = msg.text;
        }
        area.appendChild(div);
        area.scrollTop = area.scrollHeight;
    },

    sendMessage: async (e) => {
        e.preventDefault();
        const input = document.getElementById('chatMessageInput');
        const text = input.value.trim();
        if (!text || !app.currentChatReqId) return;

        const msgData = {
            requestId: app.currentChatReqId,
            senderId: app.getCurrentUser().id,
            text: text,
            timestamp: new Date().toISOString()
        };

        if (app.socket) app.socket.emit('send_message', msgData);

        input.value = '';
    }
};

// Event Listeners Registration
document.addEventListener('DOMContentLoaded', () => {
    // Auth events
    // NOTE: registerForm and otpForm are handled by the inline DOMContentLoaded block in index.html
    // Only loginForm uses app.handleAuthSubmit here
    if (document.getElementById('loginForm')) document.getElementById('loginForm').addEventListener('submit', (e) => app.handleAuthSubmit(e, 'loginForm'));

    // Dashboard events
    if (document.getElementById('createRequestForm')) document.getElementById('createRequestForm').addEventListener('submit', app.createRequest);
    if (document.getElementById('chatForm')) document.getElementById('chatForm').addEventListener('submit', app.sendMessage);

    // Provide a way to share location in chat
    const chatInput = document.getElementById('chatMessageInput');
    if (chatInput) {
        const locBtn = document.createElement('button');
        locBtn.type = 'button';
        locBtn.className = 'btn';
        locBtn.innerHTML = '📍';
        locBtn.title = 'Share Location';
        locBtn.style = 'background: white; border: 1px solid #dc2626; color: #dc2626; border-radius: 8px; padding: 0.75rem 1rem; cursor: pointer; display: flex; align-items: center; justify-content: center;';
        locBtn.onclick = () => {
            app.showToast('Retrieving location...');
            navigator.geolocation.getCurrentPosition((pos) => {
                chatInput.value = `Here is my live location! LOC:${pos.coords.latitude},${pos.coords.longitude}`;
                chatInput.focus();
            }, () => app.showToast('Failed to get location'));
        };
        chatInput.parentElement.insertBefore(locBtn, chatInput);
    }

    // Attempt Socket Init
    app.setupSockets();

    // Update donor location on dashboard load
    app.updateUserLocation();
});
