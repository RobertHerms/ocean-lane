# Exterior accuracy pass — round 5

Branch **`interior-accuracy`**, draft PR #1. The rules of `CLOUD_PLAN.md` §0 apply:

- never push to `main`, never merge;
- commit as `Ocean Lane <ocean-lane@users.noreply.github.com>`, each message ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
- no names, addresses or personal images;
- don't touch `baked/*`, the kids files, or the robots meta;
- lamps are `'down'` or `'omni'` only.

**Before every commit:**
- run `node --check` on each file you edited;
- load `index.html?nobake`; the console must show no errors.

Only then commit, and **push after every commit.**

Check geometry with `tools/shots.mjs` (`index.html?nobake`). If the screenshot tooling won't start within a few minutes, use `node --check` plus careful reasoning and say so in the PR.

---

## What changes and why

The owner compared the model with three new street photos. They are in the repo, redacted, next to the earlier two:
- `reference/outside_front2.jpg`: straight-on front.
- `reference/outside_entry.jpg`: close-up of the entry bay and door.
- `reference/outside_side.jpg`: oblique view from the south-east (stoop, railings, garden wall, bow, playroom windows, overhang).
- `reference/outside_front.jpg` and `reference/outside_above.jpg` (from round 4).

Every measurement taken from them is already written into this plan. Look at the photos to understand what you're building, but **use the plan's numbers and don't re-measure**. The photos are reference only: never load them at runtime or reference them from `index.html` or JS.

The owner's notes:

1. **Window style.** Every window is white vinyl with clear glass. There are no grilles and no meeting rails: each window is either one tall lite or lites side by side.
   - The bedroom windows over the garage are short twin lites set high, with a thin flat trim.
   - The playroom has three equal units with stone piers between them and one stone sill under all three.
2. **Garden wall.** It is one continuous low ledgestone wall with a pale cap.
   - It curves from the bottom steps round a front lobe that reaches to under the third playroom window.
   - It pinches in at a waist, runs along a rear lobe and ends at the playroom's south-east corner.
   - The bed behind it is planted with tall grasses.
3. **Railings.** There is a white vinyl rail down each side of the stoop only: a level run on the landing, then a sloped run to a lower landing. There is no rail across the landing front and none on the bottom steps.
4. **2nd-floor overhang.**
   - The upper storey projects **2.1 ft** past the garage wall and about **0.4 ft** past the playroom wall.
   - The underside is a flat white soffit, and the stone runs straight up to it with no cap.
   - The bow window is a cantilevered unit. Its underside sits about 1.2 ft above the soffit, with flat shakes under it in the wall plane.
5. **Interior dimensions follow from this.** The lower walls stay on the floor-plan lines, and the upper front walls move south. Bedrooms 2 and 3 get 2.1 ft deeper and the living room gets 0.4 ft deeper. The garage and the playroom do not change.
   - Both floor plans draw the same front lines (28' and 35'). The 2nd-floor plan puts the bedroom windows in the 28' line and shows a 7' step to the living room.
   - We keep the lower walls on the plan and move the upper walls out. This knowingly departs from the 2nd-floor plan: the upper step becomes 5.4'. The owner is asked to confirm this in the PR.
6. **Entry recess.** The stone runs from the door head up to a white ceiling at about 17.5, level with the bedroom window heads. There is no white band over the door.

**Global rules for this round:**
- Do **not** re-measure anything and do not "improve" any values. Use the numbers exactly as given here.
- Do not add rooms. Do not touch lower-level interiors, blinds, the front door or sidelights, the patio slider, or anything else not listed here.
- Do **not** re-bake. The geometry changes invalidate the lightmap, so check everything with `?nobake`.
- Line numbers are from the pre-round-5 files and will drift as you edit. **Always find the anchor text**, not the line number.
- `house.js` reads layout values as `L.*` (for example `L.MAIN`, `L.PWF`). Never write a bare `LOW` or `MAIN` in `house.js`.

## Coordinates reminder

- Units are feet. **x** = east, **z** = south (the street is +z, around z 65–75), **y** = up.
- Levels: `LOW` 0, `MID` 5, `FRONT` 6.875 (the entry landing), `MAIN` 10, `LOW_CEIL` 9.5, `MAIN_CEIL` 18.
- Walls are given as centrelines. Exterior walls are `EXT_T` 0.5 thick, so the outer face is 0.25 out from the centreline. `WALL_T` is 0.4.
- **Free wall ends.** `walls()` runs a free wall end on by half its thickness. It does not do this where a collinear wall continues and their height ranges overlap (`joinedAt`). Every end value below already allows for this.
- Front, west to east:
  - garage x 0–20.8 (lower wall at z 27.9, outer face 28.15);
  - entry bay x 20.8–28.8 (door wall at z 30, outer face 30.25);
  - living/playroom block x 28.8–45 (lower wall at z 35, outer face 35.25).
- Camera: `window.__house.snap(x, z, feet, yaw, pitch)`.
  - Eye height is feet + 5.35.
  - Yaw: 0 looks north, π south, +π/2 west, −π/2 east.
  - Positive pitch looks up.
- Runtime checks use `window.__house.player` (`x`, `z`, `feet`) and `window.__house.keys`, a Set. Add `'w'` to walk forward and delete it to stop.

## 0. Check the branch first

- Check that `tools/shots.mjs` exists on `interior-accuracy`. If it is missing, recreate it exactly as `CLOUD_PLAN.md` §0b describes. That is the only tooling allowed.
- The reference photos are in `reference/` (listed above). Don't add, edit or re-commit photos. Everything you need to build is in this plan.

---

## 1. Upper-floor overhang: the upper storey steps out past the lower front walls, with all interior and exterior consequences

**Goal:**
- **Lower walls stay where they are:** the garage-door wall at `GARAGE_Z` = 27.9 and the playroom wall at z 35.
- **Upper walls move south:**
  - bedrooms 2/3 front wall to **z 30.0**, in the same plane as the front-door wall;
  - living-room front wall to **z 35.4**.
- **Soffit:** flat and white at **y 9.4**.
- **Bow window:** its underside is at **y 10.6** (`BOW.base`), with flat shakes below it. Inside there is a low window seat at **10.75** (`BOW.seat`).
- **Entry recess ceiling:** raised to **17.5**.
- **Nothing changes on the lower level.**

### 1a. `layout.js`: constants, rooms, walls, floors, fixtures

1. **Constants.**
   - Anchor: `export const GARAGE_Z = 27.9;  // garage door line / bedroom south wall`
   - Replace that line with:
   ```js
   export const GARAGE_Z = 27.9;  // garage door line (lower storey front)
   // The upper storey cantilevers past the lower front walls: 2.1' over the garage, ~5" over the playroom.
   export const UP_BR_Z = 30.0;           // bedrooms 2/3 front wall (in the plane of the front-door wall)
   export const UP_LIV_Z = 35.4;          // living-room front wall (lower playroom wall stays at 35)
   export const SOFFIT_Y = LOW + 9.4;     // underside of the overhangs
   ```
2. **`BOW`.** Replace the whole `export const BOW = { x0: 31.2, x1: 43.5, z: 35, ... };` line with:
   ```js
   export const BOW = { x0: 31.2, x1: 43.5, z: UP_LIV_Z, sag: 1.45, n: 5, sill: MAIN + 1, head: MAIN + 7, ceil: MAIN + 7.35,
     base: MAIN + 0.6, seat: MAIN + 0.75 };   // cantilevered: underside 1.2' above the overhang soffit; a window seat inside
   ```
3. **`HIX` range.** After `const HI = [MAIN - 0.1, MAIN_CEIL];`, add:
   ```js
   const HIX = [SOFFIT_Y, MAIN_CEIL];   // upper exterior walls over an overhang: hang down to the soffit
   ```
