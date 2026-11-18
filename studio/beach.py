"""Builds "Kauai Sunset": a cartoon Hawaiian beach at dusk, seen from the
lanai (deck) of a little beach house. Original scene, built entirely here.

Usage:  python3 beach.py preview <out.png> [width] [samples] [yaw_degrees]
        python3 beach.py bake <out_dir> [texture_size] [samples]

Blender axes: +X right, +Y forward (toward the sea), +Z up. The viewer sits
at the origin on the deck; the deck surface is z = 0.
"""
import sys, math, random, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
from mathutils import Vector, Matrix, noise
import kit
from kit import mat, glow, box, boxes, cyl, ball, tube, finish, point_light, xform

MODE = sys.argv[1] if len(sys.argv) > 1 else 'preview'
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/out.png'
WIDTH = int(sys.argv[3]) if len(sys.argv) > 3 else 1280
SAMPLES = int(sys.argv[4]) if len(sys.argv) > 4 else 48
YAW = float(sys.argv[5]) if len(sys.argv) > 5 else 0.0

rnd = random.Random(11)
scene, col = kit.reset()

SEA = -0.80          # water level
SUN_AZ = math.radians(-38)   # left of straight ahead
SUN_EL = math.radians(5)
flames = []          # (x, y, z, size) for the app's flickering fire

# ------------------------------------------------------------------ palette
C = dict(
    sand='#e9c98f', sand2='#dcb87a', wet='#b89565', grass='#4f9a4a', grass2='#3d8a45', path='#f1d9a6',
    wood='#b9793f', wood2='#a66a35', wood3='#c98a4c', dark_wood='#6b4226', rope='#d9c79a',
    teal='#3aa7a0', teal2='#339890', trim='#fff4dc', roof='#c8452f', roof2='#b53b28',
    trunk='#a3724a', trunk2='#8d5f3c', leaf='#3fae4f', leaf2='#2f9447', leaf3='#57c05a', coconut='#6b4a2c',
    rock='#7d7a86', rock2='#6a6775', red='#e3443a', yellow='#ffd23f', blue='#2f86d6', white='#fff8ea',
    pink='#ff7fa3', orange='#ff9a3c', purple='#8a5fd0', bamboo='#d7b45a', black='#2a2430', ridge='#3f8f5a', ridge2='#2f7a55',
)

# ------------------------------------------------------------------ terrain
def ground_z(x, y):
    z = -0.46
    if y > 2.5:
        z -= (y - 2.5) * 0.034
    if y < -8:
        z += (-8 - y) * 0.11
    if abs(x) > 30:
        z -= (abs(x) - 30) * 0.09
    damp = min(1.0, max(0.0, (math.hypot(x, y + 2.5) - 5.0) / 4.0))
    z += damp * (0.16 * noise.noise(Vector((x * 0.13, y * 0.13, 0.0))) + 0.04 * noise.noise(Vector((x * 0.7, y * 0.7, 3.0))))
    return z

def terrain():
    bm = bmesh.new()
    step = 0.5
    xs = [(-48 + i * step) for i in range(int(96 / step) + 1)]
    ys = [(-32 + j * step) for j in range(int(52 / step) + 1)]
    grid = [[bm.verts.new((x, y, ground_z(x, y))) for x in xs] for y in ys]
    mats = [mat(C['sand'], 0.95), mat(C['sand2'], 0.95), mat(C['wet'], 0.6), mat(C['grass'], 0.95), mat(C['grass2'], 0.95), mat(C['path'], 0.95)]
    for j in range(len(ys) - 1):
        for i in range(len(xs) - 1):
            f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            x, y = xs[i] + step / 2, ys[j] + step / 2
            n = noise.noise(Vector((x * 0.2, y * 0.2, 7.0)))
            if y > 11.3 + n * 0.8:
                f.material_index = 2
            elif y < -6.5 + n * 2.5 or abs(x) > 24 + n * 4:
                f.material_index = 3 if noise.noise(Vector((x * 0.5, y * 0.5, 2.0))) > 0 else 4
            else:
                f.material_index = 0
    ob = finish(bm, 'terrain', mats, smooth=True)
    ob['group'] = 'ground'
    ob['planar_uv'] = 1

