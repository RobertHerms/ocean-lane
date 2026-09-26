// House layout in feet. Plan x → world x (east on the drawing), plan y → world z (down the drawing).
// Origin = outside north-west corner of the main block on both floor plans.
// Main level = "2nd floor plan" (with the owner's corrections); lower level = "1st floor plan".

export const LOW = 0;          // lower level floor (garage, playroom)
export const MID = 5;          // rear entry landing — split-level
export const MAIN = 10;        // main level floor
export const LOW_CEIL = 9.5;   // 9'-6" ceilings on the lower level
export const MAIN_CEIL = 18;
export const WALL_T = 0.4;
export const EXT_T = 0.5;
export const DOOR_H = 6.75;
export const GARAGE_Z = 27.9;  // garage door line / bedroom south wall
// Front entry landing: 16 risers of 7 1/2" from the lower floor to the main floor, 11 below the landing
// (10 treads down) and 5 above it (4 treads up). Treads are 10".
export const FRONT = LOW + (MAIN - LOW) * 11 / 16;
const TREAD = 10 / 12;
export const FD = { z0: 18.0, z1: 18.0 + 11 * TREAD };     // bottom flight (lower hall → landing)
export const FU = { z0: 20, z1: 20 + 5 * TREAD };          // top flight (landing → main floor)
// Rear stair annex: lean-to roof, so its ceiling slopes from the kitchen header's north face (z = ANNEX_Z,
// where it meets the header's underside at 16.75) down to the back wall (z -8).
export const ANNEX_SLOPE = 0.40625;
export const ANNEX_Z = -EXT_T / 2;
export const annexCeil = z => 16.75 + (z - ANNEX_Z) * ANNEX_SLOPE;
// Lower hall to the half bath: 32" clear between the wall faces
const HB_HALL = 2.3 + 0.2 + 32 / 12 + 0.2;
// Bow window on the living-room front: five equal panels on an arc between x 31.2 and 43.5 (plan),
// 1'-5" deep at the centre; sill 1' above the floor, head 1' below the ceiling, a low flat ceiling inside.
export const BOW = { x0: 31.2, x1: 43.5, z: 35, sag: 1.45, n: 5, sill: MAIN + 1, head: MAIN + 7, ceil: MAIN + 7.35 };

const LO = [0, MAIN - 0.1];
const HI = [MAIN - 0.1, MAIN_CEIL];
const ALL = [0, MAIN_CEIL];

export const PAINT = {
  tan: '#c7b18d',        // living / dining / hall / stairs (photos 1, 2, 5-8, 58)
  kitchen: '#bcae98',
  br1Upper: '#c8bca7', br1Lower: '#b4a38b',
  grey: '#bcbfc6',       // bedrooms 2 & 3 (photos 26-36)
  bath1: '#b5bac2',
  bath2: '#d5c8ad',
  lower: '#cdbfa6',      // playroom / lower hall (photos 39-44)
  laundry: '#c8b08e',
  halfBath: '#ccbea5',
  garage: '#e6e4de',
  closet: '#e2ddd3',
  storage: '#ecebe8',     // closet under the front stairs
  ceiling: '#f2f0eb',
  trim: '#f4f2ec',
  siding: '#d9d3c6',
};

