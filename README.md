# Tornadion

Low-poly storm-chasing game for phone and desktop browsers (Three.js + Vite, plain JS, Web Audio; co-op runs over a public MQTT relay).

## Run
    npm install
    npm run dev      # prints a Network URL like http://192.168.x.x:5173, so open it on a phone on the same Wi-Fi
    npm run build    # static site in dist/ (Netlify builds this from GitHub, see netlify.toml)
PC keys: WASD drive, Shift boost, Space brake, E probe, Q probe type, F anchor, C photo, V video, Z zoom, H horn, M map, Esc menu.

## Files (src/)
- `main.js`: setup, save/load/export, game loop, cameras (title orbit, chase, binoculars), HUD, photos, surveys, services.
- `ui.js`: title screen, pause menu tabs, dealership, settings, save import/export, co-op panel, survey rating, tutorial.
- `world.js`: 1200 m map (terrain, fields, roads, river/lake, towns, farms, trees, power lines, mesonets), colliders, breakables.
- `car.js`: vehicle model + physics, paint/decals/light bar, upgrades, damage. `vehicleModel()` builds other players' cars.
- `vehicles.js`: vehicle list, upgrades, paints, decals, horns, gear.
- `weather.js`: sky, day/night, supercells, rain/hail, `windAt()`, tornado/landspout/dust-devil spawning, co-op snapshots.
- `tornado.js`: EF0-EF5 + mutants, rope/cone/wedge/stovepipe funnels, rain-wrapped, waterspouts, satellites, turns, rope-out.
- `probes.js`: pod, turtle, weather balloon, camera, rocket and drone probes.
- `jobs.js`: daily missions, video, live TV, core punch, storm reports, rescues, gear payouts.
- `progress.js`: achievements, chase log, photo album, records.
- `coop.js`: online co-op over a public MQTT relay (built-in client): shared weather, destruction, probes, surveys, rescues, chat.
- `audio.js`: synthesized engine, wind, siren, horns, SFX and adaptive music.
- `radar.js`, `debris.js`, `controls.js`, `util.js`.
