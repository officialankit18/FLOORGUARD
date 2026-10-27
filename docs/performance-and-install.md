# Loading and mobile installation

The dashboard keeps history and telemetry in session memory across Home, Camera
and Settings. Concurrent requests share a promise. Recent history is reused for
60 seconds, and older data stays visible while a background request refreshes it.
One shared WebSocket applies new events and device readings on every route.
Reconnection refreshes missed history; duplicate event IDs are only counted once.
The MQTT connection stays mounted above the router. Camera and MQTT code are
separate downloads, and face models load only when the Camera page is opened.

The header wordmark is made of SVG paths traced from the supplied original,
including its tagline and decorative lines. No installed font or embedded bitmap
is needed. The small header emblem preserves the entire original illustration.

The manifest provides separate 192px and 512px standard and maskable PNGs. The
maskable versions fit the entire square illustration within 55% of the canvas,
so its corners remain inside Android's central circular safe zone. The app also
provides an Apple touch icon and a small favicon. To rebuild these assets, make
the `sharp` Node package available and run `node scripts/build-branding.cjs`.

Production builds generate a versioned service worker. Installation precaches
only the small shell, SVG and icons; it does not wait for face models, cloud
history or camera streams. Previously downloaded static assets and face models
are cached on demand. API requests, MQTT settings, visitor snapshots and commands
are never put in the service-worker cache. Cached shell navigation works offline;
live device controls and history synchronization require a network connection.

Existing Android installations can retain their old launcher artwork until the
browser updates the installed app. After the Render deployment succeeds, open the
site once online. If Android still shows the old cropped icon, remove the old
home-screen installation and install it again using Chrome's Add to home screen.
There is no custom installation button.

Render's free-service startup and Chrome's Android installer are outside this
app's control; a sleeping backend or OS installation may still take time.
