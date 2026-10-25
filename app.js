const clientID = "YOUR_SPOTIFY_CLIENT_ID";
const redirectUri = "http://localhost:3000/callback"; // or point to your live URL
const scopes = "user-read-private playlist-modify-public playlist-modify-private";

// Helper: Generate random string for PKCE
function generateRandomString(length) {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

// Helper: Base64 URL encode
async function generateCodeChallenge(codeVerifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Trigger Login
document.getElementById('login-button').addEventListener('click', async () => {
    const codeVerifier = generateRandomString(64);
    window.localStorage.setItem('code_verifier', codeVerifier);

    const codeChallenge = await generateCodeChallenge(codeVerifier);

    const authUrl = new URL("https://spotify.com");
    const params = {
        response_type: 'code',
        client_id: clientID,
        scope: scopes,
        code_challenge_method: 'S256',
        code_challenge: codeChallenge,
        redirect_uri: redirectUri,
    };

    authUrl.search = new URLSearchParams(params).toString();
    window.location.href = authUrl.toString();
});

// Handle the redirect callback on page load
window.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (code) {
        const codeVerifier = window.localStorage.getItem('code_verifier');

        const response = await fetch('https://spotify.com', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientID,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: redirectUri,
                code_verifier: codeVerifier,
            }),
        });

        const data = await response.json();
        if (data.access_token) {
            window.localStorage.setItem('access_token', data.access_token);
            // Clean URL and show app UI
            window.history.replaceState({}, document.title, "/");
            // Inside your code where login succeeds:
            document.getElementById('login-section').style.display = 'none';
            document.getElementById('app-container').style.display = 'flex'; // Uses flex to match the new CSS

        }
    } else if (window.localStorage.getItem('access_token')) {
        // Inside your code where login succeeds:
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex'; // Uses flex to match the new CSS

    }
});