// ---------------------------------------------------------------- rooms ----
// floor: texture key; rug: optional [x0,x1,z0,z1,key]; crown: crown moulding at ceiling;
// rail: chair-rail height above floor with an optional lower paint colour.
const room = (id, name, h, rects, floor, paint, extra = {}) => ({ id, name, h, rects, floor, paint, ...extra });
export const ROOMS = [
  // main level
  room('br1', 'Bedroom 1 (primary)', [MAIN, MAIN_CEIL], [[0, 15.5, 0, 12.3]], 'wood', PAINT.br1Upper, { rail: 3.0, lower: PAINT.br1Lower }),
  room('clA', 'Bedroom 1 closet', [MAIN, MAIN_CEIL], [[0, 6.2, 12.3, 14.3]], 'wood', PAINT.closet),
  room('wic', 'Bedroom 1 closet', [MAIN, MAIN_CEIL], [[15.5, 19.3, 8.5, 12.3]], 'wood', PAINT.closet),
  room('bath2', 'Bath 2', [MAIN, MAIN_CEIL], [[15.5, 21.3, 0, 6.5], [15.5, 18.9, 6.5, 8.5]], 'tileBath2', PAINT.bath2),
  room('bath1', 'Bath 1', [MAIN, MAIN_CEIL], [[21.3, 26.6, 0, 6.5], [19.3, 26.6, 6.5, 11.7]], 'tileMarble', PAINT.bath1),
  room('kit', 'Kitchen', [MAIN, MAIN_CEIL], [[26.6, 45, 0, 9.7]], 'tileKitchen', PAINT.kitchen),
  room('pantry', 'Pantry', [MAIN, MAIN_CEIL], [[42.2, 45, -3.3, 0]], 'tileKitchen', PAINT.closet, { slope: true }),
  room('hall', 'Hallway', [MAIN, MAIN_CEIL],
    [[10.7, 15.5, 12.3, 15.6], [15.5, 19.3, 12.3, 15.6], [19.3, 24.8, 11.7, 15.6], [10.7, 14.2, 15.6, 17.9]],
    'wood', PAINT.tan, { crown: true }),
  room('din', 'Dining Room', [MAIN, MAIN_CEIL], [[28.8, 45, 9.7, 20], [24.8, 28.8, 11.7, 20]], 'wood', PAINT.tan, { crown: true, crownRects: [[28.8, 32.2, 11.7, 20]], rug: [32.2, 41.8, 11.6, 18.6, 'rugDining'] }),
  room('liv', 'Living Room', [MAIN, MAIN_CEIL], [[28.8, 45, 20, 35]], 'wood', PAINT.tan, { crown: true, bay: [31.2, 43.5, 35, 36.2] }),
  room('br2', 'Bedroom 2', [MAIN, MAIN_CEIL], [[0, 10.7, 14.3, GARAGE_Z]], 'wood', PAINT.grey, { rug: [1.2, 9.6, 18.2, 26.4, 'rugGrey'] }),
  room('clB', 'Bedroom 2 closet', [MAIN, MAIN_CEIL], [[6.2, 10.7, 12.3, 14.3]], 'wood', PAINT.closet),
  room('br3', 'Bedroom 3 (nursery)', [MAIN, MAIN_CEIL], [[10.7, 20.8, 18.2, GARAGE_Z], [10.7, 14.2, 17.9, 18.2]], 'wood', PAINT.grey, { rug: [11.8, 19.6, 19.4, 26.6, 'rugGrey'] }),
  room('cl3', 'Bedroom 3 closet', [MAIN, MAIN_CEIL], [[14.2, 18.9, 15.6, 18.2]], 'wood', PAINT.closet),
  room('lc', 'Linen closet', [MAIN, MAIN_CEIL], [[18.9, 20.8, 15.6, 18.2]], 'wood', PAINT.closet),
  room('upcl', 'Coat closet', [MAIN, MAIN_CEIL], [[20.8, 24.8, 15.6, 20]], 'wood', PAINT.closet),
  // storage closet under the front stairs: under the top flight and on under the entry landing to the front
  // wall (listed before the stairwell so the space below the landing reads as the closet)
  room('stcl', 'Closet', [LOW, FRONT], [[24.8, 28.55, 19.5, 29.75], [20.8, 24.8, FD.z1, 29.75]], 'tileGrey', PAINT.storage),
  // two-storey stairwells
  room('foyer', 'Front entry & stairs', [LOW, MAIN_CEIL], [[20.8, 28.8, 19.5, 30]], 'tileEntry', PAINT.tan, { crown: true, crownRects: [[20.8, 28.8, 20, 30]],
    baseY: FRONT, baseRects: [[20.8, 24.8, FD.z1, 30], [24.8, 28.8, FU.z1, 30]] }),
  room('rear', 'Rear entry & stairs', [LOW, MAIN_CEIL], [[35, 42.2, -8, 0]], 'carpetBeige', PAINT.tan, { slope: true }),
  room('coat', 'Rear closet', [MID, MAIN_CEIL], [[42.2, 45, -8, -3.3]], 'carpetBeige', PAINT.closet, { slope: true }),
  // lower level (1st floor plan)
  room('gar', 'Garage', [LOW, LOW_CEIL], [[0, 18.3, 0, 14.6], [0, 20.8, 14.6, GARAGE_Z]], 'concrete', PAINT.garage),
  room('hb', 'Half bath', [LOW, LOW_CEIL], [[18.3, 25.2, 0, 4.5]], 'tileMarble', PAINT.halfBath),
  room('laun', 'Laundry', [LOW, LOW_CEIL], [[18.3, 25.2, 4.5, 14.5]], 'tileMarble', PAINT.laundry),
  room('clN', 'Closet', [LOW, LOW_CEIL], [[25.2, 28.8, 0, 2.3]], 'carpetBeige', PAINT.closet),
  room('util', 'Utility', [LOW, LOW_CEIL], [[25.2, 28.8, HB_HALL, 14.5]], 'concrete', PAINT.garage),
  room('play', 'Playroom', [LOW, LOW_CEIL], [[28.8, 45, 0, 35], [25.2, 28.8, 2.3, HB_HALL], [20.8, 28.8, 14.5, 19.5]], 'carpetBeige', PAINT.lower, { crown: true }),
  room('rcl', 'Closet', [LOW, MAIN], [[35, 38.9, -4.4, 0]], 'carpetBeige', PAINT.closet),
];

// ---------------------------------------------------------------- walls ----
// {x0,z0,x1,z1,y:[bottom,top], ops:[...]}; openings a0/a1 run along the wall, b0/b1 are heights.
const win = (a0, a1, b0, b1, extra = {}) => ({ a0, a1, b0, b1, kind: 'window', ...extra });
const door = (a0, a1, base, extra = {}) => ({ a0, a1, b0: base, b1: base + DOOR_H + 0.05, kind: 'door', ...extra });
const open = (a0, a1, b0, b1, extra = {}) => ({ a0, a1, b0, b1, kind: 'open', ...extra });
const wx = (z, x0, x1, y, ops = [], extra = {}) => ({ x0, z0: z, x1, z1: z, y, ops, ...extra });
const wz = (x, z0, z1, y, ops = [], extra = {}) => ({ x0: x, z0, x1: x, z1, y, ops, ...extra });
const EXT = { t: EXT_T, ext: true };
const hiWin = (a0, a1, sill = 3, head = 7, extra) => win(a0, a1, MAIN + sill, MAIN + head, extra);
const loWin = (a0, a1, sill = 4.0, head = 4.0 + 57 / 12) => win(a0, a1, LOW + sill, LOW + head);   // lower level: 57" tall, sill 48" up

