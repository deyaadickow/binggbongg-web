# Bingg Bongg — web app (www.binggbongg.com)

Phase 1 (2026-09-23): sign in, For You feed, video playback, profiles, search, Live Now, watching a live
with chat and gifts, wallet and coin purchase. Same backend as the phones (admin.binggbongg.com/api),
same LiveKit token server, same Firestore live chat.

## Run locally
    npm install
    cp .env.example .env   # add VITE_GOOGLE_CLIENT_ID
    npm run dev

## Build + deploy (cPanel, same host as admin.binggbongg.com)
    npm run build
    # upload the contents of dist/ to the document root of www.binggbongg.com, plus a .htaccess that
    # rewrites every path to index.html (single-page app):
    #   RewriteEngine On
    #   RewriteBase /
    #   RewriteRule ^index\.html$ - [L]
    #   RewriteCond %{REQUEST_FILENAME} !-f
    #   RewriteCond %{REQUEST_FILENAME} !-d
    #   RewriteRule . /index.html [L]

## Sign-in
Google Identity Services in the browser. Needs a "Web application" OAuth client id in the binggbongg-prod
Google Cloud project with https://www.binggbongg.com as an authorised JavaScript origin. That id goes in
`.env` here AND must be appended to `GOOGLE_SIGNIN_CLIENT_IDS` in the backend's `.env` (registration
verifies the ID token in enforce mode). Until then the Sign in page says Google sign-in isn't configured.
`/login?dev=1` offers a developer sign-in with an existing app session (user id + session token).
