# Tornadion

Low-poly storm-chasing game for phone browsers (Three.js + Vite, plain JS, Web Audio).

## Run
    npm install
    npm run dev      # prints a Network URL like http://192.168.x.x:5173, so open it on a phone on the same Wi-Fi
PC keys: WASD drive, Shift boost, Space brake, E probe, F anchor, C photo, Z zoom, H horn.

## Files (src/)
- `main.js`: setup, game loop, chase/binocular camera, HUD, probes, photos, money/XP (localStorage), gas/repair pads, tow & respawn.
- `world.js`: 1200 m map (terrain, fields, corn, roads, river/lake, 3 towns, farms, trees, fences, cows, bales, power lines, mesonets). Colliders + breakables (instanced), `kill`/rebuild after ~4 min.
- `car.js`: Dionado SUV model + physics (wind push, fling, landing damage, dents, cracked windows, anchor spikes + shutters, fuel, smoke).
- `weather.js`: sky, day/night, supercells (wall cloud, rain/hail curtains, lightning), local rain/hail, `windAt()`, tornado spawning & world destruction.
- `tornado.js`: EF0-EF5 table, rope/cone/wedge shader funnel, dust + debris swirl, wind field, lifecycle, twins.
- `debris.js`: flying trees/cars/cows/planks that orbit, get thrown and hit the player.
- `audio.js`: synthesized engine, jet, wind/tornado roar, rain, thunder, siren, horn, SFX.
- `util.js`: RNG/noise, `Kit` (merge flat-shaded vertex-coloured geometry), helpers.

## Done (steps 1-5, mostly)
Map, player, tornadoes, storms/weather, damage, probes, photos, mesonet readout, anchor, binoculars, XP.

## Next
- Radar/storm map canvas with tornado tracks, damage surveys (tornado.damage[] already records hits), menu (relaxed mode, leaderboard).
- Then steps 7-12: dealership & vehicles, upgrades, mutant tornadoes, polish, hosting.
