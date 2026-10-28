# Render uptime

The backend exposes `GET /api/keepalive` and starts an opt-out keep-alive on Render. When `RENDER_EXTERNAL_URL` is present, the server calls its public keep-alive URL every 9 minutes. The interval is capped below Render's 15-minute idle window.

Render sets `RENDER_EXTERNAL_URL` automatically for web services. No secret is stored in the repository. To override the target, set `KEEP_ALIVE_URL` in Render Environment Variables. To disable it, set `KEEP_ALIVE_ENABLED=false`.

This reduces idle spin-down on a normally running instance. Render can still restart a service, suspend it for plan or usage limits, or change Free-tier behavior. For the strongest external check, add `https://floorguard.onrender.com/api/keepalive` to an external monitor such as Better Stack or HeyOnCall. Render recommends an external monitoring probe for uptime, and paid compute removes Free-service spin-down entirely.
