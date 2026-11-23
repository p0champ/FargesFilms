# Farges Films

Rooms to watch films in, for Meta Quest 3. A static web app: open it in the Quest Browser, press **Enter Room**, pick a streaming service from the floating panel, and place its browser window where you like.

## Rooms

- **The You Seminar** (`rooms/soul.js`) — the pastel hills from Soul. The far landscape is a 360-degree backdrop made from one wide still by `studio/make_pano.py`; the ground, mounds, trees and drifting lights near the seat are real 3D.
- **Dunder Mifflin** (`rooms/bullpen.js`) — the bullpen from The Office, modelled and lit in Blender by `studio/office_bullpen.py`. To be revisited.

## Controls

- **In the headset:** point at the panel and pull the trigger. Squeeze the grip to hide or show the panel; when it is hidden, any trigger pull brings it back. The panel has three tabs: Rooms, Streaming and Settings (lighting, leave the room).
- **On a computer:** drag or use the arrow keys to look around; `L` toggles the lights. Add `?panel=1` to the address to preview the headset panel.

## Run locally

Serve the folder with any static file server, for example `python3 -m http.server`, and open the address it prints. There is no build step. three.js is vendored in `vendor/` and the Inter typeface in `fonts/`.

## Making a room from a still

`python3 studio/make_pano.py <wide_still.png> assets/<name>_pano` (needs `opencv-python-headless`) writes `<name>_pano_8k.jpg` and `_4k.jpg`. The still should be a wide, character-free landscape; it is mirrored four times around the horizon and its sky and ground are extended. Copy `rooms/soul.js` as a starting point for the room.