export const WALLS = [
  // ---- exterior ----
  wx(0, 0, 35, ALL, [loWin(21.7, 23.3), loWin(30.5, 33.5),
    hiWin(11.85, 14.8), hiWin(16.1, 19.1, 4, 7), hiWin(22.8, 25.9, 4, 7), hiWin(30.6, 33.4, 3.6, 6.6)], EXT),
  wz(0, 0, GARAGE_Z, ALL, [hiWin(8.3, 11.5), hiWin(14.9, 18.2)], EXT),
  wx(GARAGE_Z, 0, 20.75, ALL, [open(1.6, 10.2, 0, 7, { garageDoor: 'gd1' }), open(10.8, 19.4, 0, 7, { garageDoor: 'gd2' }),
    hiWin(4.55, 7.35), hiWin(13.6, 16.4)], EXT),
  wz(20.8, GARAGE_Z, 35, ALL, [], { ...EXT, t: WALL_T, yCuts: [FRONT] }),      // same thickness as the foyer wall it continues
  wx(30, 20.85, 28.8, ALL, [door(23.3, 26.3, FRONT, { unit: [22.25, 27.35], mullions: [[23.2, 23.3], [26.3, 26.4]] }), win(22.25, 23.2, FRONT, FRONT + DOOR_H + 0.05, { sidelight: true }),
    win(26.4, 27.35, FRONT, FRONT + DOOR_H + 0.05, { sidelight: true })], { ...EXT, yCuts: [FRONT] }),   // yCuts: split the faces there (closet below the landing)
  wz(28.8, 30, 35, ALL, [], EXT),
  wx(35, 28.8, 45, LO, [loWin(31.8, 34.7), loWin(34.7, 38.9), loWin(38.9, 41.6)], EXT),
  wx(35, 28.8, 31.2, HI, [], EXT), wx(35, 43.5, 45, HI, [], EXT),
  // bow window across the living room (BOW, built in house.js); a header drops to its low ceiling
  wx(35, BOW.x0, BOW.x1, HI, [open(BOW.x0, BOW.x1, MAIN - 0.1, BOW.ceil)], { t: EXT_T }),
  wz(45, -8, 0, [0, 16.75], [], { ...EXT, slope: true }),                  // annex: top follows the lean-to roof
  wz(45, 0, 35, ALL, [loWin(10.3, 14.3), hiWin(1.2, 8.5, 2.6, 7, { panes: [1, 2.2, 1] }), hiWin(13.5, 17.6)], EXT),   // playroom window opposite the hall entrance
  wz(35, -8, 0, [0, 16.75], [], { ...EXT, slope: true }),
  wx(-8, 35, 45, [0, annexCeil(-8 + EXT_T / 2)], [win(35.6, 41.6, MID, MID + 6.75, { slider: true })], EXT),   // top meets the ceiling at its inside face
  // ---- rear stair annex ----
  // under the rear up-flight the wall only blocks below the stair (colTop), so the top steps stay walkable
  wx(0, 35, 38.9, LO, [door(35.4, 37.9, LOW)], { t: EXT_T, colTop: MAIN - 1.3 }),
  wx(0, 38.9, 45, [0, MAIN], [open(39.1, 42.0, 0, LOW_CEIL)], { t: EXT_T }),   // flush with the exterior wall; opening full height (no header); the kitchen floor runs over its top
  wx(0, 42.2, 45, HI, [door(42.6, 44.6, MAIN)], { t: EXT_T }),
  wz(42.2, -8, 0, [MID - 0.1, 16.75], [door(-7.2, -4.9, MID, { bypass: true })], { slope: true }),
  wx(-3.3, 42.2, 45, [MID - 0.1, annexCeil(-3.3 + WALL_T / 2)]),                 // up to the pantry's (higher) ceiling
  // header between the kitchen and the rear stairs (the stair ceiling slopes down from its underside)
  wx(0, 35, 42.2, [MAIN - 0.1, MAIN_CEIL], [open(35, 42.2, MAIN - 0.1, 16.75)], { t: EXT_T }),
  // ---- main level interior ----
  wx(12.3, 0, 15.5, HI, [door(0.6, 5.8, MAIN), door(11.9, 14.9, MAIN)]),
  wx(14.3, 0, 10.7, HI, [door(6.8, 10.1, MAIN, { bypass: true })]),
  wz(6.2, 12.3, 14.3, HI),
  wz(10.7, 12.3, GARAGE_Z, HI, [door(14.8, 17.5, MAIN)]),
  wz(15.5, 0, 12.3, HI, [door(0.7, 3.2, MAIN), door(8.9, 11.3, MAIN)]),
  wz(21.3, 0, 6.5, HI),
  wx(6.5, 18.9, 21.3, HI),
  wz(18.9, 6.5, 8.5, HI),
  wx(8.5, 15.5, 19.3, HI),
  wz(19.3, 6.5, 12.3, HI),
  wx(12.3, 15.5, 19.3, HI),
  wx(11.7, 19.3, 28.8, HI, [door(21.1, 23.6, MAIN)]),      // runs on past the fridge enclosure so the hall wall is one plane
  wz(28.8, 9.9, 11.3, HI),                                 // dining-room face of the fridge enclosure (butts into the header)
  wz(26.6, 0, 11.7, HI),
  wx(9.7, 32.2, 45, HI, [open(35.3, 42.8, MAIN + 2.65, MAIN + 6.67, { passThrough: true })]),
  wz(32.2, 9.7, 11.3, HI),                                 // pier: its end shows flush with the header's south face
  // header over the plain drywall-wrapped doorway from the dining room to the kitchen, beside the fridge
  wx(11.7, 28.8, 32.2, [MAIN - 0.1, MAIN_CEIL], [open(29.0, 32.0, MAIN - 0.1, MAIN + 6.7)]),
  wx(15.6, 14.2, 24.8, HI, [door(19.1, 20.6, MAIN)]),
  wz(14.2, 15.6, 18.2, HI),
  wx(17.9, 10.7, 14.2, HI, [door(11.0, 13.8, MAIN)]),
  wx(18.2, 14.2, 20.8, HI, [door(14.8, 18.3, MAIN, { bypass: true })]),
  wz(18.9, 15.6, 18.2, HI),
  wz(20.8, 15.6, 20, HI),
  wz(24.8, 15.6, 20, HI, [door(16.1, 18.6, MAIN)]),          // coat closet: door faces the dining room
  wx(20, 20.8, 24.8, HI),                                  // ...and a solid wall faces the stairs
  wz(20.8, 20, GARAGE_Z, ALL, [], { yCuts: [FRONT] }),     // stairwell west (garage / bedroom 3 side); closet below the landing
  wz(28.8, 19.5, 30, [0, MAIN], [], { t: EXT_T, yCuts: [FRONT] }),   // stairwell east below the living-room railing (flush with the front wall); the living-room floor runs over its top
  // ---- lower level interior (1st floor plan) ----
  wz(18.3, 0, 14.6, LO),
  wx(4.5, 18.3, 25.2, LO),
  wx(14.5, 18.3, 25.2, LO, [door(21.7, 24.2, LOW)]),
  wz(20.8, 14.5, 20, LO, [door(14.7, 17.5, LOW)]),          // the stairwell wall carries on from z 20
  wz(25.2, 0, 14.5, LO, [door(2.45, 4.35, LOW)]),
  wx(2.3, 25.2, 28.85, LO, [door(26.1, 28.1, LOW)]),
  wz(28.8, 0, 2.3, LO, [], { t: EXT_T }),
  wx(HB_HALL, 25.2, 28.85, LO),
  // playroom west wall: headers over the openings to the half-bath hall and to the front-stair hall
  wz(28.8, 2.3, 19.5, LO, [open(2.3, HB_HALL, LOW, LOW + 7.2), door(7.4, 12.4, LOW), open(14.5, 19.5, LOW, LOW + 7.75)], { t: EXT_T }),   // playroom west face in line with the stair wall
  wx(14.5, 25.2, 28.85, LO),
  wx(19.5, 24.8, 28.85, LO, [door(25.5, 28.1, LOW)]),
];