4. **ROOMS.**
   - Replace the `room('liv', …)` line and the `room('br2', …)` line (two adjacent lines) with the first block below.
   - Then replace the `room('br3', …)` line with the second block.
   - The `room('clB', …)` line between them stays exactly as it is.
   ```js
     room('liv', 'Living Room', [MAIN, MAIN_CEIL], [[28.8, 45, 20, UP_LIV_Z]], 'wood', PAINT.tan, { crown: true, bay: [31.2, 43.5, UP_LIV_Z, UP_LIV_Z + 1.2] }),
     room('br2', 'Bedroom 2', [MAIN, MAIN_CEIL], [[0, 10.7, 14.3, UP_BR_Z]], 'wood', PAINT.grey, { rug: [1.2, 9.6, 20.3, 28.5, 'rugGrey'] }),
   ```
   ```js
     room('br3', 'Bedroom 3 (nursery)', [MAIN, MAIN_CEIL], [[10.7, 20.8, 18.2, UP_BR_Z], [10.7, 14.2, 17.9, 18.2]], 'wood', PAINT.grey, { rug: [11.8, 19.6, 21.5, 28.7, 'rugGrey'] }),
   ```
   The rugs move +2.1 with the beds and dressers (1b).
5. **WALLS.**
   - **West end of the garage overhang.** After `wz(0, 0, GARAGE_Z, ALL, [hiWin(8.3, 11.5), hiWin(14.9, 18.2)], EXT),` add:
     ```js
       wz(0, GARAGE_Z, UP_BR_Z, HIX, [], EXT),                 // west end of the garage overhang
     ```
   - **Garage wall split.** Replace the two-line `wx(GARAGE_Z, 0, 20.75, ALL, [open(1.6, ...` … `hiWin(13.6, 16.4)], EXT),` with:
     ```js
       wx(GARAGE_Z, 0, 20.75, LO, [open(1.6, 10.2, 0, 7, { garageDoor: 'gd1' }), open(10.8, 19.4, 0, 7, { garageDoor: 'gd2' })], { ...EXT, yCuts: [SOFFIT_Y] }),   // garage front (lower storey); faces split at the soffit
       wx(UP_BR_Z, 0, 20.35, HIX, [hiWin(4.55, 7.35), hiWin(13.6, 16.4)], EXT),   // bedrooms 2/3: upper storey, 2.1' out over the garage
     ```
     - The lower garage wall keeps its end at 20.75.
     - The upper bedroom wall ends at 20.35 so that its free end stops at x 20.6, where the entry-bay stone begins. Ending it at 20.75 would run it on to 21.0 over the door wall's stone and z-fight. Keep these values.
     - Item 2b replaces the windows later.
   - **Leave `wz(20.8, GARAGE_Z, 35, ALL, ...)` alone.** Item 3a changes it.
   - **East recess wall.** Keep `wz(28.8, 30, 35, ALL, [], EXT),` and add after it:
     ```js
       wz(28.8, 35, UP_LIV_Z, HIX, [], EXT),                  // recess side wall carries on under the living-room overhang
     ```
     Do not split the original wall into LO + HIX.
   - **Leave `wx(35, 28.8, 45, LO, [loWin…` unchanged for now.** Item 2c changes it; it stays at z 35.
   - **Living-room front walls.** Replace `wx(35, 28.8, 31.2, HI, [], EXT), wx(35, 43.5, 45, HI, [], EXT),` with:
     ```js
       wx(UP_LIV_Z, 28.8, 31.2, HIX, [], EXT), wx(UP_LIV_Z, 43.5, 45, HIX, [], EXT),
     ```
   - **Bow header wall.** Replace `wx(35, BOW.x0, BOW.x1, HI, [open(BOW.x0, BOW.x1, MAIN - 0.1, BOW.ceil)], { t: EXT_T }),` with:
     ```js
       wx(UP_LIV_Z, BOW.x0, BOW.x1, HIX, [open(BOW.x0, BOW.x1, MAIN - 0.1, BOW.ceil)], { t: EXT_T }),   // bowWindow() adds the shakes under the bow and the seat
     ```
   - **East end of the living-room overhang.** After `wz(45, 0, 35, ALL, [loWin(10.3, 14.3), ...], EXT),` add:
     ```js
       wz(45, 35, UP_LIV_Z, HIX, [], EXT),                    // east end of the living-room overhang
     ```
   - **Bedroom 2/3 partition.** `wz(10.7, 12.3, GARAGE_Z, HI, [door(14.8, 17.5, MAIN)]),` becomes `wz(10.7, 12.3, UP_BR_Z, HI, [door(14.8, 17.5, MAIN)]),`
6. **FLOORS.** Replace the three lines `{ r: [0, 20.8, 20, GARAGE_Z], h: MAIN }`, `{ r: [28.8, 45, 20, 35], h: MAIN }` and `{ r: [31.2, 43.5, 35, 36.2], h: MAIN }` with:
   ```js
     { r: [0, 20.8, 20, UP_BR_Z], h: MAIN },
     { r: [28.8, 45, 20, UP_LIV_Z], h: MAIN },
     { r: [31.2, 43.5, UP_LIV_Z, UP_LIV_Z + 1.2], h: BOW.seat },   // bow window seat
   ```
7. **SLABS and ROOF.** Nothing reads these; the edit is for consistency only.
   ```js
   export const SLABS = [[0, 45, 0, 20], [0, 20.8, 20, UP_BR_Z], [28.8, 45, 20, UP_LIV_Z], [42.2, 45, -3.3, 0]];
   export const ROOF = [[0, 45, 0, UP_BR_Z], [20.8, 45, UP_BR_Z, UP_LIV_Z], [35, 45, -8, 0]];
   ```
8. **FIXTURES.** Move the bedroom cans +1.05. Replace the two lines that begin `can(3, 18.5, …` and `can(13.6, 21, …` with:
   ```js
     can(3, 19.55, MAIN_CEIL), can(7.7, 19.55, MAIN_CEIL), can(3, 25.55, MAIN_CEIL), can(7.7, 25.55, MAIN_CEIL),
     can(13.6, 22.05, MAIN_CEIL), can(18, 22.05, MAIN_CEIL), can(13.6, 26.55, MAIN_CEIL), can(18, 26.55, MAIN_CEIL),
   ```

**Pitfalls:**
- The new constants must sit above `BOW`, because `BOW` uses `UP_LIV_Z`.
- Keep the bow header wall's opening starting at `MAIN - 0.1`. If the wall ran up to the seat, its outer face between 10 and 10.75 would be painted tan outside, because `roomAt` sees the bay rect there.
- Do not touch `GARAGE_DOORS`, the `gar` or `play` rooms, `stcl`, `foyer`, `START`, `RAILINGS`, or the walls `wz(20.8, 20, GARAGE_Z, …)` and `wz(28.8, 19.5, 30, [0, MAIN], …)`.

**Commit:** `Overhang: upper storey out to z 30 / 35.4 (layout data)`

### 1b. `layout.js`: furniture and art that stand against the moved walls

**FURNITURE.** Match by the current text and change only `r`, or `z` for the glider:

| Current | New |
|---|---|
| `sofa` `r: [42.0, 45, 24.4, 32.2]` (face 'w') | `r: [42.0, 45, 24.8, 32.6]` |
| `sofa` `r: [34.2, 42.0, 31.7, 34.7]` (face 'n') | `r: [34.2, 42.0, 32.1, 35.1]` |
| `endTable` `r: [42.3, 44.65, 32.4, 34.65]` | `r: [42.3, 44.65, 32.8, 35.05]` |
| `coffeeTable` `r: [36.8, 40.6, 27.0, 29.8]` | `r: [36.8, 40.6, 27.4, 30.2]` |
| `desk` `r: [29.05, 31.45, 30.6, 34.6]` | `r: [29.05, 31.45, 31.0, 35.0]` |
| `rugRect` `r: [34.5, 42.0, 23.8, 31.4]` | `r: [34.5, 42.0, 24.2, 31.8]` |
| `bed` `r: [0.35, 3.95, 20.6, 27.65]` | `r: [0.35, 3.95, 22.7, 29.75]` |
| nursery `dresser` `r: [15.0, 19.6, 26.2, 27.7]` | `r: [15.0, 19.6, 28.3, 29.8]` |
| `glider` `z: 26.45` | `z: 28.55` |

**ART.** Change only the value named:

| Piece | Change |
|---|---|
| `'abstract'` | a 28.3 → 28.7 |
| `'flower'` (`art('x', 34.75, …)`) | c 34.75 → 35.15 |
| `'hearts'` | a 26.5 → 28.6 |
| `'stripes'` | a 24.8 → 26.9 |
| `'dahlia'` | a 22.6 → 24.7 |
| `'dreamcatcher'` | c 27.65 → 29.75 |
| `'sailboat'` | c 27.65 → 29.75 |
| `'bw5'` (`art('z', 29.05, 1, 31.2, …)`) | a 31.2 → 31.6 |
| `'beach'` (`art('z', 29.05, 1, 32.55, …)`) | a 32.55 → 32.95 |
| `'bw2'` (`art('z', 29.05, 1, 32.55, …)`) | a 32.55 → 32.95 |
| `'skyline'` (`art('z', 29.05, 1, 33.9, …)`) | a 33.9 → 34.3 |

- Only the `29.05` living-room gallery lines change. Leave the other `bw5`, `beach`, `bw2` and `skyline` lines alone.
- Do not change any playroom, garage or bedroom 1 items.

**Commit:** `Overhang: move bedroom and living-room furniture/art to the new front walls`

### 1c. `materials.js` and `house.js`: finishes, soffits, eaves, corner boards, bow underside

1. **`materials.js`.** After `vinyl: { color: '#f5f4f0', roughness: 0.55 },` add:
   ```js
     trimBrown: { color: '#7f6b56', roughness: 0.6 },   // boards at both ends of the living-room overhang
   ```
   Keep `stoneCap`: the vent stack and round-5 items still use it.
2. **`house.js` `extFinish`.** Replace its two `if` lines with:
   ```js
     if (x > 20.55 && x < 29.1 && z > 27.6 && z < 35.7) return 'ledgestone';
     if (n[2] > 0.5 && z > 27.5 && y < L.SOFFIT_Y) return 'ledgestone';
   ```
3. **`bowWindow`: the bow becomes cantilevered.** Its underside is at `L.BOW.base` (10.6), with flat shakes under it in the wall plane and a window seat inside at `L.BOW.seat` (10.75). Make these edits:
   - Replace `b.poly(outline(I, z).map(([px, pz]) => [px, F, pz]), 'wood', { n: [0, 1, 0] });` with:
     ```js
       b.poly(outline(I, z - h).map(([px, pz]) => [px, L.BOW.seat, pz]), TRIM, { n: [0, 1, 0] });   // window seat top, from the header wall's inner face
     ```
   - In `b.poly(outline(O, z + h).map(([px, pz]) => [px, F - 0.6, pz]), 'soffit', …`, change `F - 0.6` to `L.BOW.base`.
   - Directly after the line `const paint = 'paint:' + L.PAINT.tan, ext = h * Math.tan(step / 2);`, add:
     ```js
       // cantilevered bow: flat shakes in the wall plane from the header wall's top up to its underside; the seat front inside
       b.poly([[x0, F - 0.1, z + h], [x1, F - 0.1, z + h], [x1, L.BOW.base, z + h], [x0, L.BOW.base, z + h]], 'siding', { n: [0, 0, 1], dens: 1.2 });
       b.poly([[x0, F, z - h], [x1, F, z - h], [x1, L.BOW.seat, z - h], [x0, L.BOW.seat, z - h]], paint, { n: [0, 0, -1] });
     ```
   - In the facet loop, change the first call `face(A0, A1, F, sill, zi, -1, paint);` to `face(A0, A1, L.BOW.seat, sill, zi, -1, paint);`. Leave the other calls on that line alone.
   - Replace `face(A0, A1, F - 0.6, F - 0.1, zo, 1, 'vinyl');` with:
     ```js
           face(A0, A1, L.BOW.base, sill, zo, 1, 'vinyl');   // white bottom band of the bow unit (0.4 ft)
     ```
     On the next line, delete only the first call, `face(A0, A1, F - 0.1, sill, zo, 1, 'siding');`. Keep the two siding calls beside the opening.
   - `y: [F - 0.6, TOP]` becomes `y: [L.BOW.base, TOP]`.
   - Leave the baseboard `extrude(sub, BASE, …)` line and the colliders as they are. The baseboard is now hidden under the seat, and the seat also hides the bottom 0.12 ft of the stool apron. That is expected.
4. **Roof constants.** Anchor: `const RX0 = -1, RX1 = 46, RZ0 = -1, RZ1 = 28.9, WX = 19.85, WZ = 37.2;`. Replace it with:
   ```js
   const RX0 = -1, RX1 = 46, RZ0 = -1, RZ1 = L.UP_BR_Z + L.EXT_T / 2 + 0.75, WX = 19.85, WZ = 37.6;   // eaves 0.75 out; WZ 0.5 past the bow apex
   ```
   - **Expected side effect:** the main ridge moves 1.05 ft south and about 0.44 ft up, and the hips move with it. This is intended.
   - Do not change `RZ0`, `PITCH` or `EAVE`.
5. **Downspouts in `exterior()`.**
   - Anchor: `for (const [x, z, gx, gz] of [[0.45, 28.32, 0.45, 29.11], [45.42, 34.5, 46.21, 34.5], [0.45, -0.42, 0.45, -1.21]]) {` and the first `b.mbox(x - 0.12, x + 0.12, 0, EAVE - 0.8, …` line inside the loop.
   - Replace those two lines with the code below. The other two `mbox` lines in the loop stay as they are.
   ```js
     const UZ = L.UP_BR_Z + L.EXT_T / 2;   // 30.25: outer face of the upper bedroom wall
     for (const [x, z, gx, gz, y0 = 0] of [[0.45, UZ + 0.17, 0.45, RZ1 + 0.21, L.SOFFIT_Y - 0.6], [45.42, 34.5, 46.21, 34.5], [0.45, -0.42, 0.45, -1.21]]) {
       b.mbox(x - 0.12, x + 0.12, y0, EAVE - 0.8, z - 0.15, z + 0.15, 'vinyl');
   ```
   - After the loop's closing `}`, add:
   ```js
     // the front one kicks back under the soffit to the garage wall and runs down it
     b.mbox(0.33, 0.57, L.SOFFIT_Y - 0.6, L.SOFFIT_Y - 0.3, 28.17, UZ + 0.32, 'vinyl');
     b.mbox(0.33, 0.57, 0, L.SOFFIT_Y - 0.3, 28.17, 28.47, 'vinyl');
   ```
6. **Entry porch: ceiling height and header.**
   - Replace `const PORCH = 14.3, hz0 = 35.2, hz1 = 35.3, hTop = roofUnder(24.8, hz1);` with:
     ```js
       const PORCH = 17.5, hz0 = 35.2, hz1 = 35.7, hTop = roofUnder(24.8, hz1);   // stone up to a ceiling level with the bedroom window heads
     ```
   - The header box `b.box(20.6, 29.05, PORCH, hTop, hz0, hz1, 'ledgestone', …);` stays ledgestone. After it, add:
     ```js
       // stone pier face at the living-room corner, soffit to header (covers the siding/stone corner under the overhang)
       b.box(28.55, 29.05, L.SOFFIT_Y, PORCH, L.UP_LIV_Z + 0.25, L.UP_LIV_Z + 0.3, 'ledgestone', { skip: ['nz'], dens: 2 });
     ```