def ridge(x0, x1, y0, y1, height, seed, name):
    """A steep green island ridge in the distance."""
    bm = bmesh.new()
    nx, ny = 60, 40
    grid = []
    for j in range(ny + 1):
        row = []
        for i in range(nx + 1):
            u, v = i / nx, j / ny
            x, y = x0 + (x1 - x0) * u, y0 + (y1 - y0) * v
            edge = math.sin(math.pi * u) ** 0.6 * math.sin(math.pi * v) ** 0.8
            r = 1 - abs(noise.noise(Vector((u * 5 + seed, v * 3, 0.5))))
            h = height * edge * (0.45 + 0.75 * r * r) + 2.5 * noise.noise(Vector((u * 14, v * 14, seed)))
            row.append(bm.verts.new((x, y, SEA - 1 + max(0, h))))
        grid.append(row)
    for j in range(ny):
        for i in range(nx):
            f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    ob = finish(bm, name, [mat(C['ridge'], 1.0), mat(C['ridge2'], 1.0)], smooth=True)
    ob['group'] = 'bg'

# -------------------------------------------------------------------- plants
def palm(x, y, height, lean_dir, lean=0.9, crown=1.0):
    z0 = ground_z(x, y) - 0.2
    pts, radii = [], []
    segs = 14
    for i in range(segs + 1):
        t = i / segs
        bend = lean * t * t
        pts.append((x + math.cos(lean_dir) * bend * height * 0.35, y + math.sin(lean_dir) * bend * height * 0.35, z0 + height * t * (1 - 0.08 * t)))
        radii.append((0.2 - 0.09 * t) * (1.06 if i % 2 else 0.94))
    radii[0] = 0.28
    tube(pts, radii, mat(C['trunk'] if rnd.random() > 0.4 else C['trunk2'], 0.9), seg=10, name='palm_trunk')
    top = Vector(pts[-1])
    for k in range(3):
        a = k * 2.1 + rnd.random()
        ball(0.13, (top.x + math.cos(a) * 0.17, top.y + math.sin(a) * 0.17, top.z - 0.12), mat(C['coconut'], 0.7), sub=2)
    # Fronds: a drooping rib with paired leaflets.
    bm = bmesh.new()
    n_fronds = 11
    for k in range(n_fronds):
        a = k * math.tau / n_fronds + rnd.uniform(-0.2, 0.2)
        length = rnd.uniform(2.3, 3.0) * crown
        rise = rnd.uniform(0.2, 0.75)
        prev = None
        rib = []
        for i in range(11):
            t = i / 10
            out = length * t
            zz = rise * math.sin(t * 1.5) * 1.1 - 1.5 * t * t * (1.1 - rise * 0.5)
            rib.append(top + Vector((math.cos(a) * out, math.sin(a) * out, zz)))
        side = Vector((-math.sin(a), math.cos(a), 0))
        for i in range(10):
            t = i / 10
            w = 0.62 * crown * math.sin(math.pi * (0.08 + 0.92 * t)) ** 0.7
            p0, p1 = rib[i], rib[i + 1]
            droop = Vector((0, 0, -0.32 * w))
            for s in (-1, 1):
                v = [bm.verts.new(p0), bm.verts.new(p1), bm.verts.new(p1 + side * s * w + droop + (p1 - p0) * 0.6), bm.verts.new(p0 + side * s * w * 0.9 + droop)]
                f = bm.faces.new(v if s > 0 else v[::-1])
                f.material_index = (i + k) % 3
    finish(bm, 'palm_fronds', [mat(C['leaf'], 0.8), mat(C['leaf2'], 0.8), mat(C['leaf3'], 0.8)], smooth=False)

def bush(x, y, r, flowers=True):
    z = ground_z(x, y)
    for i in range(5):
        a = rnd.uniform(0, math.tau); d = rnd.uniform(0, r * 0.6)
        ball(r * rnd.uniform(0.55, 0.85), (x + math.cos(a) * d, y + math.sin(a) * d, z + r * rnd.uniform(0.3, 0.6)), mat(C['leaf2'] if i % 2 else C['leaf'], 0.9), sub=2,
             scale=(1, 1, 0.8))
    if flowers:
        for i in range(7):
            a = rnd.uniform(0, math.tau); el = rnd.uniform(0.3, 1.2)
            ball(0.07, (x + math.cos(a) * math.cos(el) * r * 0.95, y + math.sin(a) * math.cos(el) * r * 0.95, z + r * 0.45 + math.sin(el) * r * 0.75),
                 mat(rnd.choice((C['red'], C['pink'], C['yellow'])), 0.6), sub=1)