// Solid half-walls beside stair flights (top follows the higher flight), with a balustrade on top.
export const KNEEWALLS = [
  { x: 24.8, z0: 19.5, z1: FD.z1, flight: 'frontUp',       // carries on beside the landing to the top of the bottom flight;
    hole: { z0: 20.5, z1: FD.z1, under: 'frontDown' } },   // full height 1 ft past the closet door, then open under the bottom flight
  { x: 38.9, z0: -4.4, z1: 0, flight: 'rearUp', closed: true },
];

// Balustrades: white square balusters, stained oak rail. base(t) = walking height along the run.
export const RAILINGS = [
  { x0: 28.8, z0: 20, x1: 28.8, z1: 29.52, base: () => MAIN, h: 3.0, newels: [0, 1], shoe: 'oak' },          // living room / stairwell (photo 57): end post against the front wall
  { x0: 24.8, z0: FU.z0, x1: 24.8, z1: FU.z1, base: t => MAIN - t * (MAIN - FRONT) + (MAIN - FRONT) / 5, h: 2.75,  // front up-flight (nosing line)
    newels: [0.105, 1], newelBase: t => (t < 0.5 ? MAIN : FRONT), flight: 'frontUp' },                        // top post clear of the wall corner
  { x0: 24.8, z0: FU.z1, x1: 24.8, z1: FD.z1, base: () => FRONT, h: 3.0, newels: [1] },                        // landing edge over the bottom flight
  { x0: 24.8, z0: FD.z0, x1: 24.8, z1: 19.5, base: t => LOW + (FRONT - LOW) * (t * (19.5 - FD.z0) / (FD.z1 - FD.z0)) + (FRONT - LOW) / 11,
    h: 2.75, newels: [0], newelBase: () => LOW, flight: 'frontDown' },                                          // foot of the bottom flight in the lower hall
  { x0: 38.9, z0: 0, x1: 41.77, z1: 0, base: () => MAIN, h: 3.0, newels: [0, 1] },                             // kitchen / rear stairs: corner post where the up-flight rail arrives, end post against the wall
  { x0: 38.9, z0: -4.4, x1: 38.9, z1: 0, base: t => MID + t * (MAIN - MID) + (MAIN - MID) / 8 + 0.12, h: 2.65, // rear up-flight
    newels: [0], newelBase: () => MID },
];
// Wall-mounted handrails: [x0,z0,x1,z1, h0,h1] (absolute rail height at each end)
export const HANDRAILS = [
  [21.3, FD.z0 + 0.1, 21.3, FD.z1 - TREAD, LOW + 0.7 + 2.8, FRONT + 2.8],
  [41.7, -4.4, 41.7, -0.3, MID + 2.9, LOW + 2.9 + 0.3 * 5 / 4.4],
  [35.55, -4.4, 35.55, -0.3, MID + 2.9, MAIN + 2.9 - 0.1 * 5 / 4.4],
];

// ---------------------------------------------------------------- doors ----
// axis 'x': door in a wall running along x (z = c), spanning x a0..a1; axis 'z': wall along z (x = c).
// hinge 0/1 → hinge at a0/a1. swing ±1 → opens toward +/− normal.
const d = (id, name, axis, c, a0, a1, hinge, swing, base, style = 'panel', group) =>
  ({ id, name, axis, c, a0, a1, hinge, swing, base, style, group: group || id });
// Bypass closet doors: two panels hung on their own tracks inside the jamb, overlapping in the middle;
// each one slides behind the other. roomSide ±1 = side of the wall the room is on (front track).
const bypass = (id, name, axis, c, a0, a1, roomSide, base) => {
  const m = (a0 + a1) / 2, ov = 0.08, run = (a1 - a0) / 2 - ov;
  return [
    { ...d(id + '1', name, axis, c, a0, m + ov, 0, roomSide, base, 'panel', id), slide: { track: -roomSide * 0.1, dist: run }, pull: 'start' },
    { ...d(id + '2', name, axis, c, m - ov, a1, 0, roomSide, base, 'panel', id), slide: { track: roomSide * 0.1, dist: -run }, pull: 'end' },
  ];
};

