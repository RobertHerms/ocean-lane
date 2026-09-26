# Interior accuracy pass — cloud execution plan

Target repo: `ocean-lane` (this repo). It is the **live GitHub Pages site**: `main` is what visitors see.

You (the cloud session) make code changes on a branch, check the geometry with headless screenshots, and open a
**draft PR**. You do **not** merge, and you do **not** re-bake the lighting. That needs a GPU, so it happens later on
the owner's machine together with the publish.

Everything you need is written here. The reference photos stay private and are **not** in the repo; every measurement
taken from them is written into this plan. Where a number is an estimate, it says so; use it as given.

---

## 0. Ground rules

- Branch from `main`: `git switch -c interior-accuracy`. Never push to `main`, never merge, never enable auto-merge.
- Set the repo-local identity before the first commit; never use any other identity:
  `git config user.name "Ocean Lane"` and `git config user.email "ocean-lane@users.noreply.github.com"`.
- End every commit message with: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- **Privacy:**
  - No real names, no street address, no personal photos or posters in anything you add. The house is "Ocean Lane".
  - Wall art stays generic and procedural.
  - Leave the `<meta name="robots" content="noindex, nofollow">` line in `index.html` alone.
- Do not touch `baked/*`, `kids.js`, `kidgeom.js` or `kidworker.js`.
- **Lamps:** use only the lamp kinds `'down'` and `'omni'`. The bake shader is not in this repo and only knows those two.
- Commit after each phase below (small, reviewable commits), so partial progress is usable if the session ends early.

### Budget guardrails ($100 credit)

- **Priority order:** Phase 1, 2, 3, 4, 5, 6, 7. If the credit is running low, finish the current phase, commit, push,
  and list what's left in the PR description.
- **Screenshots:**
  - At most about 3 screenshot/fix iterations per phase.
  - Use about 1000×700 screenshots.
  - Don't re-read large files you've already read. The anchors below tell you where things are.
- Don't write tests, refactors or tooling beyond `tools/shots.mjs` (Phase 0).

---

## Phase 0 — orientation and a way to look at geometry

### Code map (line numbers approximate)

**`js/layout.js`**

| Section | Line |
|---|---|
| `ROOMS` | ~55 |
| `WALLS` | ~102 |
| `RAILINGS` | ~179 |
| `HANDRAILS` | ~191 |
| `DOORS` | ~212 |
| `SOLIDS` | ~266 |
| `SKYLIGHTS` | ~280 |
| `FIXTURES` | ~285 |
| `FURNITURE` | ~323 |
| `ART` | ~385 |

**`js/house.js`**

