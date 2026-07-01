// Globals
window.currentUser = null;
window.authToken = null;
window.privacyPolicy = null;
window.termsOfService = null;

document.addEventListener('DOMContentLoaded', () => {
    // Load policies and cookie consent
    if (window.loadPrivacyPolicy) window.loadPrivacyPolicy();
    if (window.loadTermsOfService) window.loadTermsOfService();
    checkCookieConsent();

    const storedUser = localStorage.getItem('currentUser');
    const storedToken = localStorage.getItem('authToken');
    if (storedUser && storedToken) {
        window.currentUser = JSON.parse(storedUser);
        window.authToken = storedToken;
        document.getElementById('dashboardLink').style.display = 'block';
        document.getElementById('logoutLink').style.display = 'block';
        showDashboard();
    }
});

function checkCookieConsent() {
    const consent = localStorage.getItem('cookieConsent');
    if (!consent) {
        const el = document.getElementById('cookieConsent');
        if (el) el.classList.add('active');
    }
}

function acceptCookies() { localStorage.setItem('cookieConsent','accepted'); const el = document.getElementById('cookieConsent'); if (el) el.classList.remove('active'); }
function rejectCookies() { localStorage.setItem('cookieConsent','rejected'); const el = document.getElementById('cookieConsent'); if (el) el.classList.remove('active'); }

// Expose cookie consent functions
window.checkCookieConsent = checkCookieConsent;
window.acceptCookies = acceptCookies;
window.rejectCookies = rejectCookies;