export const DOORS = [
  d('front', 'Front door', 'x', 30, 23.3, 26.3, 0, -1, FRONT, 'front'),
  d('bath2', 'Bath 2', 'z', 15.5, 0.7, 3.2, 0, 1, MAIN),
  d('br1', 'Bedroom 1', 'x', 12.3, 11.9, 14.9, 1, -1, MAIN),
  d('wic', 'Closet', 'z', 15.5, 8.9, 11.3, 0, -1, MAIN),
  d('bath1', 'Bath 1', 'x', 11.7, 21.1, 23.6, 1, -1, MAIN),
  d('clA1', 'Closet', 'x', 12.3, 0.6, 3.2, 0, -1, MAIN, 'panel', 'clA'),
  d('clA2', 'Closet', 'x', 12.3, 3.2, 5.8, 1, -1, MAIN, 'panel', 'clA'),
  ...bypass('clB', 'Closet', 'x', 14.3, 6.8, 10.1, 1, MAIN),
  d('br2', 'Bedroom 2', 'z', 10.7, 14.8, 17.5, 0, -1, MAIN),
  d('br3', 'Bedroom 3', 'x', 17.9, 11.0, 13.8, 0, 1, MAIN),     // hinged on the west side: opens to the right going in
  ...bypass('cl3', 'Closet', 'x', 18.2, 14.8, 18.3, 1, MAIN),
  d('lc', 'Linen closet', 'x', 15.6, 19.1, 20.6, 1, -1, MAIN),
  d('upcl', 'Coat closet', 'z', 24.8, 16.1, 18.6, 0, 1, MAIN),
  d('pantry', 'Pantry', 'x', 0, 42.6, 44.6, 1, 1, MAIN),
  ...bypass('coat', 'Closet', 'z', 42.2, -7.2, -4.9, -1, MID),
  d('rcl', 'Closet', 'x', 0, 35.4, 37.9, 0, 1, LOW),
  d('hb', 'Half bath', 'z', 25.2, 2.45, 4.35, 1, -1, LOW),
  d('laun', 'Laundry', 'x', 14.5, 21.7, 24.2, 1, -1, LOW),
  d('garI', 'Garage', 'z', 20.8, 14.7, 17.5, 0, -1, LOW),        // hinged at the laundry end
  d('clN', 'Closet', 'x', 2.3, 26.1, 28.1, 0, 1, LOW),
  d('util1', 'Utility closet', 'z', 28.8, 7.4, 9.9, 0, 1, LOW, 'panel', 'util'),
  d('util2', 'Utility closet', 'z', 28.8, 9.9, 12.4, 1, 1, LOW, 'panel', 'util'),
  d('stcl', 'Closet', 'x', 19.5, 25.5, 28.1, 1, 1, LOW),
];
export const GARAGE_DOORS = [
  { id: 'gd1', name: 'Garage door', x0: 1.6, x1: 10.2, z: GARAGE_Z, h: 7 },
  { id: 'gd2', name: 'Garage door', x0: 10.8, x1: 19.4, z: GARAGE_Z, h: 7 },
];

// --------------------------------------------------------------- floors ----
// Walkable surfaces; flights interpolate height along z from h0 (at z0) to h1 (at z1).
export const FLOORS = [
  { r: [0, 45, 0, 20], h: MAIN },
  { r: [0, 20.8, 20, GARAGE_Z], h: MAIN },
  { r: [28.8, 45, 20, 35], h: MAIN },
  { r: [31.2, 43.5, 35, 36.2], h: MAIN },
  { r: [42.2, 45, -3.3, 0], h: MAIN },
  { r: [24.8, 28.8, FU.z1, 30], h: FRONT },
  { r: [20.8, 28.8, FD.z1, 30], h: FRONT },
  { r: [21.2, 28.4, 30, 31.4], h: FRONT },
  { r: [35, 42.2, -8, -4.4], h: MID },
  { r: [42.2, 45, -8, -3.3], h: MID },
  { r: [35.6, 39.4, -9.4, -8], h: MID },
];
export const FLIGHTS = [
  { id: 'frontUp', r: [24.8, 28.8, FU.z0, FU.z1], h0: MAIN, h1: FRONT, risers: 5, finish: 'oak', open: -1, under: PAINT.storage },   // 4 treads
  { id: 'frontDown', r: [20.8, 24.8, FD.z0, FD.z1], h0: LOW, h1: FRONT, risers: 11, finish: 'oak', under: PAINT.storage },   // 10 treads; storage under it
  { id: 'frontStoop', r: [22.6, 27, 31.4, 31.4 + 11 * 0.92], h0: FRONT, h1: LOW, risers: 11, finish: 'stone', exterior: true },
  { id: 'rearUp', r: [35, 38.9, -4.4, 0], h0: MID, h1: MAIN, risers: 8, finish: 'carpet' },
  { id: 'rearDown', r: [38.9, 42.2, -4.4, 0], h0: MID, h1: LOW, risers: 8, finish: 'carpet' },
  { id: 'rearStoop', r: [35.9, 39.1, -13.2, -9.4], h0: LOW, h1: MID, risers: 7, finish: 'stone', exterior: true },
];
// Solid masses: under landings and closed-off space (b: x0,x1,y0,y1,z0,z1)
export const SOLIDS = [
  { b: [35, 42.2, 0, MID, -8, -4.4], paint: PAINT.tan },
  { b: [42.2, 45, 0, MID, -8, -4.4], paint: PAINT.tan },
  { b: [42.0, 45, 0, MID, -4.4, -3.3], paint: PAINT.tan },
  { b: [42.0, 45, 0, MAIN, -3.3, 0], paint: PAINT.lower },
  { b: [26.6, 28.8, MAIN, MAIN_CEIL, 9.7, 11.7], paint: PAINT.tan },      // fridge surround
  { b: [21.2, 28.4, 0, FRONT, 30, 31.4], paint: '#b9b3a7', ext: true },   // front stoop
  { b: [35.6, 39.4, 0, MID, -9.4, -8], paint: '#b9b3a7', ext: true },
];
// Between floors: underside = lower-level ceiling
export const SLABS = [[0, 45, 0, 20], [0, 20.8, 20, GARAGE_Z], [28.8, 45, 20, 35], [42.2, 45, -3.3, 0]];
export const ROOF = [[0, 45, 0, GARAGE_Z], [20.8, 45, GARAGE_Z, 35], [35, 45, -8, 0]];
// r: ceiling opening [x0,x1,z0,z1]. lean: the shaft leans toward the back of the house up to glazing in the
// roof plane (glass: its x extent, len: its length up the roof from straight above the opening's north edge).
export const SKYLIGHTS = [
  { r: [21.7, 24.1, 7.8, 10.2], lean: { glass: [22.0, 23.8], len: 2.0 } },   // hall bath, in front of the vanity
  { r: [36.6, 40.4, -6.8, -4.9] },                                           // rear stairs
];

