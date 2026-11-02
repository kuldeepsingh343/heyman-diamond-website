# Instagram Reels feed setup

The homepage reads recent Reels from the connected Instagram professional account through the server-side `GET /api/instagram/reels` endpoint. The access token is kept in the API server environment and is never placed in a `VITE_` variable or sent to the browser.

## Meta account setup

1. Use an Instagram Business or Creator account and connect it to the Facebook Page required by the Instagram Graph API login method.
2. Set up a Meta app with the permissions required to read the connected account's media. Complete any Meta app review or business verification required for the account and intended audience.
3. Obtain the Instagram professional account's numeric user ID and a valid access token with permission to read its media.
4. Configure these server-side environment variables in the hosting provider:

   - `INSTAGRAM_USER_ID`: Instagram professional account ID.
   - `INSTAGRAM_ACCESS_TOKEN`: access token with the required media-read permission. Keep it secret and rotate it according to Meta's token lifecycle.
   - `INSTAGRAM_GRAPH_API_VERSION`: a currently supported version in the format `vNN.N` (for example, `vXX.X` is a placeholder, not a valid version).

Do not use `VITE_` prefixes for Instagram credentials. Never commit real tokens to the repository.

## Behavior

The API reads the account's latest media, selects items identified by Meta as Reels, and caches successful results for five minutes. The homepage refreshes the feed every five minutes and displays Reel thumbnails in a horizontally scrollable carousel; selecting a Reel opens its Instagram permalink. New Reels should appear after the cache/refresh interval. This is polling, not an instant webhook.

The feed includes posts published by the connected account. It cannot automatically read posts from individual team members' separate Instagram accounts unless those accounts are separately authorized and the integration is extended to support them.

For local development, start the API with `npm run start:api` and the Vite app with `npm run dev`. The Vite `/api` proxy forwards requests to the local API server.
