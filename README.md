# Farges Films

Rooms to watch films in, for Meta Quest 3. A static web app: open it in the Quest Browser, press **Enter VR**, then open your film in a browser window and place it over the black screen.

## Rooms

- **The Conference Room** (`rooms/office.js`) — an original mid-2000s paper-company conference room.

Each room is built entirely in code (no downloaded models or images) and lives in its own file under `rooms/`.

## Controls

- Point a controller at the light switch on the right-hand wall and pull the trigger to bring the lights down or up. The grip button does the same from anywhere.
- On a computer: drag to look around, press `L` for the lights.

## Run locally

Serve the folder with any static file server, for example `python3 -m http.server`, and open the address it prints. There is no build step. three.js is vendored in `vendor/`.