// ------------------------------------------------------------- lighting ----
// Light fixtures (all switched on for the tour). kind: can | dome | chandelier | pendant | shop | semiflush |
// wellcan (can in a skylight well's side face) | track (ceiling track with spot heads) | fan (exhaust grille, no light) |
// flush (small white flush dome)
const can = (x, z, y, I) => ({ kind: 'can', x, z, y, I });
export const FIXTURES = [
  // playroom recessed lights: two rows of six down the long room; lower halls
  ...[32.85, 40.95].flatMap(x => [2.9, 8.75, 14.6, 20.4, 26.25, 32.1].map(z => can(x, z, LOW_CEIL))),
  { kind: 'semiflush', x: 24.8, z: 17.0, y: LOW_CEIL },                           // lower hall, in the middle (photo 49)
  { kind: 'flush', x: 26.7, z: 27.5, y: FRONT - 0.7 },                            // stair closet: small white dome on the flat ceiling
  can(27, (2.3 + HB_HALL) / 2, LOW_CEIL),
  can(21.75, 7.0, LOW_CEIL, 24), can(21.75, 12.0, LOW_CEIL, 24),                      // laundry: two high hats on the centreline, door to back wall
  { kind: 'dome', x: 21.7, z: 2.2, y: LOW_CEIL },
  { kind: 'dome', x: 27.2, z: 9.5, y: LOW_CEIL },
  { kind: 'shop', x: 5, z: 7, y: LOW_CEIL, len: 8 }, { kind: 'shop', x: 13, z: 7, y: LOW_CEIL, len: 8 },
  { kind: 'shop', x: 5, z: 20, y: LOW_CEIL, len: 8 }, { kind: 'shop', x: 14, z: 20, y: LOW_CEIL, len: 8 },
  // stairwells
  { kind: 'pendant', x: 24.8, z: 25.2, y: MAIN_CEIL, drop: 3.2 },
  // main level
  { kind: 'semiflush', x: 18.5, z: 14, y: MAIN_CEIL },   // one light in the upstairs hall (photos 5, 31)
  { kind: 'chandelier', x: 37, z: 15.1, y: MAIN_CEIL, drop: 2.9 },
  // kitchen: over the curved corner, the range, the sink, the middle, the breakfast table by the east window
  ...[[29.9, 3.4], [30.2, 6.3], [33.0, 3.6], [36.8, 3.2], [36.8, 7.0], [42.6, 3.9], [42.6, 6.1]].map(([x, z]) => can(x, z, MAIN_CEIL)),
  // living room: six cans on a perimeter pattern
  ...[31.8, 42.0].flatMap(x => [22.6, 27.5, 32.4].map(z => can(x, z, MAIN_CEIL))),
  can(4, 3.5, MAIN_CEIL), can(11, 3.5, MAIN_CEIL), can(4, 9, MAIN_CEIL), can(11, 9, MAIN_CEIL),
  can(3, 18.5, MAIN_CEIL), can(7.7, 18.5, MAIN_CEIL), can(3, 24.5, MAIN_CEIL), can(7.7, 24.5, MAIN_CEIL),
  can(13.6, 21, MAIN_CEIL), can(18, 21, MAIN_CEIL), can(13.6, 25.5, MAIN_CEIL), can(18, 25.5, MAIN_CEIL),
  // hall bath: over the tub, two over the vanity, one in the skylight well's south face, exhaust fan
  can(23.9, 1.5, MAIN_CEIL), can(20.4, 8.1, MAIN_CEIL), can(20.4, 10.3, MAIN_CEIL),
  { kind: 'wellcan', sky: 0, up: 1 / 3 },
  { kind: 'fan', x: 23.0, z: 5.6, y: MAIN_CEIL },
  // back stairs: a track with two spots under the kitchen / rear-stair header, aimed down the stairs
  { kind: 'track', x0: 37, x1: 41, z: -0.2, y: annexCeil(ANNEX_Z), heads: [37.8, 40.2] },   // on the header's underside
  can(18.3, 2.8, MAIN_CEIL), can(17.2, 6.9, MAIN_CEIL),
  { kind: 'dome', x: 17.4, z: 10.4, y: MAIN_CEIL },
];

// Ceiling smoke detectors: bedrooms, the bedroom hall and downstairs [x, z, ceiling]
export const SMOKE = [
  [12.8, 10.6, MAIN_CEIL], [8.6, 16.2, MAIN_CEIL], [12.4, 19.9, MAIN_CEIL],   // bedrooms: just inside each door
  [13.0, 14.0, MAIN_CEIL],
  [36.9, 17.5, LOW_CEIL], [27.6, 16.2, LOW_CEIL],
];

// Sun: early afternoon, late September. North on the plans points up-left, so the sun sits
// over the front (south-west) of the house.
export const SUN_DIR = [0.30, 0.70, 0.65];

