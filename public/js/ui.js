// UI helpers and navigation functions
function showMessage(elementId, message, type) {
    const element = document.getElementById(elementId);
    if (!element) return;
    element.textContent = message;
    element.className = `message ${type}`;
    if (type === 'success') {
        setTimeout(() => { element.className = 'message'; }, 5000);
    }
}

function showNotification(message, isError = false, actionLabel = null, actionCallback = null, autoDismissMs = 4000) {
    const bgColor = isError ? '#fee2e2' : '#dcfce7';
    const textColor = isError ? '#991b1b' : '#166534';
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed; top: 20px; right: 20px; background-color: ${bgColor}; color: ${textColor};
        padding: 15px 20px; border-radius: 6px; border: 1px solid ${isError ? '#fca5a5' : '#86efac'};
        z-index: 2000; max-width: 400px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); display: flex; align-items: center; gap: 12px;
    `;
    const textNode = document.createElement('span');
    textNode.textContent = message;
    notification.appendChild(textNode);

    let timeoutId = null;
    if (actionLabel && actionCallback) {
        const actionButton = document.createElement('button');
        actionButton.textContent = actionLabel;
        actionButton.style.cssText = `
            background-color: ${isError ? '#fee2e2' : '#dcfce7'};
            color: ${textColor};
            border: 1px solid ${isError ? '#fca5a5' : '#86efac'};
            border-radius: 4px;
            padding: 8px 12px;
            cursor: pointer;
        `;
        actionButton.onclick = () => {
            try {
                actionCallback();
            } catch (err) {
                console.error('Notification action failed:', err);
            }
            notification.remove();
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        };
        notification.appendChild(actionButton);
    } else {
        timeoutId = setTimeout(() => { notification.remove(); }, autoDismissMs);
    }

    document.body.appendChild(notification);
    return notification;
}

function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(section => { section.classList.remove('active'); });
    const el = document.getElementById(sectionId);
    if (el) el.classList.add('active');
}

function showHome() { showSection('homeSection'); window.scrollTo(0,0); }
function showPrivacyPolicy() { showSection('policySection'); if (window.privacyPolicy) document.getElementById('policyContent').textContent = window.privacyPolicy; window.scrollTo(0,0); }
function showTerms() { showSection('termsSection'); if (window.termsOfService) document.getElementById('termsContent').textContent = window.termsOfService; window.scrollTo(0,0); }

function showDashboard() {
    if (!window.currentUser) { showHome(); return; }
    showSection('dashboardSection');
    if (window.updateDashboardDisplay) window.updateDashboardDisplay();
    if (window.loadActivityLog) window.loadActivityLog();
    if (window.loadConsentHistory) window.loadConsentHistory();
    document.getElementById('dashboardLink').style.display = 'block';
    document.getElementById('logoutLink').style.display = 'block';
    window.scrollTo(0,0);
}

function showRegisterForm() {
    document.getElementById('registerForm').classList.add('active');
    document.getElementById('loginForm').classList.remove('active');
    document.querySelector('.tab-btn:nth-child(1)').classList.add('active');
    document.querySelector('.tab-btn:nth-child(2)').classList.remove('active');
}

function showLoginForm() {
    document.getElementById('loginForm').classList.add('active');
    document.getElementById('registerForm').classList.remove('active');
    document.querySelector('.tab-btn:nth-child(2)').classList.add('active');
    document.querySelector('.tab-btn:nth-child(1)').classList.remove('active');
}

function logout() {
    window.currentUser = null;
    window.authToken = null;
    localStorage.removeItem('currentUser');
    localStorage.removeItem('authToken');
    document.getElementById('dashboardLink').style.display = 'none';
    document.getElementById('logoutLink').style.display = 'none';
    document.getElementById('registerForm').reset();
    document.getElementById('loginForm').reset();
    showHome();
}

function showEditProfile() {
    if (!window.currentUser) return;
    const profileForm = document.getElementById('editProfileForm');
    profileForm.style.display = 'block';
    fetch(`/api/user/${window.currentUser.id}`).then(r => r.json()).then(user => {
        document.getElementById('editFirstName').value = user.firstName;
        document.getElementById('editLastName').value = user.lastName;
        document.getElementById('editPhone').value = user.phone || '';
    }).catch(()=>{});
}

function hideEditProfile() { document.getElementById('editProfileForm').style.display = 'none'; }

function showDeletionRequest() { document.getElementById('deletionRequestForm').style.display = 'block'; window.scrollTo(0, document.getElementById('deletionRequestForm').offsetTop - 100); }
function hideDeletionRequest() { document.getElementById('deletionRequestForm').style.display = 'none'; document.getElementById('deletionReason').value = ''; }

// Expose to global scope for inline handlers
window.showMessage = showMessage;
window.showNotification = showNotification;
window.showSection = showSection;
window.showHome = showHome;
window.showPrivacyPolicy = showPrivacyPolicy;
window.showTerms = showTerms;
window.showRegisterForm = showRegisterForm;
window.showLoginForm = showLoginForm;
window.logout = logout;
window.showEditProfile = showEditProfile;
window.hideEditProfile = hideEditProfile;
window.showDeletionRequest = showDeletionRequest;
window.hideDeletionRequest = hideDeletionRequest;
window.showDashboard = showDashboard;
