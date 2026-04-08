/**
 * LifeDrop - Blood Donation App Logic
 * Backend Integration: Connects to Node.js/Express Server
 */

// Replace these with your actual Supabase URL and Anon Key
// const SUPABASE_URL = 'https://xrhtolzapmrcskwajgtu.supabase.co';
// const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhyaHRvbHphcG1yY3Nrd2FqZ3R1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3NTAyMjksImV4cCI6MjA4NzMyNjIyOX0.kVVMqTLEPRnKTGGq2mWwBwKJlG0syLYNumTgcIjWJXE';

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

                    return {
                        name: el.tags.name,
                        type: el.tags.amenity || el.tags.healthcare || 'Medical Facility',
                        address: address.length > 0 ? address.join(', ') : 'Nearby location'
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
                document.getElementById('reqLocation').value = `${loc.name}${addressStr}`;
                list.classList.add('hidden');
            };
            list.appendChild(div);
        });

        list.classList.remove('hidden');
    },

    // ==== Authentication ====
    sendOTP: async (phone) => {
        // Calling local SMS router for OTP
        const res = await fetch('http://localhost:3000/api/send-sms-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to generate OTP');

        // Expose demo OTP to UI (if Twilio isn't fully set up in server.js)
        if (data.demoOtp) {
            app.showToast('Demo OTP for ' + phone + ' is: ' + data.demoOtp, 6000);
            alert('Demo OTP for ' + phone + ' is: ' + data.demoOtp);
        }
        return true;
    },

    verifyOTP: async (phone, otpStr) => {
        const res = await fetch('http://localhost:3000/api/verify-sms-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, otp: otpStr })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Invalid OTP code.');

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
                id: '_' + Math.random().toString(36).substr(2, 9),
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
            const phone = document.getElementById('loginPhone').value;
            const role = document.getElementById('loginRole') ? document.getElementById('loginRole').value : null;

            try {
                // Remove all non-digit characters for validation
                const cleanPhone = phone.replace(/\D/g, '');
                
                if (cleanPhone.length !== 10) {
                    throw new Error('Please enter a valid 10-digit phone number');
                }

                // Fetch user from local node backend
                const response = await fetch(`http://localhost:3000/api/users/${phone}`);
                const data = await response.json();

                if (!response.ok) throw new Error(data.error || 'User not found. Please register.');
                const user = data;

                await app.sendOTP(phone);

                app.tempLoginUser = user;
                document.getElementById('loginForm').classList.add('hidden');
                document.getElementById('otpForm').classList.remove('hidden');
            } catch (err) {
                app.showToast(err.message);
            }
        }
    },

    processRegistration: async (phone) => {

        try {
            await app.sendOTP(phone);

            document.getElementById('registerForm').classList.add('hidden');
            document.getElementById('otpForm').classList.remove('hidden');
        } catch (err) {
            app.showToast('Failed to send OTP: ' + err.message);
        }
    },

    handleOTPVerify: async (e) => {
        e.preventDefault();
        const inputs = document.querySelectorAll('.otp-input');
        const otpStr = Array.from(inputs).map(i => i.value).join('');

        let phoneToVerify = null;
        if (app.tempRegData) phoneToVerify = app.tempRegData.phone;
        else if (app.tempLoginUser) phoneToVerify = app.tempLoginUser.phone;

        if (!phoneToVerify) return;

        try {
            // Verify Custom OTP via Node Server
            await app.verifyOTP(phoneToVerify, otpStr);

            if (app.tempRegData) {
                // Now insert the confirmed user into our custom local users table
                const response = await fetch('http://localhost:3000/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(app.tempRegData)
                });

                const data = await response.json();

                if (!response.ok) {
                    app.showToast('Error saving user: ' + (data.error || 'Unknown error'));
                    throw new Error(data.error || 'Registration failed. Phone might exist.');
                }

                localStorage.setItem(DB_KEY_SESSION, JSON.stringify(app.tempRegData));
                app.showToast('Registration Successful! Redirecting...');
                setTimeout(() => window.location.replace('dashboard.html'), 1000);

            } else if (app.tempLoginUser) {
                localStorage.setItem(DB_KEY_SESSION, JSON.stringify(app.tempLoginUser));
                app.showToast('Login Successful! Redirecting...');
                setTimeout(() => window.location.replace('dashboard.html'), 1000);
            }
        } catch (err) {
            console.error("OTP Verification Error: ", err);
            app.showToast(err.message);
        }
    },

    logout: () => {
        localStorage.removeItem(DB_KEY_SESSION);
        window.location.href = 'index.html';
    },

    getCurrentUser: () => {
        const user = localStorage.getItem(DB_KEY_SESSION);
        return user ? JSON.parse(user) : null;
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

    loadHospitals: async () => {
        try {
            const banks = [
                { id: '1', name: 'City Central Blood Bank', location: 'Downtown', geo_lat: 20.59, geo_lng: 78.96 },
                { id: '2', name: 'Red Cross Hospital', location: 'North Side', geo_lat: 20.60, geo_lng: 78.95 },
                { id: '3', name: 'Hope Clinic', location: 'West End', geo_lat: 28.6139, geo_lng: 77.2090 }, // Delhi
                { id: '4', name: 'General Hospital', location: 'East Side', geo_lat: 17.3850, geo_lng: 78.4867 }  // Hyderabad
            ];

            const select = document.getElementById('reqHospitalId');
            if (select) {
                select.innerHTML = '<option value="">Select Authorized Facility</option>';
                banks.forEach(b => {
                    const latlng = (b.geo_lat && b.geo_lng) ? `${b.geo_lat},${b.geo_lng}` : '';
                    select.innerHTML += `<option value="${b.id}" data-location="${b.location}" data-latlng="${latlng}">${b.name} (${b.location})</option>`;
                });
            }
        } catch (e) { console.error('Failed to load blood banks', e); }
    },

    createRequest: async (e) => {
        e.preventDefault();
        const user = app.getCurrentUser();
        if (!user) return;

        const hospitalSelect = document.getElementById('reqHospitalId');
        if (!hospitalSelect.value) {
            app.showToast('Please select a hospital.');
            return;
        }
        const selectedOption = hospitalSelect.options[hospitalSelect.selectedIndex];
        const latlngData = selectedOption.dataset.latlng;
        const locationStr = latlngData ? `${selectedOption.text}|${latlngData}` : (selectedOption.dataset.location || selectedOption.text);

        const requestData = {
            id: '_' + Math.random().toString(36).substr(2, 9),
            seekerId: user.id,
            bloodType: document.getElementById('reqBloodType').value,
            quantity: document.getElementById('reqQuantity').value,
            location: locationStr,
            urgency: document.getElementById('reqUrgency').value
        };

        try {
            const response = await fetch('http://localhost:3000/api/requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);

            app.showToast('Blood Request Submitted Successfully!');
            document.getElementById('createRequestForm').reset();
            app.renderSeekerRequests();
            switchView('my-requests');
        } catch (err) {
            app.showToast(err.message);
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

    renderDonorMatches: async () => {
        const user = app.getCurrentUser();
        const container = document.getElementById('requestsListContainer');
        container.innerHTML = '';

        if (!user) return;

        // Eligibility check
        if (user.availability === 'No') {
            container.innerHTML = '<p style="color:var(--text-muted)">You are marked as unavailable to donate.</p>';
            return;
        }

        if (user.age && (user.age < 18 || user.age > 65)) {
            container.innerHTML = '<p style="color:var(--text-muted)">You do not meet the minimum age requirements to donate.</p>';
            return;
        }

        if (user.lastDonationDate) {
            const lastDate = new Date(user.lastDonationDate);
            const today = new Date();
            const diffTime = Math.abs(today - lastDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays < 90) {
                container.innerHTML = `<p style="color:var(--text-muted)">You must wait 90 days between donations. Days remaining: ${90 - diffDays}</p>`;
                return;
            }
        }

        if (user.diseases && user.diseases.toLowerCase() !== 'none' && user.diseases.length > 2) {
            container.innerHTML = '<p style="color:var(--text-muted)">Based on your medical history, you are currently ineligible to donate.</p>';
            return;
        }

        const requests = await app.fetchRequests();
        const matches = requests.filter(r => {
            if (r.status !== 'Open') return false;
            if (r.seekerId === user.id) return false; // Isolate own requests
            return r.bloodType === user.bloodType || user.bloodType === 'O-';
        });

        if (matches.length === 0) {
            container.innerHTML = '<p style="color: var(--text-muted);">No open requests matching your blood group found.</p>';
            return;
        }

        matches.forEach(req => container.appendChild(app.createRequestCardHTML(req, false)));
    },

    createRequestCardHTML: (req, isSeeker) => {
        const date = new Date(req.timestamp).toLocaleString();
        let statusColor = 'status-open';
        if (req.status === 'Accepted') statusColor = 'status-accepted';
        if (req.status === 'Completed') statusColor = 'status-completed';

        const card = document.createElement('div');
        card.className = 'glass-card request-card';
        card.innerHTML = `
            <div class="request-header">
                <div>
                    <span class="blood-badge">${req.bloodType}</span>
                    <span style="margin-left:1rem; font-weight:600;">${isSeeker ? req.quantity : 'Needed: ' + req.quantity} Units</span>
                </div>
                <span class="status-badge ${statusColor}">${req.status === 'Accepted' ? 'Accepted' : (isSeeker ? req.status : 'Match Found')}</span>
            </div>
            
            <p style="font-size: 0.9rem; color: var(--text-muted); margin-top: 0.5rem;">
                Requested by: <span style="background:#e5e7eb; padding:2px 6px; border-radius:4px; font-size:0.75rem;">
                ${isSeeker ? '(You)' : 'Anonymous Seeker (Hidden)'}
                </span>
            </p>

            <div class="request-details">
                <div class="detail-item">
                    <span class="detail-label">Hospital Location</span>
                    <span class="detail-value">${req.location}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Urgency</span>
                    <span class="detail-value" style="color: ${req.urgency === 'Critical' ? 'red' : 'inherit'}">${req.urgency}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Posted On</span>
                    <span class="detail-value" style="font-size:0.85rem">${date}</span>
                </div>
            </div>
            
            <div style="margin-top:1rem;">
                ${isSeeker && req.status === 'Accepted' ?
                `<button type="button" class="btn btn-outline" style="padding:0.5rem 1rem; border-color:#2563eb; color:#2563eb;" onclick="switchView('chats'); setTimeout(()=>app.openChat('${req.id}'),100)">Chat with Donor</button>`
                : ''}
                
                ${!isSeeker && req.status === 'Open' ?
                `<button type="button" class="btn btn-primary" onclick="app.acceptRequest(event, '${req.id}')">Accept Request</button>`
                : ''}
                
                ${!isSeeker && req.status === 'Accepted' ?
                `<button type="button" class="btn btn-outline" disabled style="padding:0.5rem 1rem; border-color:#6b7280; color:#6b7280; opacity:0.6;">Already Accepted by Another Donor</button>`
                : ''}
            </div>
        `;
        return card;
    },

    acceptRequest: async (e, reqId) => {
        if (e) e.preventDefault();
        const user = app.getCurrentUser();

        try {
            const response = await fetch(`http://localhost:3000/api/requests/${reqId}/accept`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ donorId: user.id })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);

            app.showToast('Request Accepted! You can now communicate with the seeker.');
            switchView('chats');
            setTimeout(() => app.openChat(reqId), 100);
            app.updateDashboardStats();
        } catch (err) {
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
                    method: 'POST'
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

    updateDashboardStats: async () => {
        const user = app.getCurrentUser();
        if (!user) return;
        const requests = await app.fetchRequests();

        if (user.role === 'seeker') {
            const count = requests.filter(r => r.seekerId === user.id).length;
            document.getElementById('stat-1').innerText = count;
        } else {
            const count = requests.filter(r => r.status === 'Open' && (r.bloodType === user.bloodType || user.bloodType === 'O-')).length;
            document.getElementById('stat-1').innerText = count;
        }
    },

    // ==== Chat Logic (Socket.io) ====
    setupSockets: () => {
        if (typeof io === 'undefined') return;
        app.socket = io('http://localhost:3000');

        app.socket.on('request_updated', (reqId) => {
            app.updateDashboardStats();
            const listEl = document.getElementById('view-list');
            if (listEl && !listEl.classList.contains('hidden')) {
                // Refresh both seeker requests and donor matches
                app.renderSeekerRequests();
                app.renderDonorMatches();
            }
            if (app.currentChatReqId === reqId) app.openChat(reqId);
        });

        app.socket.on('new_request', () => {
            app.showToast('A new blood request was just posted!');
            app.updateDashboardStats();
            const listEl = document.getElementById('view-list');
            if (listEl && !listEl.classList.contains('hidden')) {
                app.renderSeekerRequests();
                app.renderDonorMatches();
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
        }

        activeRequests.forEach(req => {
            const div = document.createElement('div');
            const isSeeker = user.role === 'seeker';
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

        const isSeeker = user.role === 'seeker';

        document.getElementById('chatPartnerName').innerText = isSeeker ? `Donor: ${request.donorName}` : `Seeker: ${request.seekerName}`;
        document.getElementById('chatPartnerDetails').innerText = isSeeker ? `Phone: ${request.donorPhone || 'Hidden'}` : `Phone: ${request.seekerPhone} | Location: ${request.location}`;

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
    if (document.getElementById('registerForm')) document.getElementById('registerForm').addEventListener('submit', (e) => app.handleAuthSubmit(e, 'registerForm'));
    if (document.getElementById('loginForm')) document.getElementById('loginForm').addEventListener('submit', (e) => app.handleAuthSubmit(e, 'loginForm'));
    if (document.getElementById('otpForm')) document.getElementById('otpForm').addEventListener('submit', app.handleOTPVerify);

    // Dashboard events
    if (document.getElementById('createRequestForm')) document.getElementById('createRequestForm').addEventListener('submit', app.createRequest);
    if (document.getElementById('chatForm')) document.getElementById('chatForm').addEventListener('submit', app.sendMessage);

    // Provide a way to share location in chat
    const chatInput = document.getElementById('chatMessageInput');
    if (chatInput) {
        const locBtn = document.createElement('button');
        locBtn.type = 'button';
        locBtn.className = 'btn btn-outline';
        locBtn.innerText = '📍';
        locBtn.title = 'Share Location';
        locBtn.style.padding = '0 1rem';
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
});