// ------------------------------------------------------------ furniture ----
// Built by type in house.js; r = footprint [x0,x1,z0,z1], base = floor height.
export const FURNITURE = [
  // Bedroom 1: sleigh bed on the north wall, window to its right; dresser + TV on the south wall
  { type: 'bed', r: [3.2, 10.0, 0.25, 7.9], base: MAIN, head: 'n', wood: '#3d2419', size: 'king' },
  { type: 'nightstand', r: [1.1, 3.0, 0.3, 1.9], base: MAIN, wood: '#3d2419' },
  { type: 'nightstand', r: [10.2, 12.1, 0.3, 1.9], base: MAIN, wood: '#3d2419' },
  { type: 'dresser', r: [6.2, 11.4, 10.55, 12.1], base: MAIN, h: 3.1, wood: '#3d2419', face: 'n', tv: true },
  { type: 'dresser', r: [13.6, 15.3, 4.0, 6.6], base: MAIN, h: 4.6, wood: '#3d2419', face: 'w' },
  // Bath 2
  { type: 'vanity', r: [19.4, 21.1, 0.4, 3.9], base: MAIN, face: 'w', top: 'cultured', cab: '#ece5d6', mirror: true },
  { type: 'toilet', x: 20.1, z: 4.9, base: MAIN, face: 'w' },
  { type: 'shower', r: [15.7, 18.8, 5.4, 8.35], base: MAIN, frame: '#b39556' },
  // Bath 1
  { type: 'tub', r: [21.5, 26.4, 0.2, 2.75], base: MAIN },
  { type: 'toilet', x: 22.5, z: 4.6, base: MAIN, face: 'e' },
  { type: 'vanity', r: [19.5, 21.2, 7.1, 11.2], base: MAIN, face: 'e', top: 'granite', cab: '#f2f1ec', mirror: true },
  // Kitchen
  { type: 'kitchen' },
  { type: 'table', r: [41.07, 44.67, 3.25, 6.45], base: MAIN, wood: '#c9a26a', chairs: 4, chair: 'wheat', against: 'e' },   // pushed to the window wall
  // Dining & living
  { type: 'table', r: [34.3, 39.7, 13.4, 16.8], base: MAIN, wood: '#3e2518', chairs: 6, chair: 'dining' },
  // couches meet at the front outside corner with an end table (and table lamp) between them
  { type: 'sofa', r: [42.0, 45, 24.4, 32.2], base: MAIN, face: 'w', fabric: '#c9bba4' },
  { type: 'sofa', r: [34.2, 42.0, 31.7, 34.7], base: MAIN, face: 'n', fabric: '#c9bba4' },
  { type: 'endTable', r: [42.3, 44.65, 32.4, 34.65], base: MAIN, wood: '#4a2e1f', lamp: true },
  { type: 'coffeeTable', r: [36.8, 40.6, 27.0, 29.8], base: MAIN, wood: '#4a2e1f' },
  { type: 'desk', r: [29.05, 31.45, 30.6, 34.6], base: MAIN, wood: '#5a3a26', face: 'e', monitors: 1, chair: true },
  { type: 'rugRect', r: [34.5, 42.0, 23.8, 31.4], base: MAIN, color: '#b9ae9a' },
  // Bedroom 2
  { type: 'bed', r: [0.35, 3.95, 20.6, 27.65], base: MAIN, head: 's', wood: '#f4f2ec', size: 'twin' },
  { type: 'dresser', r: [9.0, 10.5, 19.2, 24.5], base: MAIN, h: 3.0, wood: '#f4f2ec', face: 'w', mirror: true },   // east wall
  { type: 'makeupDesk', r: [1.9, 4.5, 14.5, 15.8], base: MAIN },                                                  // north wall
  // Bedroom 3 (nursery)
  { type: 'crib', r: [17.8, 20.6, 19.0, 23.6], base: MAIN },
  { type: 'dresser', r: [15.0, 19.6, 26.2, 27.7], base: MAIN, h: 3.1, wood: '#f4f2ec', face: 'n' },
  { type: 'glider', x: 12.6, z: 26.45, base: MAIN },
  { type: 'changingTable', r: [10.9, 12.2, 22.4, 24.7], base: MAIN },                                            // west wall, leaves a way past the open door
  // Playroom
  { type: 'sectional', r: [36.2, 44.75, 21.0, 34.75], base: LOW, fabric: '#6e5f51', chaise: 5.6 },   // chaise lounge at the north end
  { type: 'coffeeTable', r: [37.6, 40.6, 24.8, 29.4], base: LOW, wood: '#2a1d17' },
  { type: 'endTable', r: [42.5, 44.65, 18.6, 20.8], base: LOW, wood: '#2a1d17' },                         // beside the lounge (photo 41)
  { type: 'console', r: [29.05, 30.35, 20.6, 27.6], base: LOW, face: 'e', tv: 'msRachel' },                     // up against the desk
  { type: 'lDesk', r: [29.05, 34.6, 27.6, 34.75], base: LOW, wood: '#2c2521' },
  // Laundry
  { type: 'washer', r: [19.3, 21.9, 4.8, 7.4], base: LOW },
  { type: 'dryer', r: [21.95, 24.6, 4.8, 7.4], base: LOW },
  // Half bath
  { type: 'toilet', x: 19.5, z: 2.2, base: LOW, face: 'e' },
  { type: 'pedestalSink', x: 24.45, z: 1.2, base: LOW, face: 'w' },   // corner by the window and door walls
  // Utility
  { type: 'furnace', r: [26.0, 28.4, 10.0, 13.6], base: LOW },
  { type: 'waterHeater', x: 26.9, z: 6.75, base: LOW },
  // Garage: a workshop corner (L-shaped bench along the north and west walls); by the house door a top-freezer
  // fridge with its back to the door's wall, a steel cabinet, a plank shelf over both and a door mat
  { type: 'workshop', r: [0.3, 10.3, 0.3, 5.3], base: LOW },
  { type: 'fridge', r: [18.25, 20.55, 17.85, 20.35], base: LOW, face: 'w' },
  { type: 'steelCabinet', r: [19.05, 20.55, 20.45, 23.45], base: LOW, h: 6 },
  { type: 'plankShelf', r: [19.55, 20.6, 17.85, 23.45], base: LOW, y: 7 },
  { type: 'doorMat', r: [18.9, 20.5, 15.0, 17.2], base: LOW },
];