7. **Corner boards, stone caps, soffits.** Replace everything from `// white corner boards on the outside corners of the shakes` through the third `'stoneCap'` box (`b.box(L.BOW.x1 + 0.05, 45.25, CAP, …);`) with:
   ```js
     // white corner boards on the outside corners of the shakes; the upper front corners start at the overhang soffit
     // (SE: a brown board closing the end of the living-room overhang, only its edge showing on the front)
     const SY = L.SOFFIT_Y, LZ = L.UP_LIV_Z + L.EXT_T / 2;
     for (const [x, z, sx, sz, y0x, y0z, wf = 0.38, mat = 'vinyl'] of [[-0.25, -0.25, -1, -1, 0, 0], [-0.25, UZ, -1, 1, SY, SY],
       [45.25, LZ, 1, 1, SY, SY, 0.08, 'trimBrown'], [34.75, -8.25, -1, -1, 0, 0], [45.25, -8.25, 1, -1, 0, 0]]) {
       const y1 = roofUnder(x + sx * 0.05, z + sz * 0.05);
       b.mbox(Math.min(x, x + sx * 0.07), Math.max(x, x + sx * 0.07), y0x, y1, Math.min(z, z - sz * 0.38), Math.max(z, z - sz * 0.38), mat);
       b.mbox(Math.min(x - sx * wf, x + sx * 0.07), Math.max(x - sx * wf, x + sx * 0.07), y0z, y1, Math.min(z, z + sz * 0.07), Math.max(z, z + sz * 0.07), mat);
     }
     b.mbox(-0.32, -0.25, 0, SY, 27.77, 28.15, 'vinyl');   // lower SW garage corner: west leg only (west shakes meet the front stone)
     b.mbox(45.25, 45.32, 0, SY, 34.87, 35.25, 'vinyl');   // lower SE playroom corner: east leg only (east shakes meet the front stone)
     b.mbox(29.05, 29.13, SY, roofUnder(29.1, LZ + 0.05), LZ - 0.3, LZ + 0.02, 'trimBrown');   // living-room block's SW corner, beside the recess stone
     // ---- overhangs: flat white soffit under the cantilevered upper storey, a vinyl starter strip at the foot of the shakes
     b.poly([[-0.25, SY, 28.15], [20.6, SY, 28.15], [20.6, SY, UZ], [-0.25, SY, UZ]], 'soffit', { n: [0, -1, 0], dens: 2 });
     b.poly([[28.55, SY, 35.25], [45.25, SY, 35.25], [45.25, SY, LZ], [28.55, SY, LZ]], 'soffit', { n: [0, -1, 0], dens: 2 });
     b.box(-0.25, 20.6, SY, SY + 0.08, UZ, UZ + 0.03, 'vinyl', { skip: ['nz'], dens: 6 });
     b.box(29.13, 45.17, SY, SY + 0.08, LZ, LZ + 0.03, 'vinyl', { skip: ['nz'], dens: 6 });   // one strip: the bow's underside is higher (BOW.base)
   ```

**Pitfalls:**
- `UZ` must be declared (step 5) before step 7 uses it. Both are inside `exterior()`.
- `CAP` and `C1` must no longer appear anywhere.
- **Do not** add fake shadow strips under the soffits. The bake ray-traces real shadows later.
- `PORCH` is raised to 17.5 in step 6 (stone to the ceiling). Do not change it anywhere else.
- Both lower front corners (SW garage, SE playroom) get a single white leg on the side face only. Do not add a front-facing leg: the front is stone.

**Acceptance** (`?nobake`):
- **A.** `snap(10, 45, 0, 0, 0.12)`:
  - the upper shake wall with 2 windows about 2 ft in front of the stone garage wall;
  - a white soffit above the doors, with the stone running straight up to it (no cap);
  - a thin starter lip at the bottom of the shakes.
- **B.** `snap(10, 29.3, 0, 0, 1.0)`: a flat white soffit overhead, no sky gaps at x −0.25 or 20.6.
- **C.** `snap(58, 52, 0, 0.65, 0.15)`:
  - about 5 in of overhang over the playroom stone;
  - a brown board on the overhang's east end, and a matching thin brown board on the living-room block's SW corner beside the recess stone;
  - the bow's underside sits about 1.2 ft above the soffit, with a white band at its bottom and flat shakes below it in the wall plane.
- **D.** `snap(-10, 45, 0, -0.72, 0.2)`: the upper shake wall and its SW corner board stand about 2.1 ft in front of the garage's stone SW corner, with the white soffit visible between them.
- **E.** `snap(22, 75, 0, 0, 0.25)`:
  - the front eave over the bedrooms is continuous with the wing gutter;
  - the SW downspout kicks back under the soffit;
  - nothing pokes through the roof.
- **E2.** `snap(22, -30, 0, Math.PI, 0.35)` (rear view): the back slope, skylight and vent stack are intact and nothing pokes through the roof.
- **G.** `snap(5, 20, 10, Math.PI, -0.1)`: the br2 front wall with the bed against it, continuous baseboard, the rug under the bed.
- **H.** `snap(15, 21, 10, Math.PI, -0.1)`: br3 with the dresser and glider on the new wall, and the partition running to it.
- **I.** `snap(37, 24, 10, Math.PI, 0)`:
  - the bow with a low white window seat filling the bay;
  - the sofa backed onto the seat front;
  - crown continuous round both corners.
- **J.** `snap(10, 12, 0, Math.PI, 0)` and `snap(37, 25, 0, Math.PI, 0)`: the garage and playroom exactly as before.
- **K.** `snap(24.8, 28.9, 6.875, 0, 0)`: the foyer as before. Wait 1 s; `__house.player.x` and `.z` must be unchanged within 0.05 (no new collisions).

**Commit:** `Overhang: soffits, stone to the soffit (no cap), corner boards, eaves, downspout, cantilevered bow`

---

## 2. Windows: style and sizes

**Goal:**
- No meeting rails anywhere, except the Bath 1 tiled window.
- Bedroom 2/3 front windows become high twin lites with a thin flat trim.
- The playroom gets 3 equal units with stone piers and a continuous stone sill.
- The bow keeps 5 single lites.

### 2a. Single tall lites plus trim options

1. **`house.js` `windowUnit()`, meeting rail.**
   - Anchor: `    const ys = h > 2.6 && !fixed`
   - Replace it with the line below. The next two lines stay as they are.
     ```js
         const ys = op.dh && h > 2.6 && !fixed   // double-hung only when asked for (dh); the house's windows are single tall lites (photos)
     ```
   - Change the comment above the function, `// Double-hung vinyl window: frame, sashes, glass, interior casing + stool, raised blinds.`, to:
     `// Vinyl window (single tall lites; op.dh for double-hung): frame, sashes, glass, interior casing + stool, raised blinds.`
2. **`house.js` `windowUnit()`, exterior trim.**
   - Under `// exterior trim`, keep the `const e0 = …, e1 = …;` line.
   - Replace the 5 lines from `const [X0, X1] = op.xw || [0.35, 0.35], …` through the sill `casingBox(… -inSide * (t / 2 + 0.16), -inSide, 'vinyl');` with:
   ```js
     // xh: head (and flat bottom) trim height; noSill: flat trim all round instead of a projecting sill board
     const [X0, X1] = op.xw || [0.35, 0.35], k0 = op.xw ? 0 : 0.05, k1 = op.xw ? 0 : 0.05;
     const XH = op.xh ?? 0.35, XB = op.noSill ? (op.xh ?? 0.2) : 0.2;
     casingBox(b, alongX, c, op.a0 - X0, op.a0, op.b0 - XB, op.b1 + XH, e0, e1, -inSide, 'vinyl');
     casingBox(b, alongX, c, op.a1, op.a1 + X1, op.b0 - XB, op.b1 + XH, e0, e1, -inSide, 'vinyl');
     casingBox(b, alongX, c, op.a0 - X0, op.a1 + X1, op.b1, op.b1 + XH, e0, e1, -inSide, 'vinyl');
     casingBox(b, alongX, c, op.a0 - X0 - k0, op.a1 + X1 + k1, op.b0 - XB, op.b0, e0, op.noSill ? e1 : -inSide * (t / 2 + 0.16), -inSide, 'vinyl');
   ```
3. **`layout.js`, keep Bath 1 double-hung.**
   - In `hiWin(22.8, 25.9, 4, 7, { tiled: 'tileWall', frosted: true })`, add `dh: true`.
   - Result: `{ tiled: 'tileWall', frosted: true, dh: true }`.
4. **`layout.js`, `loWin` takes options.**
   - Replace `const loWin = (a0, a1, sill = 4.0, head = 4.0 + 57 / 12) => win(a0, a1, LOW + sill, LOW + head);` with:
   ```js
   const loWin = (a0, a1, sill = 4.0, head = 4.0 + 57 / 12, extra) => win(a0, a1, LOW + sill, LOW + head, extra);   // lower level: 57" tall, sill 48" up
   ```

