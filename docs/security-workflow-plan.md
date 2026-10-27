# FLOORGUARD workflow and redesign plan

## Gate workflow
- [ ] Keep entrance monitoring active across app navigation.
- [ ] Register household members with name and face reference.
- [ ] Recognize a registered member, request door opening once per visit, and log identity and timestamp.
- [ ] Show command delivery separately from device-confirmed door state.
- [ ] Capture unknown visitors, save their image and timestamp, and send a silent notification.
- [ ] Provide independent Open door and Mark attended actions.
- [ ] Never sound the intrusion alarm for an unknown face alone.

## Floor-mat workflow
- [ ] Distinguish entrance camera and floor-area camera roles.
- [ ] On a real piezo intrusion, capture the floor camera and attach the photo to that incident.
- [ ] Keep the in-app audible alarm active until explicitly stopped.
- [ ] Offer Stop alarm and Call emergency actions globally.
- [ ] Configure emergency contacts in Settings.
- [ ] Persist alarm start, acknowledgement, stop request and device confirmation.

## History and interface
- [ ] Add History before Settings in bottom navigation.
- [ ] Date range, event category, person search, daily totals and repeat-visitor counts.
- [ ] Export filtered date-wise history to CSV.
- [ ] Fresh light default palette, coordinated dark mode and saved preference.
- [ ] English-only copy, mobile layouts, loading/empty/error states and existing branding.
- [ ] Preserve shared data cache, live updates and existing member data.
- [ ] Verify build, tests and phone layouts; leave changes local, with no GitHub push.

## Integration findings requiring resolution before hardware completion
- Existing MQTT protocol accepts only set_door with a boolean on field.
- Two different UNO sketches exist: one controls a servo; another uses doorOn as a sensor-arming condition. Identify the flashed sketch before defining automatic opening semantics.
- Neither provided sketch currently accepts a remote stop-alarm command.
- Recognition currently runs only while Camera is mounted; it needs an app-level monitoring owner.
- Current notifications sound for unknown faces; this contradicts the requested silent gate workflow.
- A browser/PWA cannot guarantee continuous ringing or camera recognition after the OS suspends it. Closed-app notifications require Web Push; continuous camera processing needs an always-on local gateway or device.
- Render cannot fetch a camera's private LAN address. Remote cameras require a reachable relay/upload path.
- Current in-memory history is capped at 500 events; complete historical queries and exports must read persisted history rather than relying only on that cache.
