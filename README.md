# Neurix

React / Vite / TypeScript app with AI Chat, Image Generation and Neurix Vision (`/vision`).

## Run locally

`npm install` then `npm run dev`. The server binds to `0.0.0.0:3000`, so a phone on the same Wi-Fi can open the network address printed by Vite. Chat and image IDs work on HTTP as well as HTTPS.

The camera needs a secure context. On Windows, run `npm run setup:phone`, then keep `npm run dev:phone` running alongside the HTTP server. Open `http://<PC-Wi-Fi-IP>:3000/phone.html` on the phone and follow its certificate steps. Then open `https://<PC-Wi-Fi-IP>:3443/vision`. The setup creates a private local server certificate in ignored `.local/`; only its public root certificate is shared. The root private key remains non-exportable in the current Windows user's certificate store. iPhone requires installing the profile and enabling full trust in Settings; see [Apple's instructions](https://support.apple.com/en-us/102390). Re-run setup if the PC's address changes. Ports 3000 and 3443 must be reachable through the PC firewall and Wi-Fi client isolation must be off.

Add the secure Vision page to the phone's home screen for standalone display. Camera/voice capability and model loading remain browser-dependent; this app does not promise offline AI.

## Vision API

The same validated `handleVisionRequest` serves `/api/vision` in Vite development and in the Vercel Edge function. Set `OPENROUTER_API_KEY` and `VISION_MODEL` on the server. Local `.env.local` is ignored by version control. Existing deployments can temporarily reuse `VITE_OPENROUTER_API_KEY`; prefer the server-only variable for Vision. The default model is `dots-studio/dots-3-note-preview:free`, verified as accepting image inputs when configured. Provider availability and free-model limits can change; select an image-input model from [OpenRouter's model API](https://openrouter.ai/docs/guides/overview/models).

No AI request happens during scanning. The user sends a single compressed camera frame with a question. Opted-in follow-ups require a changed, usable view and are capped at three. The endpoint validates scene context, limits body size, times out, and returns useful provider/configuration errors. Its in-memory request limiter is per server instance. Search explicitly opens web results; the model does not pretend it has read them.

## Scan and hand tracking

The black/white scan uses local camera feature tracking, optical flow, persistent feature IDs, contour and surface points. It is a temporary 2D visual map, not raw LiDAR or measured 3D depth. Up to 32,000 points render using WebGPU, with WebGL and reduced Canvas fallbacks. Rendering runs on every animation frame; camera capture requests 60 FPS, subject to device support. Lower-frequency analysis stays in workers and adapts to processing cost.

The detailed scan needs at least 240 useful observations and multiple distinct viewpoints, rather than a countdown. Fast pans, dark frames, blur, a stationary view and repeated small shakes cannot complete it. Point appearance and movement are interpolated independently of tracking. The camera stream stays alive through the point-cloud-to-camera crossfade.

MediaPipe 1.0.1 loads object and hand models locally in a worker. Its two model instances use distinct WASM-loader module URLs to avoid the `ModuleFactory not set` ESM-cache bug. Hand landmarks become subtle white points during the scan. Extended-index pointing ranks detected objects along the pointing ray. Local processing downloads model assets from Google/jsDelivr; it does not upload frames to them. Camera tracks, model workers and temporary memory are released when the page is hidden or the route exits.

## Verification

- `npm run typecheck`
- `npm run build`
- `npm test` — permissions, camera lifecycle, HTTP UUID fallback, reference tracking and API validation.
- `npm run test:scan` — image evidence, stationary/blur/black rejection, prolonged scanning and point-map decay.
- PowerShell: `$env:RUN_VISION_MODEL_TEST='1'; npm test` adds real model loading, blank-frame rejection and positive hand-photo detection. It downloads official model/test assets.

Physical iPhone camera performance and certificate installation need verification on the phone. Automated browser tests use native synthetic camera tracks and Chromium, not a claim of device-tested 60 FPS.