def monstera(x, y, z, s=1.0):
    cyl(0.17 * s, 0.3 * s, (x, y, z + 0.15 * s), mat(C['white'], 0.6), r2=0.21 * s, seg=18)
    for i in range(7):
        a = i * math.tau / 7 + rnd.uniform(-0.3, 0.3)
        h = rnd.uniform(0.45, 0.85) * s
        lean = rnd.uniform(0.25, 0.55)
        tip = (x + math.cos(a) * h * lean, y + math.sin(a) * h * lean, z + 0.3 * s + h)
        tube([(x, y, z + 0.28 * s), tip], [0.012, 0.01], mat(C['leaf2'], 0.8), seg=5, cap=False)
        ball(0.2 * s, tip, mat(C['leaf'] if i % 2 else C['leaf3'], 0.7), scale=(1, 0.8, 0.06), rot=(lean * 1.4, 0, a + math.pi / 2), sub=2)

# -------------------------------------------------------------------- props
def torch(x, y, h=1.7):
    z = ground_z(x, y)
    pts = [(x, y, z - 0.2 + i * (h + 0.2) / 6) for i in range(7)]
    tube(pts, [0.03 * (1.15 if i % 2 else 0.95) for i in range(7)], mat(C['bamboo'], 0.7), seg=8, name='torch')
    cyl(0.03, 0.2, (x, y, z + h + 0.08), mat(C['dark_wood'], 0.8), r2=0.085, seg=10)
    flame_at(x, y, z + h + 0.3, 0.22, 60)

def flame_at(x, y, z, size, watts):
    flames.append((x, y, z, size))
    f = ball(size * 0.45, (x, y, z), glow('#ffb347', 6), scale=(1, 1, 1.7), sub=2, name='flame')
    f['group'] = ''   # lights the scene; the app draws its own animated flame
    point_light((x, y, z + 0.05), '#ff9a3c', watts, 0.12)

def surfboard(x, y, z, colour, stripe, lean, yaw):
    g = xform((x, y, z), (lean, 0, yaw))
    bm = bmesh.new()
    geom = bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
    for v in geom['verts']:
        t = v.co.z
        v.co.x *= 0.27 * (1 - 0.35 * max(0, t) ** 2)
        v.co.y *= 0.035
        v.co.z *= 1.05
    bmesh.ops.transform(bm, matrix=g @ Matrix.Translation((0, 0, 1.05)), verts=bm.verts)
    finish(bm, 'board', mat(colour, 0.35), smooth=True)
    bm = bmesh.new()
    gg = bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.transform(bm, matrix=g @ xform((0, -0.036, 1.05), (0, 0, 0), (0.07, 0.006, 1.9)), verts=gg['verts'])
    finish(bm, 'stripe', mat(stripe, 0.35))

def ukulele(x, y, z, rot):
    g = xform((x, y, z), rot)
    for (cx, cz, r) in ((0, 0.11, 0.115), (0, 0.27, 0.09)):
        bm = bmesh.new()
        gg = bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=r, radius2=r, depth=0.07)
        bmesh.ops.transform(bm, matrix=g @ xform((cx, 0, cz), (math.pi / 2, 0, 0)), verts=gg['verts'])
        finish(bm, 'uke_body', mat(C['wood3'], 0.4), smooth=True, bevel=0.01)
    bm = bmesh.new()
    gg = bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.03, radius2=0.03, depth=0.012)
    bmesh.ops.transform(bm, matrix=g @ xform((0, -0.036, 0.2), (math.pi / 2, 0, 0)), verts=gg['verts'])
    finish(bm, 'uke_hole', mat(C['black'], 0.6))
    for (sz, lc, m_) in (((0.04, 0.025, 0.32), (0, -0.01, 0.5), C['dark_wood']), ((0.06, 0.03, 0.09), (0, -0.01, 0.7), C['dark_wood'])):
        bm = bmesh.new()
        gg = bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.transform(bm, matrix=g @ xform(lc, (0, 0, 0), sz), verts=gg['verts'])
        finish(bm, 'uke_neck', mat(m_, 0.5), bevel=0.006)