// ------------------------------------------------------------- wall art ----
// Generic pieces in the style of what hangs in the photos (drawn procedurally; no personal photos).
// wall 'x': on a wall running along x with its face at z = c, facing dir (±1 on z); wall 'z': face at x = c.
// a: centre along the wall, y: centre height, w × h in feet, frame: black | white | silver | none, mat: white mat.
const art = (wall, c, dir, a, y, w, h, style, frame = 'black', mat = false) => ({ wall, c, dir, a, y, w, h, style, frame, mat });
export const ART = [
  art('z', 44.75, -1, 28.3, MAIN + 5.2, 4.2, 3.0, 'abstract', 'silver'),            // living room, over the couch (photo 1)
  art('x', 34.75, -1, 30.1, MAIN + 5.3, 1.1, 1.4, 'flower', 'white', true),         // beside the bow window (photos 1, 2)
  art('x', 11.9, 1, 25.5, MAIN + 5.0, 2.0, 2.6, 'bw', 'black', true),               // end of the hall (photos 5, 57)
  art('x', 11.9, 1, 27.7, MAIN + 5.2, 1.1, 1.4, 'bw2', 'black', true),              // dining, left of the fridge doorway
  art('z', 44.75, -1, 11.1, MAIN + 5.3, 1.0, 1.25, 'bw3', 'black', true),           // dining, left of the window (photo 6)
  art('z', 44.75, -1, 12.45, MAIN + 5.3, 1.0, 1.25, 'bw4', 'black', true),
  art('z', 44.75, -1, 18.9, MAIN + 5.2, 1.3, 1.6, 'bw5', 'black', true),            // dining, right of the window (photo 2)
  art('z', 0.25, 1, 26.5, MAIN + 5.0, 1.3, 1.75, 'hearts', 'white'),                // bedroom 2 (photos 26-28)
  art('z', 0.25, 1, 24.8, MAIN + 5.0, 1.3, 1.75, 'stripes', 'white'),
  art('z', 0.25, 1, 22.6, MAIN + 5.1, 2.0, 2.0, 'dahlia', 'white'),                // (photo 30)
  art('x', 27.65, -1, 2.15, MAIN + 5.3, 0.9, 1.8, 'dreamcatcher', 'none'),          // over the headboard (photos 27, 30)
  art('z', 10.9, 1, 24.3, MAIN + 5.3, 1.1, 1.4, 'anchor', 'white', true),           // nursery, over the changing table (photos 34, 36)
  art('z', 10.9, 1, 22.8, MAIN + 5.3, 1.1, 1.4, 'whale', 'white', true),
  art('x', 27.65, -1, 12.0, MAIN + 5.2, 0.8, 1.2, 'sailboat', 'white', true),       // nursery, by the window (photo 36)
  art('z', 20.6, -1, 21.3, MAIN + 5.4, 2.2, 1.8, 'nautical', 'none'),               // nursery decal over the crib (no name)
  art('z', 44.75, -1, (0.25 + (10.3 - 0.29)) / 2, LOW + 5.6, 4.5, 3.6, 'seascape', 'silver'),   // centred between the corner and the window trim              // playroom, the far side of the window (photos 39-41)
  art('z', 44.75, -1, (21.0 + 34.75) / 2, LOW + 5.6, 6.2, 4.2, 'sailboats', 'silver'),   // playroom, centred over the couch (photo 41)
  art('x', 0.25, 1, 34.45, LOW + 5.6, 1.0, 1.25, 'skyline', 'black', true),         // playroom, by the rear-stair closet (photo 41)
  art('z', 29.05, 1, 28.6, LOW + 5.5, 2.2, 1.7, 'cork', 'wood'),                     // corkboard of drawings over the desk (photos 41, 42)
  art('z', 18.5, 1, 2.2, LOW + 5.4, 1.6, 1.9, 'sailboats', 'white'),                // half bath, over the toilet (photos 45-48)
  art('x', 14.7, 1, 26.8, LOW + 5.4, 3.0, 1.0, 'panorama', 'black'),                // lower hall (photo 50)
  // bedroom 1: frames standing on the dresser under the TV (photo 17) and a pair over the tall dresser
  art('x', 11.35, -1, 6.75, MAIN + 3.1 + 0.4, 0.62, 0.8, 'bw2', 'black', true),
  art('x', 11.45, -1, 7.45, MAIN + 3.1 + 0.3, 0.75, 0.6, 'beach', 'silver', true),
  art('x', 11.35, -1, 10.75, MAIN + 3.1 + 0.36, 0.58, 0.72, 'flower', 'white', true),
  art('z', 15.3, -1, 4.6, MAIN + 6.0, 0.9, 1.15, 'bw3', 'black', true),
  art('z', 15.3, -1, 6.0, MAIN + 6.0, 0.9, 1.15, 'bw4', 'black', true),
  // living room: a small gallery around the desk (photo 2)
  art('z', 29.05, 1, 31.2, MAIN + 5.5, 1.0, 1.25, 'bw5', 'black', true),
  art('z', 29.05, 1, 32.55, MAIN + 5.85, 1.1, 0.85, 'beach', 'white', true),
  art('z', 29.05, 1, 32.55, MAIN + 4.95, 0.8, 0.65, 'bw2', 'black', true),
  art('z', 29.05, 1, 33.9, MAIN + 5.5, 1.0, 1.25, 'skyline', 'black', true),
];

// Start just inside the front door, on the entry landing, facing the stairs.
export const START = { x: 24.8, z: 28.9, feet: FRONT, yaw: 0 };