**Acceptance:**
- `snap(52, 12, 0, Math.PI/2, 0.35)`:
  - the east kitchen window (all 3 lites), the dining window and the playroom east window are single lites with no rail;
  - their exterior trim is unchanged (0.35 boards, projecting sill).
- `snap(24.35, 3.5, 10, 0, 0.15)`: Bath 1 is still frosted and double-hung.
- `snap(37.35, 50, 0, 0, 0.3)`: the bow's five lites are single, with no rails.

**Commit:** `Windows: single tall lites (no meeting rail); flat-trim options xh/noSill`

### 2b. Bedroom 2/3 front windows

- **Anchor** (from 1a): `  wx(UP_BR_Z, 0, 20.35, HIX, [hiWin(4.55, 7.35), hiWin(13.6, 16.4)], EXT),   // bedrooms 2/3: …`
- **Replace it with:**
  ```js
    // high sills are intentional: the photos show short twin-lite windows set high under the eave
    wx(UP_BR_Z, 0, 20.35, HIX, [
      hiWin(4.15, 8.15, 4.45, 7.3, { panes: [1, 1], xw: [0.06, 0.06], xh: 0.06, noSill: true }),    // Bedroom 2: twin lites, flat trim (per photos)
      hiWin(12.95, 16.95, 4.45, 7.3, { panes: [1, 1], xw: [0.06, 0.06], xh: 0.06, noSill: true }),  // Bedroom 3 (nursery)
    ], EXT),   // bedrooms 2/3: upper storey, 2.1' out over the garage; ends at 20.35 (free end runs on to x 20.6)
  ```
- **Sizes:**
  - The openings are 4.0 × 2.85 ft (an estimate from the photos; use as given).
  - The floor plan's 2.8 ft width is overridden. Do not "fix" it back.
- **Clearances (already checked):**
  - Interior casing: x 3.86–8.44 and 12.66–17.24.
  - Head casing top at 17.61.
  - Apron bottom at 14.08. The twin headboard (top 13.4) and the nursery dresser (top 13.1) are below it.
  - The sailboat art ends at 12.4.

**Acceptance:**
- `snap(10.4, 52, 0, 0, 0.22)`:
  - two high twin-lite windows, each roughly over a garage door (0.25 / 0.15 ft off centre is expected; do not move them);
  - a thin even white trim, no sill and no bars.
- `snap(6.15, 23.5, 10, Math.PI, 0.1)`: the casing top sits just under the ceiling and the headboard is below the apron.
- `snap(14.95, 23.5, 10, Math.PI, 0.1)`: the nursery, with the sailboat just left of the casing.

**Commit:** `Windows: bedroom 2/3 front windows as high twin lites with flat trim`

### 2c. Playroom: three units, stone piers, one stone sill

1. **`layout.js` WALLS.** Replace `  wx(35, 28.8, 45, LO, [loWin(31.8, 34.7), loWin(34.7, 38.9), loWin(38.9, 41.6)], EXT),` with:
   ```js
     wx(35, 28.8, 45, LO, [
       loWin(31.3, 34.55, 4.0, 8.75, { panes: [1], xw: [0.06, 0.06], xh: 0.06, noSill: true, cw: [0.29, 0.25] }),
       loWin(35.05, 38.3, 4.0, 8.75, { panes: [1], xw: [0.06, 0.06], xh: 0.06, noSill: true, cw: [0.25, 0.25] }),
       loWin(38.8, 42.05, 4.0, 8.75, { panes: [1], xw: [0.06, 0.06], xh: 0.06, noSill: true, cw: [0.25, 0.29] }),
     ], { ...EXT, yCuts: [SOFFIT_Y] }),   // 3 equal units with stone piers between (photos override the plan's 2.85/4.1/2.9); faces split at the soffit
   ```
   The `cw` values: 0.29 on the two outer ends (full casing with a stool ear), 0.25 at the pier joints.
2. **`house.js` `exterior()`, stone sill.** Insert directly after the starter-strip line added in 1c (`b.box(29.13, 45.17, SY, …);`):
   ```js
     // continuous stone sill under the three playroom windows (top meets their flat trim; wall outer face z 35.25)
     b.box(31.04, 42.31, L.LOW + 3.69, L.LOW + 3.94, 35.23, 35.43, 'stoneCap', { skip: ['nz'], dens: 3, bevel: 0.02 });
   ```

**Pitfalls:**
- The playroom wall does **not** move (it stays at z 35), so do not shift the sill, the sectional or the desk.
- Do not add a stone cap along the wall top.

**Acceptance:**
- `snap(36.7, 47, 0, 0, 0.12)`:
  - three equal single lites with stone piers between them;
  - one pale stone-cap sill under all three (the same material as the garden-wall cap), projecting slightly.
- `snap(36.7, 27, 0, Math.PI, 0)`: inside, one continuous white casing and stool band. Both outer ends of the band are the same width, and the stool has an ear at each end.
- `snap(34.8, 33.2, 0, Math.PI, -0.15)`: the casing seam sits at the pier centre, with no striped (z-fighting) pattern in the seam area.

**Commit:** `Windows: playroom front as three units with stone piers and a continuous stone sill`

### 2d. Bow window

In `bowWindow()`, anchor `        a0: wa0, a1: wa1, b0: sill, b1: head, kind: 'window', inSide: -1,`. Append ` panes: [1],` to that line.

- **This is a no-op after 2a:** each facet already defaults to one pane, and 2a removed the rails. The edit only records the intent, and the acceptance should already pass before it.
- Do not change anything else in `bowWindow`, and keep every `BOW` dimension as it is.

**Acceptance:**
- `snap(37.35, 50, 0, 0, 0.3)`: five tall single lites, no rails.
- `snap(37.35, 29, 10, Math.PI, 0)`: the same from inside, above the seat.
- `snap(24.8, 45, 0, 0, 0.2)`: the front door and sidelights are unchanged.

**Commit:** `Windows: bow as five single lites`

---

## 3. Stoop and railings

**Goal:**
- Rise from FRONT to grade: 11 risers of 0.625 ft (7.5 in).
- A top landing that fills the recess from the door to z 35.5.
- An 8-riser main flight down to a lower landing at 1.875.
- Two small south-facing steps, each stepping further west onto the drive.
- White rails on both sides only.
- The recess west side is open from the landing up to the porch ceiling (17.5).

### 3a. `layout.js`

1. **PWF constant.** After the `export const BOW = …` statement, add:
   ```js
   export const PWF = 35.25;   // outer face of the playroom's lower front wall
   ```
2. **West recess wall.** Replace `wz(20.8, GARAGE_Z, 35, ALL, [], { ...EXT, t: WALL_T, yCuts: [FRONT] }),` with:
   ```js
     wz(20.8, GARAGE_Z, 30.05, ALL, [], { ...EXT, t: WALL_T, yCuts: [FRONT] }),   // foyer/closet part; its free end runs on 0.2 to the door wall's outer face (30.25)
     wz(20.8, 30.25, 35, [17.5, 18], [], { ...EXT, t: WALL_T }),                   // closes the attic void above the porch ceiling (PORCH = 17.5 in house.js)
   ```
   Do not end the first piece at 30.25. Below 17.5 its end is free, so it would run on to 30.45 and leave a stone stub on the landing.
3. **FLOORS.** Replace `{ r: [21.02, 28.53, 30, 31.4], h: FRONT },` with:
   ```js
     { r: [20.6, 28.55, 30, 35.5], h: FRONT },           // stoop top landing
     { r: [28.55, 29.05, PWF, 35.5], h: FRONT },         //   in front of the east recess wall's end
     { r: [20.3, 29.05, 43.5, 45.0], h: 1.875 },         // stoop lower landing
     { r: [19.0, 21.4, 45.0, 46.0], h: 1.25 },           // bottom step (upper)
     { r: [17.9, 20.2, 46.0, 47.0], h: 0.625 },          // bottom step (lower)
   ```