def rock(x, y, r, z=None):
    bm = bmesh.new()
    geom = bmesh.ops.create_icosphere(bm, subdivisions=3, radius=r)
    for v in geom['verts']:
        n = noise.noise(v.co * (1.3 / r) + Vector((x, y, 0)))
        v.co *= 1 + 0.28 * n
        v.co.z *= 0.72
    zz = ground_z(x, y) if z is None else z
    bmesh.ops.transform(bm, matrix=Matrix.Translation((x, y, zz + r * 0.25)), verts=bm.verts)
    finish(bm, 'rock', mat(C['rock'] if rnd.random() > 0.4 else C['rock2'], 0.9), smooth=True)

# ----------------------------------------------------------------- the scene
terrain()
ridge(26, 150, 8, 150, 46, 1.3, 'ridge_right')
ridge(-170, -55, 60, 170, 26, 4.1, 'ridge_left')

# Deck (lanai): individual planks, posts with rope rails, steps to the sand.
DX0, DX1, DY0, DY1 = -2.9, 2.9, -2.3, 1.7
wood = [mat(C['wood'], 0.75), mat(C['wood2'], 0.75), mat(C['wood3'], 0.75)]
y = DY0
i = 0
while y < DY1 - 0.01:
    w = 0.145
    box((DX1 - DX0, w - 0.012, 0.04), ((DX0 + DX1) / 2 + rnd.uniform(-0.03, 0.03), y + w / 2, -0.02), wood[(i * 7 + (i // 3)) % 3], bevel=0.006, name='plank')
    y += w
    i += 1
box((DX1 - DX0 + 0.1, DY1 - DY0 + 0.1, 0.14), ((DX0 + DX1) / 2, (DY0 + DY1) / 2, -0.11), mat(C['dark_wood'], 0.85))
for px in (DX0 + 0.1, 0, DX1 - 0.1):
    for py in (DY0 + 0.3, DY1 - 0.1):
        cyl(0.07, 1.0, (px, py, -0.6), mat(C['dark_wood'], 0.85), seg=10)
posts = [(DX0 + 0.07, DY1 - 0.07), (DX0 + 0.07, -0.4), (DX1 - 0.07, DY1 - 0.07), (DX1 - 0.07, -0.4), (-1.1, DY1 - 0.07), (1.1, DY1 - 0.07)]
for (px, py) in posts:
    cyl(0.055, 1.0, (px, py, 0.5), mat(C['wood2'], 0.8), seg=10, bevel=0.01)
    ball(0.075, (px, py, 1.03), mat(C['wood3'], 0.7), sub=2)
def rope(a, b, sag=0.12, h=0.86):
    pts = []
    for k in range(9):
        t = k / 8
        pts.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, h - sag * math.sin(math.pi * t)))
    tube(pts, [0.016] * 9, mat(C['rope'], 0.9), seg=6, name='rope', cap=False)
rope(posts[0], posts[1]); rope(posts[2], posts[3]); rope(posts[0], posts[4]); rope(posts[5], posts[2])
rope(posts[0], posts[1], 0.1, 0.5); rope(posts[2], posts[3], 0.1, 0.5); rope(posts[0], posts[4], 0.1, 0.5); rope(posts[5], posts[2], 0.1, 0.5)
for k in range(3):   # steps down to the beach, through the gap in the rail
    box((2.0, 0.34, 0.05), (0, DY1 + 0.2 + k * 0.34, -0.13 - k * 0.15), wood[k % 3], bevel=0.008)
    box((0.06, 0.34, 0.14), (-0.95, DY1 + 0.2 + k * 0.34, -0.2 - k * 0.15), mat(C['dark_wood'], 0.85))
    box((0.06, 0.34, 0.14), (0.95, DY1 + 0.2 + k * 0.34, -0.2 - k * 0.15), mat(C['dark_wood'], 0.85))

# Beach house behind the viewer: teal boards, cream trim, red roof, warm windows.
HY0, HY1, HX = -8.0, -2.3, 3.6
box((HX * 2, HY1 - HY0, 3.0), (0, (HY0 + HY1) / 2, 1.5), mat(C['teal'], 0.8))
boards = [((HX * 2 + 0.03, 0.03, 0.015), (0, HY1 + 0.012, 0.18 + k * 0.2)) for k in range(15)]
boxes(boards, mat(C['teal2'], 0.8), name='siding')
box((0.95, 0.06, 2.05), (-1.9, HY1 + 0.03, 1.02), mat(C['trim'], 0.6), bevel=0.01)
box((0.8, 0.05, 1.9), (-1.9, HY1 + 0.06, 1.0), mat(C['wood'], 0.6), bevel=0.01)
ball(0.04, (-1.6, HY1 + 0.1, 1.0), mat(C['yellow'], 0.3), sub=2)
for wx in (0.6, 2.3):
    box((1.2, 0.06, 1.2), (wx, HY1 + 0.03, 1.55), mat(C['trim'], 0.6), bevel=0.01)
    box((1.0, 0.04, 1.0), (wx, HY1 + 0.05, 1.55), glow('#ffd58a', 1.6))
    boxes([((0.05, 0.05, 1.0), (wx, HY1 + 0.07, 1.55)), ((1.0, 0.05, 0.05), (wx, HY1 + 0.07, 1.55))], mat(C['trim'], 0.6))
    box((1.3, 0.2, 0.06), (wx, HY1 + 0.1, 0.93), mat(C['trim'], 0.6), bevel=0.01)
    for k in range(4):
        ball(0.08, (wx - 0.45 + k * 0.3, HY1 + 0.12, 1.02), mat(rnd.choice((C['red'], C['pink'], C['yellow'], C['orange'])), 0.6), sub=1)
    point_light((wx, HY1 + 0.5, 1.6), '#ffc070', 25, 0.3)
for s in (-1, 1):   # pitched roof with a deep overhang
    box((HX * 2 + 1.0, 4.3, 0.1), (0, (HY0 + HY1) / 2 + s * 1.85, 3.75), mat(C['roof'], 0.7), rot=(-s * 0.42, 0, 0), bevel=0.02)
    ribs = [((0.06, 4.3, 0.05), (-HX - 0.3 + k * 0.52, (HY0 + HY1) / 2 + s * 1.85, 3.83), (-s * 0.42, 0, 0)) for k in range(16)]
    boxes(ribs, mat(C['roof2'], 0.7), name='roof_ribs')
box((HX * 2, 0.08, 1.6), (0, HY1 + 0.02, 3.6), mat(C['teal2'], 0.8))

# Pergola over the deck with a string of lights.
for px in (DX0 + 0.07, DX1 - 0.07):
    cyl(0.06, 2.75, (px, DY1 - 0.07, 1.375), mat(C['wood2'], 0.8), seg=10)
for k in range(5):
    box((0.07, DY1 - HY1 + 0.5, 0.11), (DX0 + 0.07 + k * (DX1 - DX0 - 0.14) / 4, (DY1 + HY1) / 2, 2.72), mat(C['wood2'], 0.8), bevel=0.01)
box((DX1 - DX0 + 0.3, 0.09, 0.13), (0, DY1 - 0.07, 2.62), mat(C['wood'], 0.8), bevel=0.01)
bulb_cols = ['#ffd58a', '#ff8fa3', '#8fd3ff', '#ffe06a', '#a8f0a0']
for row, yy in enumerate((DY1 - 0.1, -0.4)):
    pts = []
    for k in range(25):
        t = k / 24
        xx = DX0 + 0.1 + (DX1 - DX0 - 0.2) * t
        zz = 2.52 - 0.22 * math.sin(math.pi * ((t * 2) % 1.0))
        pts.append((xx, yy, zz))
        if k % 2 == 1:
            ball(0.045, (xx, yy, zz - 0.06), glow(bulb_cols[(k // 2 + row) % 5], 2.2), sub=2, scale=(1, 1, 1.25))
    tube(pts, [0.006] * 25, mat(C['black'], 0.7), seg=4, name='light_string', cap=False)
point_light((0, 0.4, 2.3), '#ffd9a0', 22, 0.6)

# On the deck: rug, low table with a record player, ukulele, plants, boards.
box((2.3, 1.5, 0.012), (0.1, 0.25, 0.006), mat(C['red'], 0.95), rot=(0, 0, 0.06), name='rug')
boxes([((2.3, 0.12, 0.014), (0.1 + 0.06 * (k - 2) * 0.0, 0.25 + (k - 2) * 0.28, 0.007), (0, 0, 0.06)) for k in range(5)], mat(C['white'], 0.95), name='rug_stripes')
tx, ty = -1.55, 0.75
box((0.9, 0.6, 0.05), (tx, ty, 0.42), mat(C['wood3'], 0.5), bevel=0.012)
for sx in (-1, 1):
    for sy in (-1, 1):
        cyl(0.03, 0.4, (tx + sx * 0.36, ty + sy * 0.22, 0.2), mat(C['dark_wood'], 0.7), seg=8)
box((0.46, 0.4, 0.11), (tx - 0.12, ty, 0.5), mat(C['teal'], 0.5), bevel=0.02)
cyl(0.16, 0.012, (tx - 0.16, ty, 0.562), mat(C['black'], 0.3), seg=32)
cyl(0.055, 0.014, (tx - 0.16, ty, 0.564), mat(C['red'], 0.5), seg=20)
box((0.02, 0.2, 0.015), (tx + 0.06, ty + 0.04, 0.575), mat(C['trim'], 0.4), rot=(0, 0, 0.5))
cyl(0.045, 0.1, (tx + 0.3, ty - 0.12, 0.495), mat(C['yellow'], 0.5), r2=0.05, seg=16)      # cup
ukulele(tx + 0.75, ty + 0.55, 0.0, (-0.25, 0, 0.5))
monstera(DX0 + 0.45, DY1 - 0.5, 0.0, 1.1)
monstera(DX1 - 0.45, -1.7, 0.0, 1.25)
surfboard(DX1 - 0.25, 0.75, 0.02, C['red'], C['white'], 0.0, math.pi / 2 + 0.05)
surfboard(DX1 - 0.32, 0.2, 0.02, C['yellow'], C['blue'], 0.0, math.pi / 2 - 0.08)
box((0.6, 0.4, 0.38), (1.7, -1.5, 0.19), mat(C['blue'], 0.4), bevel=0.03)     # cooler
box((0.62, 0.42, 0.07), (1.7, -1.5, 0.41), mat(C['white'], 0.4), bevel=0.02)
cyl(0.09, 0.26, (-2.45, -1.6, 0.13), mat(C['dark_wood'], 0.5), seg=8)         # lantern
box((0.14, 0.14, 0.2), (-2.45, -1.6, 0.33), glow('#ffcf7a', 2.5))
point_light((-2.45, -1.3, 0.5), '#ffb760', 10, 0.1)

# Beach: palms, torches along the path, campfire, hammock, canoe, rocks, toys.
for (px, py, h, d, l) in ((-5.5, 4.6, 7.0, 0.5, 0.9), (-3.4, 8.2, 6.2, 2.6, 1.0), (5.2, 3.6, 7.6, 2.6, 0.8), (7.6, 7.4, 6.4, 1.2, 1.1),
                          (-10.5, 7.0, 8.0, 0.3, 0.7), (11.5, 3.0, 8.4, 2.9, 0.6), (-8.0, -3.0, 9.0, 1.0, 0.5), (8.5, -4.0, 9.5, 2.2, 0.5),
                          (-15, 2.0, 8.5, 0.8, 0.8), (16, 8.0, 7.2, 2.4, 1.0), (-13, 10.0, 6.5, 0.2, 1.2), (3.2, -9.5, 10, 1.6, 0.3), (-4.0, -10.5, 10.5, 1.4, 0.3)):
    palm(px, py, h, d, l)
for (px, py) in ((-1.5, 3.6), (1.5, 3.6), (-1.6, 6.6), (1.7, 6.8), (-1.5, 9.6), (1.9, 9.8)):
    torch(px, py)
fx, fy = 4.4, 8.6
fz = ground_z(fx, fy)
for k in range(9):
    a = k * math.tau / 9
    rock(fx + math.cos(a) * 0.55, fy + math.sin(a) * 0.55, 0.16)
for k in range(4):
    a = k * math.pi / 4
    cyl(0.07, 0.8, (fx, fy, fz + 0.14), mat(C['dark_wood'], 0.9), rot=(1.25, 0, a), seg=8)
flame_at(fx, fy, fz + 0.45, 0.5, 220)
for k in range(2):   # log seats by the fire
    a = 0.5 + k * 1.5
    cyl(0.2, 1.3, (fx + math.cos(a) * 1.5, fy + math.sin(a) * 1.5, ground_z(fx + math.cos(a) * 1.5, fy + math.sin(a) * 1.5) + 0.16), mat(C['trunk2'], 0.9),
        rot=(math.pi / 2, 0, a), seg=12)
# Hammock between the two left-hand palms.
ha, hb = Vector((-5.3, 4.9, ground_z(-5.3, 4.9) + 1.35)), Vector((-3.6, 7.7, ground_z(-3.6, 7.7) + 1.35))
bm = bmesh.new()
rows = []
side = (hb - ha).cross(Vector((0, 0, 1))).normalized()
for i in range(15):
    t = i / 14
    centre = ha.lerp(hb, t) + Vector((0, 0, -0.75 * math.sin(math.pi * t)))
    width = 0.75 * math.sin(math.pi * (0.06 + 0.88 * t)) ** 0.5
    row = [bm.verts.new(centre + side * (u - 0.5) * 2 * width + Vector((0, 0, 0.5 * width * (2 * u - 1) ** 2))) for u in (0, 0.25, 0.5, 0.75, 1)]
    rows.append(row)
for i in range(14):
    for k in range(4):
        f = bm.faces.new((rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k]))
        f.material_index = i % 2
finish(bm, 'hammock', [mat(C['white'], 0.9), mat(C['orange'], 0.9)], smooth=True)
# Outrigger canoe pulled up on the sand to the right.
cx_, cy_ = 6.6, 10.4
cz_ = ground_z(cx_, cy_)
bm = bmesh.new()
geom = bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z > 0.25], context='VERTS')
bmesh.ops.transform(bm, matrix=xform((cx_, cy_, cz_ + 0.32), (0, 0.05, 0.9), (0.36, 2.5, 0.4)), verts=bm.verts)
finish(bm, 'canoe', mat(C['yellow'], 0.5), smooth=True)
ball(1.0, (cx_ + 1.25, cy_ - 0.9, cz_ + 0.12), mat(C['red'], 0.5), scale=(0.1, 1.6, 0.1), rot=(0, 0, 0.9), sub=2)
for k in (-1, 1):
    off = Vector((-math.sin(0.9), math.cos(0.9), 0)) * k * 0.9
    a_ = Vector((cx_, cy_, cz_ + 0.42)) + off
    b_ = Vector((cx_ + 1.25, cy_ - 0.9, cz_ + 0.16)) + off
    tube([a_, a_.lerp(b_, 0.5) + Vector((0, 0, 0.22)), b_], [0.03, 0.03, 0.03], mat(C['dark_wood'], 0.7), seg=6)
for (rx, ry, rr) in ((12, 12.5, 1.3), (13.6, 13.4, 0.9), (10.6, 13.3, 0.7), (14.5, 11.6, 0.6), (-12, 12.8, 1.0), (-13.4, 13.6, 0.6), (-9.5, 0.5, 0.5), (9.0, 0.6, 0.45)):
    rock(rx, ry, rr)
# Beach towel, ball, sandcastle with a bucket.
box((0.9, 1.8, 0.012), (-3.6, 3.4, ground_z(-3.6, 3.4) + 0.02), mat(C['blue'], 0.95), rot=(0, 0, 0.4))
boxes([((0.9, 0.16, 0.014), (-3.6 - math.sin(0.4) * (k - 2) * 0.36, 3.4 + math.cos(0.4) * (k - 2) * 0.36, ground_z(-3.6, 3.4) + 0.022), (0, 0, 0.4)) for k in range(5)], mat(C['white'], 0.95))
bm = bmesh.new()
geom = bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.2)
for f in bm.faces:
    ang = math.atan2(f.calc_center_median().y, f.calc_center_median().x)
    f.material_index = int((ang + math.pi) / (math.tau / 6)) % 3
    f.smooth = True
bmesh.ops.transform(bm, matrix=Matrix.Translation((-2.7, 2.6, ground_z(-2.7, 2.6) + 0.2)) @ Matrix.Rotation(0.5, 4, 'X'), verts=bm.verts)
finish(bm, 'beachball', [mat(C['red'], 0.4), mat(C['white'], 0.4), mat(C['blue'], 0.4)])
sx_, sy_ = 3.3, 4.9
sz_ = ground_z(sx_, sy_)
cyl(0.42, 0.3, (sx_, sy_, sz_ + 0.12), mat(C['sand2'], 0.95), r2=0.36, seg=16)
for (ox, oy) in ((0, 0), (0.33, 0.25), (-0.33, 0.25), (0.33, -0.25), (-0.33, -0.25)):
    hgt = 0.5 if ox == 0 else 0.34
    cyl(0.11, hgt, (sx_ + ox, sy_ + oy, sz_ + 0.2 + hgt / 2), mat(C['sand'], 0.95), r2=0.1, seg=12)
    cyl(0.12, 0.14, (sx_ + ox, sy_ + oy, sz_ + 0.2 + hgt + 0.07), mat(C['sand2'], 0.95), r2=0.0, seg=12)
cyl(0.1, 0.2, (sx_ + 0.85, sy_ - 0.2, sz_ + 0.1), mat(C['red'], 0.4), r2=0.13, seg=14)
# Greenery around the house.
for (bx_, by_, br) in ((-4.6, -1.8, 0.9), (4.7, -1.6, 0.85), (-5.6, -4.2, 1.1), (5.9, -4.5, 1.2), (-3.5, 1.2, 0.5), (3.6, 1.0, 0.45), (-7.5, 1.5, 0.8), (8.2, 4.4, 0.7)):
    bush(bx_, by_, br)

# ------------------------------------------------------- sky, sea, sun (for lighting)
world = bpy.data.worlds.new('dusk')
world.use_nodes = True
nt = world.node_tree
bg = nt.nodes['Background']
tc = nt.nodes.new('ShaderNodeTexCoord')
sep = nt.nodes.new('ShaderNodeSeparateXYZ')
ramp = nt.nodes.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].position = 0.48
ramp.color_ramp.elements[0].color = kit.srgb('#ff9c5a')
ramp.color_ramp.elements[1].position = 0.85
ramp.color_ramp.elements[1].color = kit.srgb('#2a2f7a')
mid = ramp.color_ramp.elements.new(0.58)
mid.color = kit.srgb('#e0689a')
mp = nt.nodes.new('ShaderNodeMapRange')
mp.inputs[1].default_value = -1; mp.inputs[2].default_value = 1
nt.links.new(tc.outputs['Generated'], sep.inputs[0])
nt.links.new(sep.outputs['Z'], mp.inputs[0])
nt.links.new(mp.outputs[0], ramp.inputs[0])
nt.links.new(ramp.outputs[0], bg.inputs[0])
bg.inputs[1].default_value = 0.55
scene.world = world
sun_d = bpy.data.lights.new('sun', 'SUN')
sun_d.color = kit.srgb('#ff9a55')[:3]
sun_d.energy = 2.6
sun_d.angle = math.radians(6)
sun = bpy.data.objects.new('sun', sun_d)
sun_dir = Vector((math.sin(SUN_AZ) * math.cos(SUN_EL), math.cos(SUN_AZ) * math.cos(SUN_EL), math.sin(SUN_EL)))
sun.rotation_euler = (-sun_dir).to_track_quat('-Z', 'Y').to_euler()
col.objects.link(sun)
sea = box((600, 600, 0.02), (0, 300 + 6, SEA), mat('#1f6f8a', 0.25), name='sea')
sea['group'] = ''   # the app draws its own moving sea

def classify(ob):
    g = ob.get('group')
    if g is not None:
        return g or None
    bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    cx = sum(v.x for v in bb) / 8; cy = sum(v.y for v in bb) / 8
    return 'near' if (DX0 - 0.6 < cx < DX1 + 0.6 and DY0 - 0.4 < cy < DY1 + 1.4) else 'far'

if MODE == 'bake':
    kit.bake_export(OUT, 'beach', {'near': WIDTH, 'far': WIDTH, 'ground': WIDTH, 'bg': 1024}, SAMPLES, classify)
    with open(os.path.join(OUT, 'beach.json'), 'w') as fh:
        json.dump({'flames': [[round(v, 3) for v in f] for f in flames], 'sea': SEA,
                   'sun': [round(sun_dir.x, 4), round(sun_dir.y, 4), round(sun_dir.z, 4)]}, fh)
    sys.exit(0)

cam_d = bpy.data.cameras.new('cam')
cam = bpy.data.objects.new('cam', cam_d)
cam.location = (0, 0, 1.2)
cam.rotation_euler = (math.pi / 2, 0, -math.radians(YAW))
cam_d.lens = 15
col.objects.link(cam)
scene.camera = cam
kit.setup_cycles(SAMPLES)
scene.cycles.use_adaptive_sampling = True
scene.render.resolution_x = WIDTH
scene.render.resolution_y = int(WIDTH * 9 / 16)
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print('RENDERED', OUT)
