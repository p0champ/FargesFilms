# Farges Films

Rooms to watch films in, for Meta Quest 3. A static web app: open it in the Quest Browser, press **Enter Room**, pick a streaming service from the floating panel, and place its browser window where you like.

## Rooms

- **The Office** (`rooms/bullpen.js`) — the bullpen, seen from a desk in the middle of the room.

A room is modelled and lit in Blender by a script in `studio/`, which paints the finished lighting onto the surfaces and exports a 3D model plus texture sheets into `assets/`. The app draws that model in real time.

## Controls

- **In the headset:** point at the panel and pull the trigger. Squeeze the grip to hide or show the panel; when it is hidden, any trigger pull brings it back. The panel has three tabs: Rooms, Streaming and Settings (lighting, leave the room).
- **On a computer:** drag or use the arrow keys to look around; `L` toggles the lights. Add `?panel=1` to the address to preview the headset panel.

## Run locally

Serve the folder with any static file server, for example `python3 -m http.server`, and open the address it prints. There is no build step. three.js is vendored in `vendor/` and the Inter typeface in `fonts/`.

## Rebuilding a room

`python3 studio/office_bullpen.py bake <output_dir> 4096 32` (needs `pip install bpy`) writes `bullpen.glb` and three PNG texture sheets; convert the sheets to JPEG and copy everything into `assets/`. `preview` mode renders a still for checking the model.