4. **FLIGHTS.** Replace the two-line `{ id: 'frontStoop', … flare: [[1.4, 0], [0.9, 0], [0.45, 0]] },` entry with:
   ```js
     { id: 'frontStoop', r: [20.6, 29.05, 35.5, 43.5], h0: FRONT, h1: 1.875, risers: 8, finish: 'stone', exterior: true },   // 8 x 7.5" down to the lower landing; no flare
   ```
5. **SOLIDS.** Replace `{ b: [21.02, 28.53, 0, FRONT, 30, 31.4], mat: 'ledgestone', top: 'bluestone', ext: true },   // front stoop` with:
   ```js
     { b: [20.6, 28.55, 0, FRONT, 30, 35.5], mat: 'ledgestone', top: 'bluestone', ext: true },   // front stoop top landing (from the wall centreline: covers the threshold)
     { b: [28.55, 29.05, 0, FRONT, PWF, 35.5], mat: 'ledgestone', top: 'bluestone', ext: true },
     { b: [20.3, 29.05, 0, 1.875, 43.5, 45.0], mat: 'ledgestone', top: 'bluestone', ext: true },    // lower landing (0.3 flare west)
     { b: [19.0, 21.4, 0, 1.25, 45.0, 46.0], mat: 'ledgestone', top: 'bluestone', ext: true },      // bottom step, upper
     { b: [17.9, 20.2, 0, 0.625, 46.0, 47.0], mat: 'ledgestone', top: 'bluestone', ext: true },     // bottom step, lower (on the drive)
   ```
   - The top-landing solid starts at z 30, not 30.25. `walls()` draws no sill under the door or sidelights, so this solid's top must cover the threshold strip z 30–30.25.

**Pitfalls:**
- Until 3b and 4a are done, the old rails and planter will look wrong: the rails sink into the steps and the planter is misplaced. Ignore that. Judge 3a only on the steps, landings and SOLIDS.

**Acceptance:**
- `snap(25, 60, 0, 0, 0.08)`: 8 equal risers the full width x 20.6–29.05, no flare.
- `snap(12, 52, 0, -0.9, 0.05)`: the lower landing, then two small steps, each further west, the lowest on the drive.
- `snap(24.8, 45, 0, 0, 0.2)`: the threshold under the door and sidelights is solid bluestone, with no dark slot.
- `snap(24.8, 34, 6.875, Math.PI, -0.2)`, then wait 1 s: `__house.player.feet` must be 6.875 ± 0.01.

**Commit:** `Stoop: landing to z 35.5, 8-riser flight, lower landing and two offset bottom steps`

### 3b. `house.js`: porch ceiling, ground pad, railings

1. **Porch ceiling.**
   - Replace only these two lines of the entry-recess block:
     - the `// entry recess: a stone-faced header…` comment;
     - the `'soffit'` poly.
   - Keep the `const PORCH = 17.5, …` line, the ledgestone header box and the stone pier lines from 1c.
   - Put the new comment above the `const` line and the new poly below it:
   ```js
     // entry recess: stone up to a white ceiling over the whole landing (the west side is open below it), a stone
     // header at the mouth up to the roof
   ```
   ```js
     b.poly([[20.6, PORCH, 30.25], [29.05, PORCH, 30.25], [29.05, PORCH, hz0], [20.6, PORCH, hz0]], 'soffit', { n: [0, -1, 0], dens: 2 });
   ```
2. **Ground pad.**
   - Delete the two lines `const stoop = L.FLIGHTS.find(f => f.id === 'frontStoop').r;` and `G(DX1, stoop[1], stoop[3], stoop[3] + 1.6, -0.01, 'bluestone', { dens: 1 });`.
   - In the ground comment above them, delete `a bluestone pad at the foot of the stoop; `.
3. **Railings.** Replace everything from the comment `// White vinyl railings down both sides of the front stoop…` through the closing `}` of `function stoopRails(b)` with:
   ```js
   // White vinyl railings on both sides of the front stoop: a level run along each side of the top landing (from the
   // door wall / playroom wall to a corner post at the top of the stair), then a sloped run over a mid post down to a
   // post on the lower landing. Nothing across the landing front, the lower landing or the bottom steps.
   function stoopRails(b) {
     const f = L.FLIGHTS.find(q => q.id === 'frontStoop'), [, , z0, z1] = f.r;
     const rise = (f.h0 - f.h1) / f.risers, d = (z1 - z0) / f.risers;
     const nose = z => f.h1 + rise * (1 + (z1 + 0.09 - z) / d);    // nosing line (h1 added: the flight ends at 1.875)
     const level = () => L.FRONT, V = 'vinyl', PH = 0.21;
     const post = (x, z, top, cap = true) => {
       b.mbox(x - PH, x + PH, 0, top, z - PH, z + PH, V);
       if (cap) b.mbox(x - 0.26, x + 0.26, top, top + 0.1, z - 0.26, z + 0.26, V);
     };
     const run = (x, za, zb, base, skip = []) => {                  // rails between post faces za < zb
       beam(b, [x, base(za) + 2.8, za], [x, base(zb) + 2.8, zb], 0.2, 0.22, V);
       beam(b, [x, base(za) + 0.4, za], [x, base(zb) + 0.4, zb], 0.14, 0.14, V);
       const n = Math.round((zb - za) / 0.43);
       for (let i = 1; i < n; i++) {
         const z = za + (zb - za) * i / n;
         if (skip.some(p => Math.abs(z - p) < PH + 0.1)) continue;   // the rails pass through the mid post
         b.mbox(x - 0.055, x + 0.055, base(z) + 0.47, base(z) + 2.69, z - 0.055, z + 0.055, V);
       }
     };
     const ZC = 36.3, ZM = 40.05, ZB = 43.8;                          // corner, mid, bottom posts
     // north posts: W against the door wall; E against the playroom stone, tucked up under the living-room soffit (no cap)
     for (const [x, zN, zS, topN, capN] of [[20.82, 30.5, 30.25, L.FRONT + 3.05, true], [28.83, L.PWF + 0.25, L.PWF, L.SOFFIT_Y - 0.01, false]]) {
       post(x, zN, topN, capN);
       post(x, ZC, nose(ZC) + 3.05);                                  // ≈ 10.11
       post(x, ZM, nose(ZM) + 3.05);                                  // ≈ 7.76
       post(x, ZB, nose(ZB) + 3.05);                                  // ≈ 5.42 (3.55 above the lower landing)
       run(x, zN + PH, ZC - PH, level);                               // W1 30.71→36.09 / E1 35.71→36.09 (no balusters)
       run(x, ZC + PH, ZB - PH, nose, [ZM]);                          // W2 / E2 36.51→43.59
       b.collider(x - PH, x + PH, 0, 10, zS, ZB + PH);                // west: 6.9 ft drop off the landing edge
     }
   }
   ```
   - The east north post stops at the soffit (y 9.39) with no cap. A full-height post would pierce the living-room soffit at 9.4.
   - The E1 top rail (y ≈ 9.68) starts at z 35.71, just in front of the stone pier face (35.65–35.70), so it reads as fixed to the wall.

**Pitfalls:**
- Keep the `stoopRails(b);` and `planter(b);` calls.
- The old `flare` code in `stairs()` can stay; it no longer has any effect.
- Nothing else in `js/` reads `frontStoop.r` after this step and item 4.

**Acceptance:**
- `snap(12, 38, 0, -Math.PI/2, 0.15)`:
  - the landing's west side is open up to the porch ceiling;
  - the ledgestone west face of the stoop is at x 20.6;
  - no dark gap under the eave.
- `snap(24.8, 50, 0, 0, 0.3)`: stone runs from the door head up to a white ceiling at about 17.5, and a stone header at the mouth runs up to the eave. There is no white band and no white return.
- `snap(40, 56, 0, 0.62, 0.1)`:
  - sloped rails on both sides, each with posts at the top, middle and bottom;
  - level returns on the landing;
  - the short east stub at the playroom wall under the soffit.
- `snap(24.8, 33, 6.875, Math.PI/2, 0)`:
  - W1 runs from the door wall to the corner post;
  - there is no stone stub in front of the door wall beside the west rail post.
