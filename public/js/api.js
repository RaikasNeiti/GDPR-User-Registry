// API interactions and logic that talk to the backend
async function loadPrivacyPolicy() {
    try {
        const response = await fetch('/api/privacy-policy');
        const data = await response.json();
        window.privacyPolicy = data.policy;
    } catch (error) {
        console.error('Error loading privacy policy:', error);
    }
}

async function loadTermsOfService() {
    try {
        const response = await fetch('/api/terms-of-service');
        const data = await response.json();
        window.termsOfService = data.terms;
    } catch (error) {
        console.error('Error loading terms:', error);
    }
}

function getAuthToken() {
    return window.authToken || localStorage.getItem('authToken');
}

function getAuthHeaders() {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleRegister(event) {
    event.preventDefault();
    const firstName = document.getElementById('firstName').value;
    const lastName = document.getElementById('lastName').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const phone = document.getElementById('phone').value;
    const acceptTerms = document.getElementById('acceptTerms').checked;
    const acceptPrivacy = document.getElementById('acceptPrivacy').checked;

    if (!acceptTerms || !acceptPrivacy) {
        showMessage('registerMessage', 'You must accept Terms and Privacy Policy', 'error');
        return;
    }

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ firstName, lastName, email, password, phone, acceptTerms, acceptPrivacy })
        });
        const data = await response.json();
        if (response.ok) {
            if (data.token && data.user) {
                window.authToken = data.token;
                window.currentUser = data.user;
                localStorage.setItem('authToken', data.token);
                localStorage.setItem('currentUser', JSON.stringify(data.user));
                document.getElementById('dashboardLink').style.display = 'block';
                document.getElementById('logoutLink').style.display = 'block';
                showMessage('registerMessage', 'Registration successful! Redirecting to dashboard...', 'success');
                setTimeout(() => { showDashboard(); }, 500);
            } else {
                showMessage('registerMessage', 'Registration successful! Logging in...', 'success');
                setTimeout(() => { document.getElementById('loginEmail').value = email; document.getElementById('loginPassword').value = password; handleLogin(new Event('submit')); }, 1000);
            }
        } else {
            showMessage('registerMessage', data.error || 'Registration failed', 'error');
        }
    } catch (error) {
        showMessage('registerMessage', 'Error: ' + error.message, 'error');
    }
}

async function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (response.ok) {
            window.currentUser = data.user;
            window.authToken = data.token;
            localStorage.setItem('currentUser', JSON.stringify(window.currentUser));
            localStorage.setItem('authToken', data.token);
            document.getElementById('dashboardLink').style.display = 'block';
            document.getElementById('logoutLink').style.display = 'block';
            showMessage('loginMessage', 'Login successful!', 'success');
            setTimeout(() => { showDashboard(); }, 500);
        } else {
            showMessage('loginMessage', data.error || 'Login failed', 'error');
        }
    } catch (error) {
        showMessage('loginMessage', 'Error: ' + error.message, 'error');
    }
}

async function updateDashboardDisplay() {
    if (!window.currentUser) return;
    try {
        const response = await fetch(`/api/user/${window.currentUser.id}`, { headers: { 'Content-Type': 'application/json', ...getAuthHeaders() } });
        const user = await response.json();
        const profileHTML = `
            <p><strong>Name:</strong> ${user.firstName} ${user.lastName}</p>
            <p><strong>Email:</strong> ${user.email}</p>
            ${user.phone ? `<p><strong>Phone:</strong> ${user.phone}</p>` : ''}
            <p><strong>Account Created:</strong> ${new Date(user.createdAt).toLocaleDateString()}</p>
        `;
        document.getElementById('profileInfo').innerHTML = profileHTML;
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

async function handleProfileUpdate(event) {
    event.preventDefault(); if (!window.currentUser) return;
    const firstName = document.getElementById('editFirstName').value;
    const lastName = document.getElementById('editLastName').value;
    const phone = document.getElementById('editPhone').value;
    try {
        const response = await fetch(`/api/user/${window.currentUser.id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ firstName, lastName, phone })
        });
        if (response.ok) {
            window.currentUser = { ...window.currentUser, firstName, lastName };
            localStorage.setItem('currentUser', JSON.stringify(window.currentUser));
            hideEditProfile(); updateDashboardDisplay(); showNotification('Profile updated successfully!');
        }
    } catch (error) { console.error('Error updating profile:', error); }
}

async function downloadPersonalData() {
    if (!window.currentUser) return;
    try {
        const response = await fetch('/api/dsar/export', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() } });
        const data = await response.json();
        const dataStr = JSON.stringify(data, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a'); link.href = url; link.download = `personal-data-${new Date().toISOString().split('T')[0]}.json`; link.click(); URL.revokeObjectURL(url);
        showNotification('Your data has been exported successfully!');
    } catch (error) { console.error('Error exporting data:', error); showNotification('Error exporting data', true); }
}

async function confirmDeletion() {
    if (!window.currentUser) return;
    const confirmed = confirm('Are you sure? Your account will be deleted in 30 days. You can cancel this request within the grace period.');
    if (!confirmed) return;
    try {
        const reason = document.getElementById('deletionReason').value;
        const response = await fetch('/api/deletion/request', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ reason }) });
        const data = await response.json();
        if (response.ok) {
            showNotification(
                'Deletion request submitted. Your account will be deleted on ' + new Date(data.deletionScheduledFor).toLocaleDateString(),
                false,
                'OK',
                () => {},
                0
            );
            hideDeletionRequest();
        }
    } catch (error) { console.error('Error requesting deletion:', error); showNotification('Error submitting deletion request', true); }
}

async function loadActivityLog() {
    if (!window.currentUser) return;
    try {
        const response = await fetch(`/api/audit-log/${window.currentUser.id}`, { headers: { 'Content-Type': 'application/json', ...getAuthHeaders() } });
        const logs = await response.json();
        let html = '';
        if (!logs || logs.length === 0) html = '<p style="text-align: center; color: #9ca3af;">No activity recorded yet</p>';
        else logs.forEach(log => { const date = new Date(log.created_at); html += `<div class="log-item"><div class="log-action">${log.action}</div><div>${log.description || ''}</div><div class="log-time">${date.toLocaleString()}</div></div>`; });
        document.getElementById('activityLog').innerHTML = html;
    } catch (error) { console.error('Error loading activity log:', error); }
}

async function loadConsentHistory() {
    if (!window.currentUser) return;
    try {
        const response = await fetch(`/api/consent-history/${window.currentUser.id}`, { headers: { 'Content-Type': 'application/json', ...getAuthHeaders() } });
        const consents = await response.json();
        let html = '';
        if (!consents || consents.length === 0) html = '<p style="text-align: center; color: #9ca3af;">No consent history</p>';
        else consents.forEach(consent => { const date = new Date(consent.given_at); html += `<div class="consent-item-log"><strong>${consent.consent_type}</strong> - Consented on ${date.toLocaleDateString()}</div>`; });
        document.getElementById('consentHistory').innerHTML = html;
    } catch (error) { console.error('Error loading consent history:', error); }
}

// Expose functions globally for inline handlers
window.loadPrivacyPolicy = loadPrivacyPolicy;
window.loadTermsOfService = loadTermsOfService;
window.handleRegister = handleRegister;
window.handleLogin = handleLogin;
window.updateDashboardDisplay = updateDashboardDisplay;
window.handleProfileUpdate = handleProfileUpdate;
window.downloadPersonalData = downloadPersonalData;
window.confirmDeletion = confirmDeletion;
window.loadActivityLog = loadActivityLog;
window.loadConsentHistory = loadConsentHistory;
