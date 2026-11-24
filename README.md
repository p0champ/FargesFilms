# Farges Films

Rooms to watch films in, for Meta Quest 3. A static web app: open it in the Quest Browser, press **Enter Room**, pick a streaming service from the floating panel, and place its browser window where you like.

## Rooms

Made from one wide film still each (`rooms/backdrop.js`, or `rooms/soul.js` for the first): the far scenery is a 360-degree backdrop built by `studio/make_pano.py`, with a small patch of real 3D ground under the seat.

- **The You Seminar** — Soul
- **The Shire**, **Rivendell** — The Lord of the Rings
- **Tatooine**, **Endor**, **Dagobah** — Star Wars
- **The Dawn of Man** — 2001: A Space Odyssey

Drawn entirely live (`rooms/space.js`):

- **The Great Beyond** — Soul: a moving walkway rising through stars toward a white light
- **Earth Orbit** — 2001: a deck above the Earth with a wheel station turning in the distance

Modelled and lit in Blender (`rooms/bullpen.js`, `studio/office_bullpen.py`):

- **Dunder Mifflin** — The Office. To be revisited.

## Controls

- **In the headset:** point at the panel and pull the trigger. Squeeze the grip to hide or show the panel; when it is hidden, any trigger pull brings it back. The panel has three tabs: Rooms, Streaming and Settings (lighting, leave the room).
- **On a computer:** drag or use the arrow keys to look around; `L` toggles the lights. Add `?panel=1` to the address to preview the headset panel.

## Run locally

Serve the folder with any static file server, for example `python3 -m http.server`, and open the address it prints. There is no build step. three.js is vendored in `vendor/` and the Inter typeface in `fonts/`.

## Making a room from a still

`python3 studio/make_pano.py <wide_still.png> assets/<name>_pano [horizon] [options]` (needs `opencv-python-headless`) writes `<name>_pano_8k.jpg` and `_4k.jpg` and prints ground colours sampled from the still. See the top of the script for the options. Then add an entry to `STILL_ROOMS` and `ROOM_CARDS` in `main.js`, and a 640x360 `assets/<name>_thumb.jpg`.

Open landscapes work best. Anything close to the camera (tree trunks, cliffs) shows the mirroring where the copies of the still meet.