- Walk test: `snap(23, 33, 6.875, Math.PI/2, 0)`, add `'w'` to `__house.keys` for 1 s, then delete it. `player.x` must stay ≥ 21.7 (the rail collider's east face 21.03 plus the 0.75 body radius, less a small margin), and `player.feet` must stay 6.875.
- The bluestone pad in front of the steps is gone.

**Commit:** `Stoop: porch ceiling at 17.5, open west side, side railings only`

---

## 4. Garden wall

**Goal:** one continuous curved ledgestone wall with a cap, and a bed of tall grasses behind it. It replaces the old raised planter and its round shrubs.

### 4a. Rewrite `planter`

Replace everything from the comment `// Raised planter bed curving round…` through the closing `}` of `function planter(b)` with the code below. Keep the `planter(b);` call.

```js
// Garden wall: one continuous ledgestone wall with a stone cap, from the upper bottom step's riser round a front
// lobe (to under the third playroom window), in past a waist and out along a rear lobe to the playroom's SE corner;
// a bed of tall ornamental grasses.
function planter(b) {
  const PWF = L.PWF, T = 0.6, H = 1.18, CT = 0.12, CH = 0.38, SOIL = 1.05, N = 60;
  const curve = new THREE.CatmullRomCurve3([
    [21.1, 46.0], [21.3, 46.9], [22.5, 47.4], [26.0, 47.5], [30.0, 47.5], [33.5, 47.3], [35.8, 46.7], [37.1, 45.2],
    [37.4, 43.0], [38.0, 41.0], [39.6, 39.2], [42.0, 38.2], [44.3, 37.9], [44.95, 37.3], [44.95, 36.2], [44.95, PWF],
  ].map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const I = [], O = [], CI = [], CO = [];
  for (let i = 0; i <= N; i++) {
    const p = curve.getPointAt(i / N), t = curve.getTangentAt(i / N), l = Math.hypot(t.x, t.z);
    const nx = t.z / l, nz = -t.x / l;                             // toward the bed
    I.push([p.x + nx * T / 2, p.z + nz * T / 2]); O.push([p.x - nx * T / 2, p.z - nz * T / 2]);
    CI.push([p.x + nx * CH, p.z + nz * CH]); CO.push([p.x - nx * CH, p.z - nz * CH]);
  }
  I[N][1] = Math.max(I[N][1], PWF);
  for (let i = 0; i < N; i++) {
    const [a, c] = [O[i], O[i + 1]], [e, g] = [I[i], I[i + 1]];
    b.poly([[a[0], 0, a[1]], [c[0], 0, c[1]], [c[0], H, c[1]], [a[0], H, a[1]]], 'ledgestone', { n: [a[1] - c[1], 0, c[0] - a[0]], dens: 2 });
    b.poly([[e[0], 0, e[1]], [g[0], 0, g[1]], [g[0], H, g[1]], [e[0], H, e[1]]], 'ledgestone', { n: [g[1] - e[1], 0, e[0] - g[0]], dens: 2 });
    const xs = [a[0], c[0], e[0], g[0]], zs = [a[1], c[1], e[1], g[1]];
    b.collider(Math.min(...xs), Math.max(...xs), 0, H + CT, Math.min(...zs), Math.max(...zs));
    // cap: 0.76 wide (0.08 over each face), 0.12 thick, top at 1.30
    b.poly([CO[i], CO[i + 1], CI[i + 1], CI[i]].map(([x, z]) => [x, H + CT, z]), 'stoneCap', { n: [0, 1, 0], dens: 3 });
    for (const [E, sg] of [[CO, -1], [CI, 1]]) {
      const [e0, e1] = [E[i], E[i + 1]];
      b.poly([[e0[0], H, e0[1]], [e1[0], H, e1[1]], [e1[0], H + CT, e1[1]], [e0[0], H + CT, e0[1]]], 'stoneCap', { n: [sg * (e1[1] - e0[1]), 0, sg * (e0[0] - e1[0])], dens: 3 });
    }
  }
  // wall ends are hidden (step riser / house); only the cap's west end shows above the 1.25 step
  b.poly([[CO[0][0], H, CO[0][1]], [CI[0][0], H, CI[0][1]], [CI[0][0], H + CT, CI[0][1]], [CO[0][0], H + CT, CO[0][1]]], 'stoneCap', { n: [0, 0, -1], dens: 3 });
  // bed: the wall's inside edge A0→M, west along the playroom face, south down the stoop's east face, west along
  // the lower landing's south edge, closing up the upper step's east end to A0
  const loop = [...I, [29.05, PWF], [29.05, 45.0], [21.4, 45.0]];
  const tris = THREE.ShapeUtils.triangulateShape(loop.map(([x, z]) => new THREE.Vector2(x, z)), []);
  for (const t of tris) b.poly(t.map(k => [loop[k][0], SOIL, loop[k][1]]), 'mulch', { n: [0, 1, 0], dens: 1 });
  // tall ornamental grasses: fountains of thin blades
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const tuft = (x, y, z, r, h) => {
    const pos = [];
    for (let k = 0; k < 26; k++) {
      const a = rnd() * Math.PI * 2, lean = 0.35 + rnd() * 0.65, bh = h * (0.6 + rnd() * 0.4), w = 0.06;
      const bx = x + Math.cos(a) * r * 0.25 * rnd(), bz = z + Math.sin(a) * r * 0.25 * rnd();
      const tx = bx + Math.cos(a) * r * lean, tz = bz + Math.sin(a) * r * lean, px = -Math.sin(a) * w, pz = Math.cos(a) * w;
      const A = [bx - px, y, bz - pz], B = [bx + px, y, bz + pz], Tp = [tx, y + bh, tz];
      pos.push(...A, ...B, ...Tp, ...B, ...A, ...Tp);                 // both windings
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    b.mesh(g, ['paint:#6f8a3e', 'paint:#7d9447', 'paint:#8c9a55'][Math.floor(rnd() * 3)]);
  };
  for (const [x, z, r, h] of [
    [22.2, 46.2, 0.7, 2.2], [23.6, 45.8, 0.8, 2.6], [25.0, 46.3, 0.9, 2.8], [26.5, 45.7, 0.8, 2.4], [27.9, 46.3, 0.9, 3.0],
    [29.3, 45.8, 0.8, 2.6], [30.6, 46.1, 0.9, 2.8], [31.6, 45.2, 0.7, 2.2],                       // in front of the lower landing
    [33.5, 45.8, 0.8, 2.6], [35.5, 45.3, 0.8, 2.4], [36.3, 43.2, 0.7, 2.2],                       // front lobe, east end
    [29.9, 44.0, 0.8, 2.6], [30.2, 42.5, 0.9, 3.0], [31.8, 43.0, 0.8, 2.4], [32.6, 41.3, 0.7, 2.0], [30.3, 40.6, 0.9, 2.8],
    [31.6, 39.3, 0.8, 2.5], [30.0, 38.4, 0.8, 2.6], [32.8, 38.0, 0.7, 2.2], [30.4, 36.5, 0.7, 2.0], [31.8, 36.3, 0.6, 1.8],
    [34.0, 40.5, 0.8, 2.6], [35.8, 39.0, 0.8, 2.4],                                               // east of the stoop
    [34.5, 36.8, 0.7, 2.0], [36.3, 37.0, 0.8, 2.2], [38.2, 36.6, 0.7, 1.8], [40.1, 36.9, 0.8, 2.2], [42.0, 36.6, 0.7, 2.0], [43.6, 36.5, 0.6, 1.6],   // rear lobe
  ]) tuft(x, SOIL, z, r, h);
  tuft(20.5, 0, 46.5, 0.35, 1.2);                                  // west gap at grade between the lower step and the wall
  for (const [x, z, r] of [[33.0, 43.3, 0.45], [35.5, 37.3, 0.4], [26.2, 45.5, 0.4]]) {   // a few low perennials
    const g = new THREE.IcosahedronGeometry(r, 1), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = 0.85 + rnd() * 0.3; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7, p.getZ(i) * k); }
    g.computeVertexNormals();
    b.prim(g, 'paint:#5f7d3c', x, SOIL + r * 0.4, z, rnd() * 3);
  }
}
```

**Path check:**
- Inner face at the west end: x 21.4, flush with the upper step's east end.
- Front lobe face: z ≈ 47.8, running east to x ≈ 37 (under the third playroom window) before it turns back north.
- Waist at about (37.8, 41).
- Rear lobe face: z ≈ 38.2.
- The outer face at the east end lands at x ≈ 45.25, flush with the playroom SE corner.
- Every point is an estimate (±1 ft). Use them exactly as given; do not re-fit them.

**Acceptance:**
- `snap(33, 42, 35, 0, -1.55)`, looking straight down:
  - the wall starts at the upper step's SE corner;
  - it runs south and east along the front lobe to about x 37, pinches at the waist, runs along the rear lobe and ends at the playroom SE corner;
  - mulch fills the bed with no triangles outside the wall;
  - no round shrubs.
- `snap(38, 55, 0, 0.3, -0.05)`: a low stone wall with a pale cap about 1.3 ft high, and grasses up to about 3 ft behind it.
- The playroom stone sill (2c) sits above the grass tops.

**Commit:** `Garden wall: continuous curved ledgestone wall with cap; ornamental grass bed`

### 4b. Optional: black planters on the stoop's east side

Do this only if budget remains. At the end of `planter()`, before its closing `}`, add:

```js
  // black square planters down the east side of the stoop treads (positions estimated from the photos)
  for (const [z, y] of [[40.0, 4.375], [41.0, 3.75], [43.0, 2.5], [44.2, 1.875]]) {
    b.box(26.5, 28.1, y, y + 0.7, z - 0.45, z + 0.45, 'paint:#1e1e1e', { skip: ['ny'], dens: 3 });
    b.collider(26.5, 28.1, y, y + 1.6, z - 0.45, z + 0.45);   // tall enough to reach BODY_LO (1.0) above the tread
  }
```

**Acceptance:** `snap(24.5, 38, 6.875, Math.PI, -0.4)`: four black planters sit on the treads and the lower landing, inside the east rail.

**Commit:** `Stoop: four black planters`

---

## Finish

1. **Syntax.** Run `node --check` on `js/layout.js`, `js/house.js` and `js/materials.js`. The page (`?nobake`) must load with no console errors.
2. **Refresh `review/`.**
   - Add these poses to the pose list in `tools/shots.mjs`. Run it, and save each image as `review/<name>.png`.
   - You may nudge a pose to improve the framing. **Never change geometry to make a screenshot look right.**

   | name | x | z | feet | yaw | pitch |
   |---|---|---|---|---|---|
   | r5_1A_garage | 10 | 45 | 0 | 0 | 0.12 |
   | r5_1B_soffit | 10 | 29.3 | 0 | 0 | 1.0 |
   | r5_1C_se | 58 | 52 | 0 | 0.65 | 0.15 |
   | r5_1D_west | -10 | 45 | 0 | -0.72 | 0.2 |
   | r5_1E_front | 22 | 75 | 0 | 0 | 0.25 |
   | r5_1E2_rear | 22 | -30 | 0 | 3.1416 | 0.35 |
   | r5_1G_br2 | 5 | 20 | 10 | 3.1416 | -0.1 |
   | r5_1H_br3 | 15 | 21 | 10 | 3.1416 | -0.1 |
   | r5_1I_living | 37 | 24 | 10 | 3.1416 | 0 |
   | r5_1J_garage | 10 | 12 | 0 | 3.1416 | 0 |
   | r5_1J_playroom | 37 | 25 | 0 | 3.1416 | 0 |
   | r5_1K_foyer | 24.8 | 28.9 | 6.875 | 0 | 0 |
   | r5_2a_east | 52 | 12 | 0 | 1.5708 | 0.35 |
   | r5_2a_bath1 | 24.35 | 3.5 | 10 | 0 | 0.15 |
   | r5_2b_front | 10.4 | 52 | 0 | 0 | 0.22 |
   | r5_2b_br2 | 6.15 | 23.5 | 10 | 3.1416 | 0.1 |
   | r5_2b_br3 | 14.95 | 23.5 | 10 | 3.1416 | 0.1 |
   | r5_2c_out | 36.7 | 47 | 0 | 0 | 0.12 |
   | r5_2c_in | 36.7 | 27 | 0 | 3.1416 | 0 |
   | r5_2c_seam | 34.8 | 33.2 | 0 | 3.1416 | -0.15 |
   | r5_2d_bow | 37.35 | 50 | 0 | 0 | 0.3 |
   | r5_2d_bow_in | 37.35 | 29 | 10 | 3.1416 | 0 |
   | r5_2d_door | 24.8 | 45 | 0 | 0 | 0.2 |
   | r5_3a_flight | 25 | 60 | 0 | 0 | 0.08 |
   | r5_3a_steps | 12 | 52 | 0 | -0.9 | 0.05 |
   | r5_3a_landing | 24.8 | 34 | 6.875 | 3.1416 | -0.2 |
   | r5_3b_west | 12 | 38 | 0 | -1.5708 | 0.15 |
   | r5_3b_porch | 24.8 | 50 | 0 | 0 | 0.3 |
   | r5_3b_side | 40 | 56 | 0 | 0.62 | 0.1 |
   | r5_3b_w1 | 24.8 | 33 | 6.875 | 1.5708 | 0 |
   | r5_4a_top | 33 | 42 | 35 | 0 | -1.55 |
   | r5_4a_wall | 38 | 55 | 0 | 0.3 | -0.05 |
   | r5_4b_planters | 24.5 | 38 | 6.875 | 3.1416 | -0.4 |
   | r5_street | 22.5 | 72 | 0 | 0 | 0.12 |

   - Build side-by-side comparisons the same way round 4 made `review/compare_street.png`:
     - `review/compare_front2.png`: `r5_street` beside `reference/outside_front2.jpg`;
     - `review/compare_side.png`: `r5_1C_se` beside `reference/outside_side.jpg`;
     - `review/compare_entry.png`: `r5_3b_porch` beside `reference/outside_entry.jpg`.

     If that tooling isn't available, skip them and say so in the PR.
   - Record the results of the runtime checks (3a landing, 3b walk test, 1c K) in the PR.
3. **Commit and push** `review/` together with the edited `tools/shots.mjs`: `Round 5: review screenshots`
4. **Update PR #1.** Add a **"Round 5"** section to the description. List items 1a–1c, 2a–2d, 3a–3b, 4a and 4b, each marked done, partial or skipped, with a one-line note. Include these notes:
   - The upper storey was moved out: the lower walls stayed on the plan lines, and the interiors of bedrooms 2/3 (+2.1 ft) and the living room (+0.4 ft) changed.
   - The bow is now cantilevered, with its underside at 10.6 and a window seat inside at 10.75.
   - The porch ceiling was raised to 17.5, with stone to the ceiling.
   - The main ridge moved 1.05 ft south and about 0.44 ft up (a side effect of the new front eave).
   - No fake soffit shadows. **Needs a re-bake before publish.**
   - Bath 1 was kept double-hung (`dh: true`).
   - The east north rail post stops under the living-room soffit.
   - Open questions for the owner:
     - Confirm that the bedrooms really are 2.1' deeper than the 2nd-floor plan. The alternative: the upper walls stay at 28/35 and the garage and playroom walls move back 2.1/0.4.
     - Is there a window seat in the bow? The sofa hides the bay bottom in the interior photos. The outside shows the bow's underside about 1.2 ft above the soffit.
     - Is the x = 20.8 recess side really open from the landing up to the porch ceiling (17.5)?
     - The porch ceiling height (17.5) is an estimate.
     - The SW downspout kick-back is a low-confidence reading.
     - Garden-wall points and bottom-step offsets are estimates (±1 ft).
   - Screenshots are in `review/`.
   - If the screenshots could not run, say so and name what was checked by `node --check` and reasoning only.
5. **Do not merge.** `review/` must never reach `main`.