| Function | Line |
|---|---|
| `walls()` | ~62 |
| `casings()` | ~169 |
| `unitCasing()` (the front door's frieze + crown cap, a model for the pass-through cap) | ~188 |
| `floorsAndCeilings()` | ~409 |
| `moldings()` | ~502 |
| `stairs()` | ~596 |
| `beam()` | ~691 |
| `railings()` | ~718 |
| `fixtures()` | ~768 |
| `kitchen()` + helpers `cabinetFronts`, `range`, `microwave`, `fridge`, `dishwasher` | ~862 |
| `furniture()` (`table` at ~1209) | ~1007 |
| `chair()` | ~1639 |

**`js/materials.js`**
- Named materials.
- `'paint:#hex'`, `'stain:#hex'` and `'fabric:#hex'` work inline anywhere a material key is accepted.

**Builder API** (the `b` passed around in house.js)
- `b.box(x0,x1,y0,y1,z0,z1,mat,{skip,dens,bevel,collide,uv})` — lightmapped axis boxes.
- `b.mbox(...)` — small boxes, probe-lit.
- `b.poly(pts,mat,{n,dens,chart})` — lightmapped flat polygons.
- `b.prim(geometry,mat,x,y,z,rotY,{rx,rz,bake})` and `b.mesh(geometry,mat)` — arbitrary three.js geometry, probe-lit.
- `b.collider(x0,x1,y0,y1,z0,z1)`.
- Follow the existing `ExtrudeGeometry` + `rotateX(Math.PI/2)` pattern in `kitchen()` (`roundedEnd`) for plan shapes with curves.

### Units and axes

- **Units:** feet.
- **Axes:** x = east, z = south (down the plan), y = up.
- **Levels:**
  - Main floor `MAIN` = 10, main ceiling `MAIN_CEIL` = 18.
  - Lower floor `LOW` = 0, lower ceiling `LOW_CEIL` = 9.5.
  - Front entry landing `FRONT` = 6.875.

### Debug hook

`window.__house.snap(x, z, feet, yaw, pitch)` jumps the camera, renders a frame and returns the exposure.

- `yaw` 0 looks north (−z), `+π/2` west, `π` south, `−π/2` east.
- `pitch` > 0 looks up.
- `feet` is the floor height (10 on the main floor, 0 downstairs).
- `window.__house.begin()` dismisses the help overlay.

### 0a. Add a `?nobake` flag in `js/main.js`

Your geometry changes will invalidate the baked lightmap, so you need a way to view the scene without it. Replace
`const bake = await loadBake();` with:

```js
const bake = new URLSearchParams(location.search).has('nobake') ? null : await loadBake();
```

The existing fallback (a hemisphere light) then takes over. Default behaviour must stay unchanged.

### 0b. Add `tools/shots.mjs` (Playwright)

The script should:

1. Serve the repo (`python3 -m http.server 8000`).
2. Open `http://localhost:8000/index.html?nobake` at 1000×700 in Chromium.
3. Wait for `window.__house`, then call `begin()`.
4. For each named pose in a list, call `snap(...)`, wait 300 ms and save `review/<name>.png`.

Launch args: `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`. Install with
`npx playwright install chromium`.

If WebGL won't run at all in the sandbox, say so in the PR and fall back to `node --check` plus careful reasoning. Don't
burn credit fighting it.

### Poses (add to them as needed)

| name | x | z | feet | yaw | pitch |
|---|---|---|---|---|---|
| kitchen_corner | 32.5 | 7.5 | 10 | 0.85 | 0.15 |
| kitchen_west | 33 | 5 | 10 | 1.5708 | 0.1 |
| kitchen_east | 31 | 6 | 10 | -0.9 | 0.15 |
| passthrough_dining | 37.5 | 17.5 | 10 | 0.05 | 0.1 |
| passthrough_kitchen | 38 | 5.5 | 10 | 3.1416 | 0.05 |
| fridge_doorway | 35 | 16 | 10 | 0.75 | 0.05 |
| living_rail_end | 33 | 27 | 10 | 1.87 | -0.1 |
| rear_rail | 40 | 3 | 10 | 0.2 | -0.2 |
| front_stair_foot | 24 | 16 | 0 | 3.1416 | 0.25 |
| living_lights | 36 | 21 | 10 | 3.1416 | 0.45 |
| bath1_vanity | 23.5 | 9 | 10 | 1.5708 | 0.3 |
| stair_closet | 26.8 | 20.2 | 0 | 3.1416 | 0.1 |
| garage | 8 | 20 | 0 | 0.6 | 0.1 |

Commit Phase 0.

---

## Phase 1 — Kitchen cabinets (highest priority)

**What's wrong now:**

- The upper cabinets stop 6" below the ceiling, leaving a gap. In reality they are taller and a painted soffit fills
  the last few inches flush to the ceiling. There is **no gap anywhere**.
- The north-west inside corner is **curved (concave)** in the real kitchen. The base cabinet, countertop edge, toe kick,
  upper cabinet and soffit all follow a quarter-round.
- The east end of the upper run has a **convex rounded end**.
- There's a boxed bulkhead above the sink window.

**Existing constants in `kitchen()`:**

| Constant | Value | Meaning |
|---|---|---|
| `F` | `MAIN` | floor |
| `W` | 26.8 | west wall face |
| `N` | 0.25 | north wall face |
| `depth` | 2.05 | base cabinet depth |
| `baseH` | 2.95 | base height |
| `topT` | 0.125 | counter thickness |
| `kick` | 0.35 | toe-kick height |
| `ud` | 1.1 | upper depth |

The base body front is at `W+depth-0.1` = **28.75** (west run) and `N+depth-0.1` = **2.20** (north run). The counter
front is at 28.93 / 2.38.

### 1a. Upper height and soffit

- Uppers: `uy0 = F + 4.5` (unchanged), `uy1 = F + 7.75`.
- Soffit: a box from `uy1` to `MAIN_CEIL`, with exactly the same plan outline as the uppers below it. It is flush with
  the door faces' carcass line, and it curves at the corner and rounds at the east end.
- Material `'paint:#e6dcc4'` (glossy cream, a touch yellower than the cabinet).
- Also over the microwave upper and the tall cabinet above the fridge (which is 2.4 deep).

### 1b. North-west concave corner

Build each piece as a plan shape extruded vertically.

**Base corner cabinet body.** The plan polygon runs:

1. (26.8, 0.25) → (29.30, 0.25) → (29.30, 2.20)
2. then a concave arc, centre (29.30, 2.75), radius 0.55, from (29.30, 2.20) to (28.75, 2.75). The arc bows toward
   the corner point (28.75, 2.20).
3. then (28.75, 2.75) → (26.8, 2.75), closing.

Heights and fronts:
- Body from `F+kick` to `F+baseH-topT`.
- Recessed dark kick (`'paint:#3a3632'`) on a concentric arc of radius 0.65, height `F` to `F+kick`.
- One **curved door** as a thin shell (0.06) just outside the arc. Vertical pull near its north edge.
- Use `ExtrudeGeometry`. The door is fine as a probe-lit `b.prim`.

**Countertop corner.** It follows a concentric arc, radius 0.37 around (29.30, 2.75), meeting the straight counter
fronts at x = 28.93 and z = 2.38. Build the corner top as one extruded shape from `F+baseH-topT` to `F+baseH`.

**West base run, north to south:**

| z from | z to | Contents |
|---|---|---|
| 2.75 | 3.40 | narrow base: drawer + door (cream counter over it) |
| 3.40 | 5.90 | range (move it: `range(b, W, 3.4, 5.9)`) |
| 5.90 | 6.72 | base, drawer + door, with a **black** counter piece (`'paint:#1d1d1f'`, roughness ~0.3) over just this cabinet, plus its short backsplash in black too |
| 6.72 | 6.78 | full-height enclosure side panel from `F` to `MAIN_CEIL`, x `W`→`W+2.4`, cabinet material |
| 6.80 | 9.65 | fridge (`fridge(b, W, 6.8, 9.65, F)`) |

**North base run, west to east:**

| x from | x to | Contents |
|---|---|---|
| 29.30 | 30.30 | 1-door base with a drawer |
| 30.30 | 32.60 | sink base, 2 doors |
| 32.60 | 34.50 | dishwasher (existing) |
| 34.50 | 35.00 | rounded end (existing) |

Keep the sink cut-out and faucet where they are.

**Upper corner cabinet.** Upper fronts are at x = 27.90 (west) and z = 1.35 (north). The plan runs:

1. (26.8, 0.25) → (28.50, 0.25) → (28.50, 1.35)
2. then a concave arc, centre (28.50, 1.95), radius 0.60, to (27.90, 1.95).
3. then (27.90, 1.95) → (26.8, 1.95), closing.

Height `uy0`→`uy1`, with one curved door.

**West uppers, north to south:**

| z from | z to | Contents |
|---|---|---|
| 1.95 | 3.40 | 2 doors, full height `uy0`→`uy1` |
| 3.40 | 5.90 | short 2-door upper `F+6.2`→`uy1`, microwave below at `F+4.6` (`microwave(b, W, 3.45, 5.85, F+4.6)`) |
| 5.90 | 6.72 | 1 door, full height |
| 6.78 | 9.70 | cabinet above the fridge: body `W`→`W+2.4`, `F+6.4`→`uy1` |

The cabinet above the fridge is currently a blank box. Give it **2 door fronts** on its x+ face.

The two west doors are an estimate (±3"). If they read much narrower than the curved corner door, a single door is
acceptable.

**North uppers, west to east:**

| x from | x to | Contents |
|---|---|---|
| 28.50 | 30.25 | 2 doors |
| 30.25 | 33.60 | **bulkhead** over the window: box, depth `N`→`N+1.1`, from `MAIN+6.95` up to `MAIN_CEIL`, soffit paint, underside visible (flat) |
| 33.60 | 35.00 | east upper with a **convex rounded end** (see below) |

For the east upper:
- Plan: rectangle x 33.6→35.0, z 0.25→1.35, with the corner at (35.0, 1.35) rounded, radius 0.45 (like `roundedEnd`).
- 2 doors over x 33.6→34.55.
- The curved end is a plain panel.
- The soffit above follows the same rounded outline.

### 1c. Kitchen window

In `WALLS`, the north exterior wall's kitchen window `hiWin(30.6, 33.4, 3.6, 7)` becomes `hiWin(30.6, 33.4, 3.6, 6.6)`.
Its head casing then tucks just under the bulkhead at `MAIN+6.95`.

### 1d. Pulls

The real pulls are pale butter-yellow **D-shaped loop pulls**, not brass bars:
- Round section about 0.035 ft, about 0.33 ft long, standing about 0.07 off the door.
- Vertical on doors, horizontal on drawers.
- Material `'paint:#e8d9a6'`, roughness about 0.35, not metallic.

Replace the `pull()` bars in `cabinetFronts()` (a `TubeGeometry` along a squared U path, via `b.mesh`).

### 1e. Floor tile

`tileKitchen` is already 12"×12" (a 4×4 grid over a 4 ft repeat). Leave it.

### Acceptance

- `kitchen_corner`, `kitchen_west` and `kitchen_east` show:
  - uppers meeting a thin soffit that runs to the ceiling with no gap;
  - the concave corner on base, counter, upper and soffit;
  - a rounded upper end at the stairs;
  - the bulkhead over the window;
  - the black counter only between range and fridge.
- No z-fighting, and no cabinet poking through a wall.
- `node --check` passes on changed files.

Commit.

---

## Phase 2 — Pass-through (kitchen ↔ dining) and the missing doorway header

### 2a. Opening size

It is wider and lower than modelled. In `WALLS`:

```js
wx(9.7, 32.2, 45, HI, [open(35.3, 42.8, MAIN + 2.65, MAIN + 6.67, { passThrough: true })]),
```

That's 7'-6" wide, the sill 32" above the floor and the head at 6'-8".

### 2b. Trim

Write a `passThroughTrim(b, w, op)` and call it instead of `casings()` for `passThrough` ops. The wall is along x at
z = 9.7, thickness 0.4. The dining room is on the +z side and the kitchen on the −z side.

**Dining side (+z):**

- **Casing** 0.33 wide on both sides and across the head, proud 0.07.
  - Give it a stepped or fluted face: an outer band 0.07 proud plus 2–3 shallow vertical grooves, or a second 0.045
    step. Cheap geometry is fine.
  - The sides run from the sill top to `head + 0.33`.
- **Frieze board** above the head casing: height 0.30, spanning the casing's outer edges, proud 0.08.
- **Bed moulding**: 0.08 tall, projecting 0.13.
- **Crown cap**: 0.14 tall, projecting 0.25, overhanging each end by 0.15.
- Copy the proportions of `unitCasing()`'s frieze, bed and cap.
- Keep the cap's top **at least 0.1 below the bottom of the room's crown moulding**. Check the crown profile height in
  `moldings()` and shrink the frieze if needed.

**Stool (sill), shared by both sides:**
- One white slab through the full wall thickness.
- Overhang 0.15 past each wall face and 0.10 past the casing's outer edges at each end.
- 0.09 thick, top at `MAIN + 2.65`.
- It reads as a small counter ledge.

**Aprons:**
- Dining side: an apron under the stool, 0.30 tall, spanning the casing's outer width, proud 0.06, with a small bead
  along its bottom edge.
- Kitchen side: plain flat casing 0.33 wide × 0.06 proud on the sides and head (no frieze, no cap), the same stool
  overhang, and a plain apron 0.25 tall.

The opening's jambs and head soffit are trim white. `walls()` already paints them TRIM for `passThrough`.

### 2c. Doorway header beside the fridge

There's a missing header over the doorway from the dining room into the kitchen, next to the fridge. The opening
x 28.8→32.2 at z ≈ 11.7 is a plain drywall-wrapped doorway (no casing) with a header down to 6'-8". The model has no
header there.

Add to `WALLS`, next to the existing `wz(32.2, 9.7, 11.6, HI)`:

```js
wx(11.7, 28.8, 32.2, [MAIN - 0.1, MAIN_CEIL], [open(28.8, 32.2, MAIN - 0.1, MAIN + 6.7)]),
```

This is the same pattern as the kitchen/rear-stair header at `wx(0, 35, 42.2, ...)`.

Change `wz(32.2, 9.7, 11.6, HI)` to end at **11.7**, so the pier's end is flush with the header's south face.

Check that:
- there are no coplanar overlapping faces (z-fighting) where the header meets the pier and the fridge surround;
- the dining room crown moulding runs along the header's south face. If `moldings()` doesn't pick it up, add it.

### 2d. Art

The black-framed print `bw2` currently sits between the pier and the pass-through. It belongs **left of the fridge
doorway**, on the fridge-surround/hall wall's dining face. Change it to:

```js
art('x', 11.9, 1, 27.7, MAIN + 5.2, 1.1, 1.4, 'bw2', 'black', true),
```

The wall between the pier and the pass-through is blank.

### Acceptance

- `passthrough_dining` shows a wide, low opening with fluted casing, a frieze, a projecting crown cap under the room
  crown, and a deep sill with an apron.
- `passthrough_kitchen` shows the plain casing and sill.
- `fridge_doorway` shows the header with crown moulding continuing across it.

Commit.

---

## Phase 3 — Railing posts (newels)

### 3a. Newel profile

Every newel is a box newel with a paneled shaft and a cushion cap. Replace the two plain boxes in `railings()` with a
`newelPost(b, x, z, y0, railTop)` builder:

| Part | Spec |
|---|---|
| Shaft | 0.46 square |
| Plinth | `y0`→`y0+0.9`, plain; a plinth-cap moulding on top (0.05 tall, 0.52 square, plus a 0.49 step) |
| Shaft body | from `y0+0.95` to `railTop - 0.05`, with a **recessed raised panel on all four faces**. Cheapest form: a 0.43 core plus four 0.07-wide frame strips, 0.015 proud, round each face |
| Collar moulding | 0.07 tall, 0.52 square, at `railTop` |
| Upper block | plain 0.46 square, 0.40 tall, above the collar |
| Cap plate | 0.62 square × 0.07, slight bevel |
| Cushion block | 0.38 square × 0.18, well-rounded top edges |
| Overall top | about `railTop + 0.75` |

Keep the lightmapped `b.box` for the big faces. Mouldings may be `b.mbox`.

### 3b. Placement fixes

**`RAILINGS[0]` (living room / stairwell, x = 28.8, z 20→30).** Its end post at z = 30 is **buried inside the front
wall**; the wall face is at z = 29.75 and only the cap pokes out. In reality the rail dies into a full post standing
against the wall.
- End the railing at `z1 = 29.52`, so the post's back face touches the wall.
- The rail, shoe and balusters recompute from `z1`.
- Keep the post at the stair-top end (t = 0).

**`RAILINGS[4]` (kitchen / rear stairs, z = 0, x 38.9→42.2).** Its t = 1 post at x = 42.2 is buried in the wall (face
at x = 42.0).
- Set `x1 = 41.77`.
- **Add a post at t = 0** (x = 38.9). That's the corner where the rear up-flight rail (`RAILINGS[5]`) arrives. Don't
  place two posts there.

**Every other railing** (`[1]`, `[2]`, `[3]`, `[5]`): check each post doesn't intersect a wall or knee wall, and that
it sits on its floor or tread (`newelBase`).

### Acceptance

`living_rail_end`, `rear_rail` and `front_stair_foot` show full paneled posts with cushion caps, including the post
standing against the front wall. Commit.

---

## Phase 4 — Lighting

Edit `FIXTURES` in layout.js. Cans are `can(x, z, y)` and default to `I` 5.5. The rest of the house stays as is.

### Living room (x 28.8–45, z 20–35)

Replace the 4 cans at x 32.5/41 × z 23.5/31.5 with **6 cans** on a perimeter pattern:
- x ∈ {31.8, 42.0}
- z ∈ {22.6, 27.5, 32.4}
- y = `MAIN_CEIL`

### Kitchen

Replace `can(31,4.8)`, `can(35.5,4.8)`, `can(40.5,4.8)` and `can(31,8)` with 7 cans:

| Location | x | z |
|---|---|---|
| over the curved corner | 29.9 | 3.4 |
| over the range | 30.2 | 6.3 |
| over the sink | 33.0 | 3.6 |
| middle, north | 36.8 | 3.2 |
| middle, south | 36.8 | 7.0 |
| breakfast table, by the east window (about 2 ft apart) | 42.6 | 3.9 |
| breakfast table, by the east window | 42.6 | 6.1 |

### Hall bath (`bath1`)

Remove `can(23.5, 5)` and `can(25.2, 9.0)`, then add:

- **Tub:** a can over the tub at (23.9, 1.5).
- **Vanity:** two cans over the vanity, between the vanity wall and the skylight well, at (20.4, 8.1) and (20.4, 10.3).
- **Skylight well:** the real well has a can mounted in its **south vertical face** (the face toward the bath door),
  about 1 ft above the ceiling plane. Model it as follows:
  - Add a new fixture kind `'wellcan'`.
  - In `fixtures()`, draw a white trim ring and a `'lampGlow'` disc on the well's south inner face, at x 22.9,
    z ≈ 10.2 − 0.02, y ≈ 19.0, facing north.
  - Push an `'omni'` lamp: `{ x: 22.9, y: 19.0, z: 10.0, r: 0.2, kind: 'omni', I: 4 }`.
  - Check where the well's walls actually are in `floorsAndCeilings()`/`SKYLIGHTS` and adjust y/z so the ring sits on
    that face.
- **Fan:** add a bath exhaust fan grille (no light) on the ceiling at (23.0, 5.6):
  - 0.9 × 0.7 white box, 0.04 deep;
  - about 12 dark louvre slots;
  - no lamp.

### Back stairs (rear annex, x 35–42.2, z −8–0)

There is currently no light. Add a new fixture kind `'track'`:

- A white ceiling track, 4 ft long along x (x 37→41), on the underside of the kitchen/rear-stair header at z ≈ −0.35,
  y just under 16.75.
- Two white cylinder spot heads (0.28 diameter × 0.45 long) on short stems, at x 37.8 and 40.2, each tilted about 45°
  to aim down the stairs (−z).
- Each head pushes an `'omni'` lamp `I: 6` about 0.3 in front of its lens.

### Acceptance

`living_lights` and `bath1_vanity` show the fixtures in place, not intersecting cabinets or the skylight well. Commit.

---

## Phase 5 — Kitchen and dining tables and chairs

### Kitchen (breakfast) table

Keep `r: [41.07, 44.67, 3.25, 6.45]`, `against: 'e'` and the chair count. Restyle it:

- **Material:** light maple, `'stain:#c9a26a'`.
- **Top:** 0.12 thick with a 0.03 bevel, plus **breadboard ends** (0.25-wide strips across both short ends, grain
  across).
- **Apron:** 0.30 tall, inset 0.15.
- **Legs:** 4 turned legs as a `LatheGeometry`:
  - a square-looking top block (0.25 tall);
  - vase and ring turnings;
  - tapering to 0.07 at the foot.

**Chairs: new style `'wheat'`** (wheat/sheaf-back Windsor), set with `chair: 'wheat'`:

- **Seat:** saddle, about 1.35 × 1.30 × 0.12 at `F+1.5`, lightly dished.
- **Legs:** 4 turned legs, splayed about 5°, with a turned H-stretcher plus a front stretcher.
- **Back posts:** two turned posts rising to about `F+3.3`, with small acorn finials.
- **Crest rail:** curved (bent back), about 0.28 tall with an arched top edge.
- **Lower back rail:** at about `F+2.05`.
- **Spindle fan:** 9 thin spindles from points spread along the crest converge to a small central band (the "sheaf")
  at about `F+2.35`, then flare out again down to the lower rail.
- **Material:** maple.

### Dining table

Keep `r: [34.3, 39.7, 13.4, 16.8]` and wood `'#3e2518'`.

- **Top:** a molded (ogee-ish) edge, via a bevel or stacked boxes.
- **Apron:** 0.35.
- **Base:** double pedestal. Each pedestal is a turned vase column (`LatheGeometry`, max diameter about 0.5) on
  **four splayed, S-curved carved feet** (about 0.9 long each; `TubeGeometry` or extruded profile), instead of the
  current cylinder plus slab.

### Dining chairs (`'dining'` style, 6 as now)

- **Wood:** dark.
- **Crest rail:** arched, with a **carved shell medallion** at the centre (a flattened fan shape about 0.35 wide, 0.06
  proud) and scrolled ends.
- **Back:** open, with an **interlaced figure-8 splat**. Two tall looped ribbons crossing each other, as two closed
  `TubeGeometry` loops slightly offset, plus small volutes at the top corners.
- **Seat:** serpentine front, upholstered in a bronze-brown brocade.
  - Add a procedural `'brocade'` texture in materials.js: base `#5c3b24` with muted gold `#9c7a4a` paisley-like swirls.
  - Or use `'fabric:#5e4028'` if budget is tight.
- **Front legs:** cabriole (S-curve) with carved knees.
- **Rear legs:** straight, splayed back.

### Acceptance

`passthrough_kitchen` (looking at the breakfast table) and a new pose looking at the dining table (for example
`36.5, 20.5, 10, 0.1, -0.15`) show the new furniture. Commit.

---

## Phase 6 — Closet under the front stairs (`stcl`)

This phase is medium confidence; keep the geometry simple.

### Current model

`stcl` is `[24.8, 28.8, 19.5, FU.z1]`. The room is x 24.8–28.8, z 19.5 up to the end of the top flight, with carpet.
It is closed off by a solid block under the entry landing.

### Reality

A storage room entered through the existing door (z = 19.5, x 25.5–28.1):

- **Floor:** light-grey 12"×12" porcelain tile, with a **white marble threshold** in the doorway.
  - Add `tileGrey` in materials.js: the same textures as `tileKitchen`, `repeat: 4`, with `color: '#c3c6ca'`.
- **Walls and ceilings:** white `'#ecebe8'`.
- **Extent:** it runs south from the door, under the top flight **and on under the entry landing to the front
  foundation wall**: x 24.8→28.55, z 19.5→29.75.
  - Remove the part of the landing solids that fills x 24.8–28.8 under the landing: the `SOLIDS` entry
    `[24.8, 28.8, 0, FRONT, FU.z1, FD.z1]` and the x ≥ 24.8 part of `[20.8, 28.8, 0, FRONT, FD.z1, 30]`.
  - Keep the landing floor at `FRONT`.
  - Give the closet a flat ceiling at `FRONT - 0.75` (about 6.1 ft) under the landing.
  - Under the top flight, the ceiling follows the flight's underside (the existing `SOFFITS.frontUp`).
- **West side:** a partition along x ≈ 24.8 goes down to the floor. It has a large **triangular opening** at its
  bottom whose top edge follows the bottom flight's slope, roughly from z ≈ 20.5 to z ≈ 26.
  - Through it you see storage space under the bottom flight (x 20.8–24.8), with tile floor and a sloped ceiling
    (that flight's underside).
- **South (front) wall:** the lower 4.5 ft is a thicker foundation wall forming a **ledge** about 0.8 ft deep, top at
  `LOW + 4.5`. The wall above is set back.
- **East side:**
  - A built-in **wire-shelving alcove**: a framed box x 27.2→28.55, z 24.9→27.3, opening west.
  - 4 white wire shelves at 1.0 / 2.2 / 3.4 / 4.6 ft.
  - A white bifold door with one leaf folded open.
- **Near the door, east wall:** a tall black steel cabinet (1.3 wide × 1.2 deep × 4.5 tall).
- **Light:** one white flush dome (11" diameter) on the flat ceiling at about (26.7, 27.5), y = ceiling. Use kind
  `'dome'` or a smaller variant.
- Room-level: keep `stcl` as the room id; extend its rect and switch its floor to `tileGrey`.

### Acceptance

`stair_closet` shows the long tiled room with the sloped then flat ceiling, the ledge, the triangular opening and the
shelving alcove. Colliders don't trap the player. Commit.

---

## Phase 7 — Garage re-render

Lower priority. Keep it tidy and generic: no posters, photos or names.

### Current model

- A shelving unit on the west wall.
- A workbench on the north wall.
- A fridge at `[15.6, 18.1, 11.3, 14.0]`.

### Reality: a workshop corner

**Workbench**
- An **L-shaped workbench**: plywood top on a 2×4 frame, 2.9 ft high, 2.3 ft deep.
- About 10 ft along one wall, returning about 5 ft along the adjacent wall. Use the north-west corner:
  - x 0.3→10.3 along z 0.3;
  - return along x 0.3, z 0.3→5.3.
- A **white pegboard** 4 ft tall behind the whole bench, with a narrow shelf along its top.
- Some generic hanging tools as small dark and yellow shapes.
- A black office chair at the bench.

**Shelving above the bench**
- Two wall shelves on white standards and brackets above the pegboard, with generic boxes and bins.
- A big **overhead platform shelf** (lumber frame, OSB deck) about 2 ft below the ceiling, hung on chains, running the
  length of the bench, with boxes on it.

**Ceiling**
- White drywall, crossed by one or two **boxed soffits** (about 0.8 tall × 1.2 wide).
- An exposed 6" round metal duct running along the wall above the bench and turning down.

**By the house door** (`garI` on x = 20.8, z 14.7–17.5)
- A **white top-freezer refrigerator** (2.5 w × 2.3 d × 5.6 h) right beside the door.
- A **grey steel two-door storage cabinet** (3 w × 1.5 d × 6 h) next to it.
- A plank shelf on white brackets above both, at about 7 ft.
- A door mat.

The photos show the fridge immediately beside the door with its back to the door's wall. With the current wall layout
that may not fit without blocking the door swing. Place them as close to that as the walls allow. **If it can't work
without moving the door, don't move the door; say so in the PR.**

**Other**
- Keep the two garage doors and the shop lights.

### Acceptance

The `garage` pose. Commit.

---

## Finish

1. Push the branch.
2. Open a **draft PR** into `main` titled "Interior accuracy pass (needs re-bake before publish)". The body should list:
   - each phase: done, partial or skipped;
   - the `review/*.png` screenshots;
   - anything you couldn't make fit, such as the garage fridge.
3. End the PR body with:

   🤖 Generated with [Claude Code](https://claude.com/claude-code)

4. **Do not merge.** Merging would publish geometry whose baked lighting no longer matches.

## Hand-off (done later on the owner's machine, not in the cloud)

1. Review the PR diff.
2. Copy the changed `js/*.js` (and any new textures) into the local project folder. The local project has the bake
   tooling.
3. Show the owner the preview.
4. Re-bake: `bake.html?direct=512&gather=768&passes=3`.
5. Check lighting, then publish through the clean publish folder:
   - the robots meta;
   - the privacy grep;
   - commit as Ocean Lane;
   - push `main`.
6. Close the draft PR, and delete the branch and the `review/` screenshots.
