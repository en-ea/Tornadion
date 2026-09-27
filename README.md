# Tornadion

Small 3D tornado-chasing browser game (phone-first), inspired by Roblox "Twisted".
Three.js r160 loaded from jsDelivr via an import map. No build step, no npm.

## Files
- `index.html` – canvas, HUD (FPS, speed), touch joystick + buttons, import map.
- `src/main.js` – renderer, lights, fog, chase camera, game loop, HUD updates.
- `src/world.js` – map (1200 m square): road grid every 200 m (x=0 / z=0 highways, rest dirt),
  cornfields/wheat/pasture cells, town at the crossing, gas / repair / dealership (`PLACES`),
  lakes, river at x=-500, farmsteads, trees, power poles. Exposes `surfaceAt(x,z)` and `collide(pos,r)`.
- `src/car.js` – "Dionado" SUV model (friend's colours) and arcade driving physics.
- `src/controls.js` – left-half floating joystick, BOOST / BRAKE buttons, WASD/arrows + Shift/Space on PC.

## Performance rules
Repeated objects are `InstancedMesh` (one draw call each), Lambert materials, no real shadows
(blob shadow under car), pixel ratio capped at 1.5, fog hides the far map. FPS + draw calls shown top-left.

## Run
ES modules need a web server (double-clicking index.html won't work). Any static server works,
e.g. `python -m http.server` in this folder, then open http://localhost:8000.
Currently also published as a claude.ai artifact.

## Roadmap
1. ✅ Map + drivable car
2. One tornado (moves, grows/shrinks, EF rating, debris, flings car)
3. Weather-balloon probe deploy/undeploy, mesonet wind readout, money
4. Upgrades, dealership (vehicles from wishlist), repair, fuel
5. Radar map, storms/rain/hail/lightning, day/night, twins/special tornadoes
