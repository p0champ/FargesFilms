"""Builds the paper-company bullpen in Blender and renders it.

Usage:  python3 office_bullpen.py <preview|pano> <output.png|jpg> [width] [samples] [yaw_degrees]

The viewer sits at the middle desk clump (right-hand chair), turned toward
reception on the front wall, with the manager's office front-left and the
conference room to the left. Blender axes: +X right, +Y forward, +Z up.
"""
import sys, math, random
import bpy, bmesh
from mathutils import Matrix, Vector

MODE = sys.argv[1] if len(sys.argv) > 1 else 'preview'
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/out.png'
WIDTH = int(sys.argv[3]) if len(sys.argv) > 3 else 1280
SAMPLES = int(sys.argv[4]) if len(sys.argv) > 4 else 48
YAW = float(sys.argv[5]) if len(sys.argv) > 5 else 0.0
SEAT = (0.0, 0.0)

rnd = random.Random(7)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
col = scene.collection

# ------------------------------------------------------------------ helpers
def srgb(hexstr):
    h = hexstr.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1]

def mat(name, color, rough=0.8, metal=0.0, emit=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = srgb(color)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = srgb(emit)
        b.inputs['Emission Strength'].default_value = strength
    return m

def noise_mat(name, c1, c2, scale, rough=0.95, bump=0.0):
    m = mat(name, c1, rough)
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    n = nt.nodes.new('ShaderNodeTexNoise')
    n.inputs['Scale'].default_value = scale
    n.inputs['Detail'].default_value = 6
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.inputs[6].default_value = srgb(c1)
    mix.inputs[7].default_value = srgb(c2)
    nt.links.new(tc.outputs['Object'], n.inputs['Vector'])
    nt.links.new(n.outputs['Fac'], mix.inputs[0])
    nt.links.new(mix.outputs[2], b.inputs['Base Color'])
    if bump:
        bn = nt.nodes.new('ShaderNodeBump')
        bn.inputs['Strength'].default_value = bump
        nt.links.new(n.outputs['Fac'], bn.inputs['Height'])
        nt.links.new(bn.outputs['Normal'], b.inputs['Normal'])
    return m

def wood_mat(name, c1, c2, rough=0.45, scale=1.0):
    m = mat(name, c1, rough)
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (22 * scale, 1.2 * scale, 22 * scale)
    n = nt.nodes.new('ShaderNodeTexNoise')
    n.inputs['Scale'].default_value = 3
    n.inputs['Detail'].default_value = 8
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.inputs[6].default_value = srgb(c1)
    mix.inputs[7].default_value = srgb(c2)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    nt.links.new(mp.outputs['Vector'], n.inputs['Vector'])
    nt.links.new(n.outputs['Fac'], mix.inputs[0])
    nt.links.new(mix.outputs[2], b.inputs['Base Color'])
    return m

def emit_mat(name, color, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    e = nt.nodes.new('ShaderNodeEmission')
    e.inputs['Color'].default_value = srgb(color)
    e.inputs['Strength'].default_value = strength
    o = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(e.outputs[0], o.inputs[0])
    return m

def grp(loc=(0, 0, 0), rotz=0.0, parent=None):
    e = bpy.data.objects.new('grp', None)
    e.location = loc
    e.rotation_euler = (0, 0, rotz)
    e.parent = parent
    col.objects.link(e)
    return e

def _finish(bm, name, material, parent, bevel, smooth=False):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
        try:
            me.set_sharp_from_angle(angle=0.7)
        except Exception:
            pass
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(material)
    ob.parent = parent
    col.objects.link(ob)
    if bevel:
        mod = ob.modifiers.new('bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = 'ANGLE'
    return ob

def boxes(items, material, parent=None, bevel=0.0, name='boxes'):
    """items: (size, center) or (size, center, euler)."""
    bm = bmesh.new()
    for it in items:
        size, loc = it[0], it[1]
        rot = it[2] if len(it) > 2 else (0, 0, 0)
        geom = bmesh.ops.create_cube(bm, size=1.0)
        m = Matrix.Translation(loc) @ Matrix.Rotation(rot[2], 4, 'Z') @ Matrix.Rotation(rot[1], 4, 'Y') @ Matrix.Rotation(rot[0], 4, 'X') @ Matrix.Diagonal((size[0], size[1], size[2], 1))
        bmesh.ops.transform(bm, matrix=m, verts=geom['verts'])
    return _finish(bm, name, material, parent, bevel)

def box(size, loc, material, parent=None, bevel=0.0, rot=(0, 0, 0)):
    return boxes([(size, loc, rot)], material, parent, bevel, 'box')

def cyl(r, depth, loc, material, parent=None, r2=None, rot=(0, 0, 0), seg=28, bevel=0.0):
    bm = bmesh.new()
    geom = bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=depth)
    m = Matrix.Translation(loc) @ Matrix.Rotation(rot[2], 4, 'Z') @ Matrix.Rotation(rot[1], 4, 'Y') @ Matrix.Rotation(rot[0], 4, 'X')
    bmesh.ops.transform(bm, matrix=m, verts=geom['verts'])
    return _finish(bm, 'cyl', material, parent, bevel, smooth=True)

# ---------------------------------------------------------------- materials
M = dict(
    wall=noise_mat('wall', '#dcdfdd', '#d5d8d6', 60, 0.92),
    wall_in=mat('wall_in', '#dcd9cc', 0.92),
    trim=wood_mat('trim', '#6b4a2c', '#59391f', 0.5),
    door=wood_mat('door', '#d39a55', '#c58a45', 0.45),
    carpet=noise_mat('carpet', '#566270', '#6e7a88', 700, 1.0, 0.3),
    tile=noise_mat('tile', '#f5f4ef', '#e6e4dc', 500, 1.0, 0.15),
    grid=mat('grid', '#f3f2ec', 0.6),
    desk_top=noise_mat('desk_top', '#a39e92', '#9a9589', 300, 0.5),
    desk_body=mat('desk_body', '#8f8b80', 0.55, 0.2),
    edge=mat('edge', '#2a2a2b', 0.5),
    cabinet=mat('cabinet', '#c3c5c2', 0.5, 0.1),
    handle=mat('handle', '#8b8d90', 0.35, 0.8),
    chair=noise_mat('chair', '#1f2538', '#2a3149', 600, 0.95),
    plastic=mat('plastic', '#1b1b1d', 0.45),
    beige=mat('beige', '#cfc7b3', 0.55),
    screen=mat('screen', '#0b1420', 0.2, 0, '#6f8296', 0.22),
    screen_off=mat('screen_off', '#0a0a0c', 0.15),
    paper=mat('paper', '#f6f5ef', 0.85),
    manila=mat('manila', '#d9c489', 0.85),
    blind=mat('blind', '#e7e2d3', 0.6),
    partition=noise_mat('partition', '#66727f', '#5b6672', 800, 1.0, 0.1),
    wood=wood_mat('wood', '#8a5d3b', '#6f4628', 0.4),
    chrome=mat('chrome', '#b9bcc0', 0.25, 0.9),
    white=mat('white', '#f1f0ea', 0.5),
    pot=mat('pot', '#7a5a45', 0.8),
    leaf=mat('leaf', '#3d6a35', 0.6),
    leaf2=mat('leaf2', '#2c5229', 0.6),
    red=mat('red', '#a12a22', 0.5),
    blue=mat('blue', '#2c4a7c', 0.5),
    green=mat('green', '#3c6b4c', 0.6),
    couch=noise_mat('couch', '#8f9291', '#84878a', 500, 0.95),
    water=mat('water', '#bcd7e8', 0.1),
    sign=mat('sign', '#16171a', 0.4),
    sign_text=mat('sign_text', '#f2f2ee', 0.5),
    lens=emit_mat('lens', '#f4f6ff', 20.0),
    day=emit_mat('day', '#dfeaff', 9.0),
    exit=emit_mat('exit', '#ff3b2a', 3.0),
    vend=emit_mat('vend', '#ffd9a0', 2.5),
    desk_wood=wood_mat('desk_wood', '#d6a868', '#c99854', 0.4, 0.8),
    panel=mat('panel', '#8a98a6', 0.6),
    panel_top=mat('panel_top', '#5c5f64', 0.4),
    phone=mat('phone', '#3c3e43', 0.5),
    phone_lcd=mat('phone_lcd', '#aab8a6', 0.3),
    scr_blue=mat('scr_blue', '#123a8c', 0.2, 0, '#1f55c8', 0.9),
    scr_logo=mat('scr_logo', '#ffffff', 0.2, 0, '#ffffff', 1.2),
    scr_desk=mat('scr_desk', '#3a5a86', 0.2, 0, '#42689c', 0.6),
    scr_doc=mat('scr_doc', '#ffffff', 0.2, 0, '#f2f4f7', 1.0),
    yellow=mat('yellow', '#f1dc5a', 0.8),
    nameplate=mat('nameplate', '#8a6a2c', 0.35, 0.6),
    blue_bin=mat('blue_bin', '#2f55b8', 0.5),
    box_white=mat('box_white', '#ecebe4', 0.85),
    card=noise_mat('card', '#b08d5e', '#a37f52', 200, 0.9),
    bin=mat('bin', '#3a3c40', 0.6),
    frame_wood=wood_mat('frame_wood', '#8a5d34', '#6f4826', 0.4),
    blind_dark=mat('blind_dark', '#3d3a36', 0.6),
    dimroom=emit_mat('dimroom', '#ffe6bd', 1.2),
    cream=mat('cream', '#ebe1bf', 0.92),
    base=mat('base', '#7d8590', 0.7),
    blackframe=mat('blackframe', '#111214', 0.4),
    louvre=mat('louvre', '#b9bcc0', 0.3, 0.7),
    warm=emit_mat('warm', '#ffd9a0', 6.0),
    screen_panel=noise_mat('screen_panel', '#d9d3bf', '#d0cab6', 500, 0.95),
    frame_grey=mat('frame_grey', '#9a9d9f', 0.4, 0.5),
    table_wood=wood_mat('table_wood', '#7a5334', '#684427', 0.4),
    shade=mat('shade', '#f3ecd9', 0.8, 0, '#ffe2b0', 1.5),
    counter_top=mat('counter_top', '#8b9084', 0.45),
    purple=mat('purple', '#5b3fa0', 0.6),
    pink=mat('pink', '#d85a9a', 0.6),
    blue_sign=mat('blue_sign', '#2f7fd0', 0.5),
    exit_dark=mat('exit_dark', '#1a1a1c', 0.5),
    cubicle=noise_mat('cubicle', '#cfd2d3', '#c6c9ca', 600, 0.95),
    cork=noise_mat('cork', '#b98f5c', '#a67c4b', 300, 0.95),
    shelf=wood_mat('shelf', '#4a3524', '#3a2819', 0.5),
    map_sea=mat('map_sea', '#a9d3e6', 0.7),
    map_g=mat('map_g', '#9fd08a', 0.7),
    map_o=mat('map_o', '#f0b060', 0.7),
    darkroom=mat('darkroom', '#0d0d0e', 0.9),
)
COLORS = [M['plastic'], M['white'], M['blue'], M['red'], M['green'], M['manila']]

# ------------------------------------------------------------------- shell
# Layout follows stills from the show. The viewer sits at the desk in the
# middle of the bullpen facing +Y: reception is ahead-left against the front
# wall, the waiting sofa ahead-right, and the black-framed glass walls of the
# manager's office and conference room run down the right-hand side.
XA, XB = -5.5, 3.0        # left wall / glass partition line (the real set is a tight room)
XR = 6.8                  # outer wall of the two glass-fronted rooms
YA, YB = -3.2, 5.6        # wall behind the viewer / front wall
YP = 1.9                  # wall between conference room (behind) and manager's office (front)
H = 2.5
T = 0.12

box((XR - XA + 1, YB - YA + 1, 0.1), ((XA + XR) / 2, (YA + YB) / 2, -0.05), M['carpet'])
box((XR - XA + 1, YB - YA + 1, 0.1), ((XA + XR) / 2, (YA + YB) / 2, H + 0.05), M['tile'])

def wall_run(axis, pos, a0, a1, openings=(), material=None, thick=T):
    """A wall along `axis` ('x' or 'y') at the given cross position, with
    openings (a_start, a_end, z_bottom, z_top) cut out."""
    material = material or M['wall']
    items = []
    def seg(s0, s1, z0, z1):
        if s1 - s0 < 1e-4 or z1 - z0 < 1e-4:
            return
        size_along, mid = s1 - s0, (s0 + s1) / 2
        if axis == 'y':
            items.append(((thick, size_along, z1 - z0), (pos, mid, (z0 + z1) / 2)))
        else:
            items.append(((size_along, thick, z1 - z0), (mid, pos, (z0 + z1) / 2)))
    cur = a0
    for (s0, s1, z0, z1) in sorted(openings):
        seg(cur, s0, 0, H)
        seg(s0, s1, 0, z0)
        seg(s0, s1, z1, H)
        cur = s1
    seg(cur, a1, 0, H)
    return boxes(items, material, name='wall')

def blinds(parent, length, z0, z1, tilt, pulled=0.0, blind_mat=None):
    """Horizontal blinds in a local frame: wall runs along X, room side is -Y."""
    items = [((length, 0.04, 0.035), (0, 0, z1 - 0.02))]
    step = 0.036
    top = z1 - 0.05
    bottom = z0 + (z1 - z0) * pulled
    n = int((top - bottom) / step)
    for i in range(n):
        items.append(((length - 0.02, 0.046, 0.0022), (0, 0, top - i * step), (tilt, 0, 0)))
    items.append(((length - 0.02, 0.03, 0.018), (0, 0, top - n * step)))
    boxes(items, blind_mat or M['blind'], parent, name='blinds')

def window(axis, pos, a0, a1, z0, z1, tilt, pulled=0.0, room_side=1, backdrop=None, blind_mat=None):
    """Framed window with blinds in a wall. room_side: +1/-1, which side the blinds hang on."""
    mid, length = (a0 + a1) / 2, a1 - a0
    g = grp((pos, mid, 0), math.pi / 2) if axis == 'y' else grp((mid, pos, 0), 0)
    f = 0.06
    d = T + 0.05
    fr = [((length, d, f), (0, 0, z0 + f / 2)), ((length, d, f), (0, 0, z1 - f / 2)),
          ((f, d, z1 - z0), (-length / 2 + f / 2, 0, (z0 + z1) / 2)), ((f, d, z1 - z0), (length / 2 - f / 2, 0, (z0 + z1) / 2))]
    n_mull = max(0, int(length / 1.25) - 0)
    for i in range(1, n_mull):
        fr.append(((f * 0.8, d, z1 - z0), (-length / 2 + i * length / n_mull, 0, (z0 + z1) / 2)))
    boxes(fr, M['trim'], g, 0.004, 'frame')
    box((length + 0.1, 0.14, 0.03), (0, room_side * -0.05, z0 - 0.015), M['trim'], g, 0.004)
    bg = grp((0, room_side * -0.045, 0), 0, g)
    blinds(bg, length - 2 * f, z0 + f, z1 - f, tilt * room_side, pulled, blind_mat)
    if backdrop:
        box((length, 0.01, z1 - z0), (0, room_side * 0.3, (z0 + z1) / 2), backdrop, g)

def door(axis, pos, a0, a1, zt=2.08, open_way=False, leaf=True, plate=False):
    mid, length = (a0 + a1) / 2, a1 - a0
    g = grp((pos, mid, 0), math.pi / 2) if axis == 'y' else grp((mid, pos, 0), 0)
    d = T + 0.05
    boxes([((0.07, d, zt), (-length / 2 + 0.035, 0, zt / 2)), ((0.07, d, zt), (length / 2 - 0.035, 0, zt / 2)),
           ((length, d, 0.07), (0, 0, zt - 0.035))], M['trim'], g, 0.004, 'doorframe')
    if leaf:
        box((length - 0.14, 0.045, zt - 0.08), (0, 0, (zt - 0.08) / 2), M['door'], g, 0.003)
        for s in (-1, 1):
            box((0.12, 0.02, 0.02), (length / 2 - 0.2, s * 0.05, 1.0), M['handle'], g, 0.003)
    if plate:
        box((0.22, 0.01, 0.06), (0, -0.03, 1.6), M['handle'], g, 0.002)

# ------------------------------------------------------------------ walls
ACC_WIN = (-5.3, -4.5, 0.95, 2.1)
wall_run('x', YB + T / 2, XA - T, XR + T, [ACC_WIN])
window('x', YB + T / 2, ACC_WIN[0], ACC_WIN[1], ACC_WIN[2], ACC_WIN[3], 0.9, 0.0, 1, M['day'])
KITCHEN = (-1.9, -0.95, 0, 2.08)
wall_run('y', XA - T / 2, YA, YB, [KITCHEN])
door('y', XA - T / 2, KITCHEN[0], KITCHEN[1], leaf=False)
box((0.05, 3, H), (XA - 1.6, -1.4, H / 2), M['wall_in'])
box((0.6, 0.02, 1.2), (XA - 1.55, -1.4, 1.1), M['vend'], rot=(0, 0, math.pi / 2))
BACK_DOOR = (-3.2, -2.3, 0, 2.08)
BACK_WIN = (-1.8, -0.4, 0.95, 2.1)
wall_run('x', YA - T / 2, XA - T, XR + T, [BACK_DOOR, BACK_WIN])
door('x', YA - T / 2, BACK_DOOR[0], BACK_DOOR[1])
window('x', YA - T / 2, BACK_WIN[0], BACK_WIN[1], BACK_WIN[2], BACK_WIN[3], 1.25, 0.0, -1, M['darkroom'], blind_mat=M['blind_dark'])
# Outer wall of the glass-fronted rooms, with daylight windows.
SIDE_EXT = [(-2.6, -1.0, 0.9, 2.1), (-0.4, 1.2, 0.9, 2.1), (2.8, 5.0, 0.9, 2.1)]
wall_run('y', XR + T / 2, YA, YB, SIDE_EXT, M['wall_in'])
for (a0, a1, z0, z1) in SIDE_EXT:
    window('y', XR + T / 2, a0, a1, z0, z1, 0.6, 0.0, 1, M['day'])
wall_run('x', YP, XB + 0.3, XR, material=M['wall_in'])

# Right-hand side: black-framed glass partitions with white blinds, honey doors.
GLASS_Z = 2.08
def glass_wall(y0, y1, door_at=None):
    ln = y1 - y0
    items = [((0.07, ln, 0.09), (XB, (y0 + y1) / 2, 0.045)), ((0.07, ln, 0.06), (XB, (y0 + y1) / 2, GLASS_Z)), ((0.07, ln, 0.07), (XB, (y0 + y1) / 2, H - 0.035))]
    n = max(1, round(ln / 0.95))
    edges = [y0 + i * ln / n for i in range(n + 1)]
    if door_at:
        edges = sorted(set([e for e in edges if not (door_at[0] - 0.3 < e < door_at[1] + 0.3)] + [door_at[0], door_at[1]]))
    for e in edges:
        items.append(((0.07, 0.07, H), (XB, e, H / 2)))
    boxes(items, M['blackframe'], None, 0.003, 'glassframe')
    for i in range(len(edges) - 1):
        e0, e1 = edges[i], edges[i + 1]
        if door_at and abs(e0 - door_at[0]) < 1e-6:
            box((0.045, e1 - e0 - 0.08, GLASS_Z - 0.05), (XB, (e0 + e1) / 2, (GLASS_Z - 0.05) / 2 + 0.01), M['door'], bevel=0.003)
            for sx in (-1, 1):
                box((0.02, 0.12, 0.02), (XB + sx * 0.05, e1 - 0.14, 1.0), M['handle'], bevel=0.003)
            continue
        bg = grp((XB + 0.07, (e0 + e1) / 2, 0), math.pi / 2)
        blinds(bg, e1 - e0 - 0.09, 0.14, GLASS_Z - 0.03, rnd.uniform(0.45, 0.7))
MGR = (2.2, YB)
CONF = (-0.6, 1.6)
glass_wall(MGR[0], MGR[1], door_at=(4.65, 5.5))
glass_wall(CONF[0], CONF[1], door_at=(0.7, 1.6))
box((0.14, MGR[0] - CONF[1], H), (XB, (MGR[0] + CONF[1]) / 2, H / 2), M['cream'])
box((0.02, 0.1, 0.14), (XB - 0.08, (MGR[0] + CONF[1]) / 2, 1.5), M['frame_wood'], bevel=0.003)
box((0.14, CONF[0] - YA, H), (XB, (CONF[0] + YA) / 2, H / 2), M['cream'])

def base(axis, pos, a0, a1):
    if axis == 'x':
        box((a1 - a0, 0.015, 0.1), ((a0 + a1) / 2, pos, 0.05), M['base'])
    else:
        box((0.015, a1 - a0, 0.1), (pos, (a0 + a1) / 2, 0.05), M['base'])
base('x', YB - 0.008, XA, XB); base('y', XA + 0.008, YA, KITCHEN[0]); base('y', XA + 0.008, KITCHEN[1], YB)
base('x', YA + 0.008, XA, BACK_DOOR[0]); base('x', YA + 0.008, BACK_DOOR[1], XB); base('y', XB - 0.078, YA, CONF[0])

# Structural column, white, hung with certificates.
COL = (-2.0, 3.3)
box((0.5, 0.5, H), (COL[0], COL[1], H / 2), M['wall'])
box((0.53, 0.53, 0.1), (COL[0], COL[1], 0.05), M['base'])

# Ceiling: 2x4 tile grid, recessed louvred lights, a few downlights at the front.
gitems = []
x = XA
while x <= XR:
    gitems.append(((0.024, YB - YA, 0.012), (x, (YA + YB) / 2, H - 0.006)))
    x += 0.6
y = YA
while y <= YB:
    gitems.append(((XR - XA, 0.024, 0.012), ((XA + XR) / 2, y, H - 0.006)))
    y += 1.2
boxes(gitems, M['grid'], name='ceiling_grid')
litems, louv = [], []
def troffer(ix, iy):
    cx_ = XA + 0.6 * ix + 0.3
    cy_ = YA + 1.2 * iy + 0.6
    litems.append(((0.56, 1.16, 0.006), (cx_, cy_, H - 0.004)))
    for k in range(3):
        louv.append(((0.006, 1.16, 0.035), (cx_ - 0.28 + 0.28 * k, cy_, H - 0.026)))
    for k in range(7):
        louv.append(((0.56, 0.006, 0.035), (cx_, cy_ - 0.58 + k * 1.16 / 6, H - 0.026)))
for iy in (0, 2, 4, 6):
    for ix in (1, 4, 7, 10, 13):
        troffer(ix, iy)
for (ix, iy) in ((16, 1), (18, 3), (16, 5), (18, 6)):
    troffer(ix, iy)
boxes(litems, M['lens'], name='troffers')
boxes(louv, M['louvre'], name='louvres')
# Cut the tile plane open above each light by raising a white housing.
for xx in (-2.8, -1.8, -0.8, 0.4, 1.5, 2.5):
    cyl(0.07, 0.01, (xx, YB - 0.4, H - 0.004), M['lens'], seg=20)

# ---------------------------------------------------------------- furniture
def chair(parent, loc, rotz):
    g = grp(loc, rotz, parent)
    box((0.5, 0.48, 0.09), (0, 0, 0.47), M['chair'], g, 0.03)
    box((0.46, 0.07, 0.56), (0, -0.25, 0.86), M['chair'], g, 0.035, rot=(0.14, 0, 0))
    box((0.06, 0.03, 0.3), (0, -0.275, 0.6), M['plastic'], g, 0.005, rot=(0.14, 0, 0))
    cyl(0.025, 0.32, (0, 0, 0.27), M['plastic'], g)
    for i in range(5):
        a = i * math.tau / 5 + 0.3
        box((0.045, 0.3, 0.03), (math.sin(a) * 0.15, math.cos(a) * 0.15, 0.09), M['plastic'], g, 0.006, rot=(0, 0, -a))
        cyl(0.028, 0.045, (math.sin(a) * 0.29, math.cos(a) * 0.29, 0.03), M['plastic'], g, rot=(0, math.pi / 2, -a), seg=14)

def monitor(parent, loc, rotz, screen='doc'):
    g = grp(loc, rotz, parent)
    box((0.47, 0.04, 0.34), (0, 0, 0.33), M['plastic'], g, 0.008)
    box((0.07, 0.03, 0.16), (0, 0.025, 0.1), M['plastic'], g, 0.004)
    box((0.24, 0.18, 0.015), (0, 0.02, 0.008), M['plastic'], g, 0.004)
    if screen == 'saver':
        box((0.43, 0.004, 0.30), (0, -0.021, 0.335), M['scr_blue'], g)
        box((0.16, 0.004, 0.07), (0.02, -0.023, 0.35), M['scr_logo'], g)
    elif screen == 'off':
        box((0.43, 0.004, 0.30), (0, -0.021, 0.335), M['screen_off'], g)
    else:
        box((0.43, 0.004, 0.30), (0, -0.021, 0.335), M['scr_desk'], g)
        box((0.33, 0.004, 0.22), (rnd.uniform(-0.03, 0.03), -0.023, 0.33), M['scr_doc'], g)
        box((0.33, 0.004, 0.018), (0, -0.0235, 0.447), M['scr_blue'], g)

def phone(parent, loc, rotz):
    g = grp(loc, rotz, parent)
    box((0.22, 0.2, 0.05), (0, 0, 0.045), M['phone'], g, 0.01, rot=(0.3, 0, 0))
    box((0.09, 0.05, 0.006), (0.03, 0.06, 0.092), M['phone_lcd'], g, rot=(0.3, 0, 0))
    box((0.05, 0.2, 0.04), (-0.085, 0, 0.085), M['phone'], g, 0.014, rot=(0.3, 0, 0))

def papers(parent, loc, n=6, mat_=None):
    items = []
    for i in range(n):
        items.append(((0.216, 0.279, 0.0016), (loc[0] + rnd.uniform(-.012, .012), loc[1] + rnd.uniform(-.012, .012), loc[2] + i * 0.0018), (0, 0, rnd.uniform(-.3, .3))))
    boxes(items, mat_ or M['paper'], parent, name='papers')

def tray(g, x, y, z):
    tg = grp((x, y, z), rnd.uniform(-0.25, 0.25), g)
    for lvl in range(2):
        zz = lvl * 0.075
        boxes([((0.26, 0.33, 0.004), (0, 0, zz + 0.002)), ((0.004, 0.33, 0.045), (-0.13, 0, zz + 0.022)),
               ((0.004, 0.33, 0.045), (0.13, 0, zz + 0.022)), ((0.26, 0.004, 0.045), (0, 0.165, zz + 0.022))], M['plastic'], tg, name='tray')
        papers(tg, (0, 0, zz + 0.006), rnd.randint(3, 10))

def books(g, x, y, z):
    zz = z
    for i in range(rnd.randint(2, 4)):
        hh = rnd.uniform(0.02, 0.045)
        box((rnd.uniform(0.16, 0.2), rnd.uniform(0.22, 0.26), hh), (x, y, zz + hh / 2), rnd.choice(COLORS), g, 0.003, rot=(0, 0, rnd.uniform(-0.3, 0.3)))
        zz += hh

def pencup(g, x, y, z):
    cyl(0.038, 0.1, (x, y, z + 0.05), M['plastic'], g, seg=16)
    for i in range(5):
        cyl(0.004, 0.16, (x + rnd.uniform(-.02, .02), y + rnd.uniform(-.02, .02), z + 0.11), rnd.choice(COLORS), g, rot=(rnd.uniform(-.2, .2), rnd.uniform(-.2, .2), 0), seg=6)

def mug(g, x, y, z):
    cyl(0.04, 0.095, (x, y, z + 0.048), rnd.choice((M['white'], M['blue'], M['red'], M['green'], M['white'])), g, r2=0.042)

def photo(g, x, y, z):
    box((0.13, 0.012, 0.17), (x, y, z + 0.085), M['plastic'], g, 0.003, rot=(-0.2, 0, rnd.uniform(2.6, 3.6)))

def notes(g, x, y, z):
    boxes([((0.076, 0.076, 0.012), (x, y, z + 0.006), (0, 0, rnd.uniform(0, 1))),
           ((0.076, 0.076, 0.008), (x + 0.1, y + 0.02, z + 0.004), (0, 0, rnd.uniform(0, 1)))], M['yellow'], g, name='notes')

def bottle(g, x, y, z):
    cyl(0.032, 0.2, (x, y, z + 0.1), M['water'], g, seg=16)
    cyl(0.014, 0.03, (x, y, z + 0.215), M['white'], g, seg=10)

def binder_row(g, x, y, z):
    xx = x - 0.1
    for i in range(rnd.randint(2, 4)):
        w = rnd.choice((0.04, 0.055, 0.07))
        box((w, 0.25, 0.3), (xx + w / 2, y, z + 0.15), rnd.choice(COLORS), g, 0.004)
        xx += w + 0.003

def lamp(g, x, y, z):
    lg = grp((x, y, z), rnd.uniform(0, 6.28), g)
    cyl(0.085, 0.02, (0, 0, 0.01), M['plastic'], lg)
    cyl(0.008, 0.34, (0.05, 0, 0.17), M['plastic'], lg, rot=(0, 0.3, 0), seg=10)
    cyl(0.06, 0.1, (0.15, 0, 0.33), M['plastic'], lg, r2=0.03, rot=(0, 2.2, 0), seg=18)

SMALL = [books, pencup, mug, photo, notes, bottle, mug, books, pencup]

def desk(parent, loc, rotz, screen='doc', mon_x=0.0, clutter=1.0, lamp_=False, nameplate=True, bin_=False):
    """Honey-wood office desk with grey panels. The sitter is on the local -Y side."""
    g = grp(loc, rotz, parent)
    w, d, h = 1.52, 0.76, 0.74
    box((w, d, 0.035), (0, 0, h - 0.0175), M['desk_wood'], g, 0.005)
    for s in (-1, 1):
        px = s * (w / 2 - 0.22)
        box((0.42, d - 0.05, h - 0.035 - 0.07), (px, 0.005, (h - 0.035 - 0.07) / 2 + 0.07), M['panel'], g, 0.003)
        for k in range(3):
            z = 0.09 + k * 0.2
            box((0.39, 0.016, 0.185), (px, -(d - 0.05) / 2 - 0.004, z + 0.0925), M['desk_wood'], g, 0.004)
            box((0.11, 0.014, 0.012), (px, -(d - 0.05) / 2 - 0.018, z + 0.13), M['handle'], g, 0.002)
    box((w - 0.02, 0.018, h - 0.19), (0, d / 2 - 0.03, (h - 0.19) / 2 + 0.12), M['panel'], g, 0.003)
    box((w, 0.03, 0.06), (0, d / 2 - 0.03, h - 0.065), M['desk_wood'], g, 0.003)
    z = h
    monitor(g, (mon_x, 0.17, z), rnd.uniform(-0.2, 0.2) - mon_x * 0.5, screen)
    box((0.45, 0.16, 0.022), (mon_x, -0.17, z + 0.011), M['plastic'], g, 0.005, rot=(0, 0, rnd.uniform(-0.08, 0.08)))
    box((0.22, 0.19, 0.004), (mon_x + 0.38, -0.17, z + 0.002), M['blue'], g)
    box((0.06, 0.1, 0.03), (mon_x + 0.38, -0.17, z + 0.018), M['plastic'], g, 0.012)
    side = -1 if mon_x >= 0 else 1
    phone(g, (side * 0.56, 0.02, z), rnd.uniform(-0.3, 0.3) + side * 0.3)
    spots = [(-side * 0.6, 0.24), (-side * 0.62, -0.02), (side * 0.58, 0.27), (side * 0.3 + mon_x * 0.2, 0.3), (-side * 0.3, 0.3), (-side * 0.62, -0.26), (side * 0.6, -0.26)]
    rnd.shuffle(spots)
    if clutter > 0.2:
        sx, sy = spots.pop()
        tray(g, sx, sy, z)
    if lamp_:
        sx, sy = spots.pop()
        lamp(g, sx, sy, z)
    for i in range(int(clutter * 4)):
        if not spots:
            break
        sx, sy = spots.pop()
        rnd.choice(SMALL)(g, sx, sy, z)
    if clutter > 0.5:
        papers(g, (rnd.uniform(-0.25, 0.25) - mon_x * 0.5, -0.02, z), rnd.randint(2, 8), rnd.choice((M['paper'], M['manila'])))
    if nameplate:
        box((0.2, 0.035, 0.05), (rnd.uniform(-0.2, 0.3), 0.33, z + 0.025), M['nameplate'], g, 0.003)
    if bin_:
        cyl(0.13, 0.3, (rnd.choice((-0.5, 0.5)) * 0, -0.75 + 0.75, 0.0), M['bin'], g) if False else None
    return g

def bankers_box(parent, loc, rotz=0.0, white=True):
    g = grp(loc, rotz, parent)
    box((0.4, 0.31, 0.25), (0, 0, 0.125), M['box_white'] if white else M['card'], g, 0.004)
    box((0.42, 0.33, 0.06), (0, 0, 0.255), M['box_white'] if white else M['card'], g, 0.004)
    box((0.1, 0.004, 0.03), (0, -0.157, 0.16), M['edge'], g)

def file_cabinet(loc, rotz=0, w=0.92, drawers=4, top='random'):
    g = grp(loc, rotz)
    hh = 0.32 * drawers + 0.06
    box((w, 0.47, hh), (0, 0, hh / 2), M['cabinet'], g, 0.004)
    for k in range(drawers):
        z = 0.04 + k * 0.32
        box((w - 0.03, 0.012, 0.3), (0, -0.24, z + 0.15), M['cabinet'], g, 0.004)
        box((0.16, 0.012, 0.016), (0, -0.25, z + 0.25), M['handle'], g, 0.002)
        box((0.07, 0.004, 0.035), (0, -0.248, z + 0.19), M['paper'], g)
    if top == 'boxes' or (top == 'random' and rnd.random() < 0.5):
        n = rnd.randint(1, 2)
        for i in range(n):
            bx = -0.22 + i * 0.45 + rnd.uniform(-.03, .03) if n == 2 else rnd.uniform(-0.15, 0.15)
            wh = rnd.random() < 0.5
            bankers_box(g, (bx, 0, hh), rnd.uniform(-0.1, 0.1), wh)
            if rnd.random() < 0.45:
                bankers_box(g, (bx + rnd.uniform(-.02, .02), 0, hh + 0.285), rnd.uniform(-0.1, 0.1), rnd.random() < 0.5)
    elif top == 'plant' or (top == 'random' and rnd.random() < 0.5):
        plant_small(grp((rnd.uniform(-0.2, 0.2), 0, hh), 0, g))
    elif top == 'random':
        binder_row(g, rnd.uniform(-0.2, 0.1), 0, hh)
    return hh

def plant_small(parent):
    cyl(0.075, 0.13, (0, 0, 0.065), M['pot'], parent, r2=0.09)
    for i in range(14):
        a = rnd.uniform(0, math.tau); ln = rnd.uniform(0.14, 0.32); lean = rnd.uniform(0.2, 1.1)
        box((0.05, ln, 0.002), (math.sin(a) * ln * 0.4 * math.sin(lean), math.cos(a) * ln * 0.4 * math.sin(lean), 0.13 + ln * 0.45 * math.cos(lean)),
            M['leaf'] if i % 2 else M['leaf2'], parent, rot=(math.pi / 2 - lean, 0, -a))

def tree(loc, height=1.9):
    """Tall leafy office plant."""
    g = grp(loc)
    cyl(0.2, 0.36, (0, 0, 0.18), M['pot'], g, r2=0.24)
    cyl(0.02, height - 0.5, (0, 0, 0.36 + (height - 0.5) / 2), M['trim'], g, seg=8)
    bm = bmesh.new()
    for i in range(170):
        t = rnd.random() ** 0.7
        zc = 0.7 + t * (height - 0.7)
        rad = 0.5 * math.sin(math.pi * min(1, t * 0.9 + 0.1)) + 0.08
        a = rnd.uniform(0, math.tau); rr = rad * rnd.uniform(0.3, 1)
        ln = rnd.uniform(0.09, 0.15); wd = ln * 0.45
        vs = [bm.verts.new(v) for v in ((-wd / 2, 0, 0), (0, -ln / 2, 0), (wd / 2, 0, 0), (0, ln / 2, 0))]
        bm.faces.new(vs)
        m = Matrix.Translation((math.cos(a) * rr, math.sin(a) * rr, zc)) @ Matrix.Rotation(rnd.uniform(0, 6.28), 4, 'Z') @ Matrix.Rotation(rnd.uniform(-0.9, 0.9), 4, 'X') @ Matrix.Rotation(rnd.uniform(-0.9, 0.9), 4, 'Y')
        bmesh.ops.transform(bm, matrix=m, verts=vs)
    _finish(bm, 'leaves', M['leaf'], g, 0)

def frame(axis, pos, along, z, w, h, color, side=1, mat_border=None):
    """Framed print or certificate on a wall; `side` is the way it faces."""
    fm = mat_border or M['plastic']
    inner = mat('print', color, 0.7)
    if axis == 'y':
        box((0.025, w, h), (pos + side * 0.0125, along, z), fm, bevel=0.004)
        box((0.004, w - 0.07, h - 0.07), (pos + side * 0.027, along, z), M['paper'])
        box((0.004, w - 0.2, h - 0.2), (pos + side * 0.03, along, z), inner)
    else:
        box((w, 0.025, h), (along, pos + side * 0.0125, z), fm, bevel=0.004)
        box((w - 0.07, 0.004, h - 0.07), (along, pos + side * 0.027, z), M['paper'])
        box((w - 0.2, 0.004, h - 0.2), (along, pos + side * 0.03, z), inner)

def bin_(x, y):
    cyl(0.13, 0.3, (x, y, 0.15), M['bin'], r2=0.16, seg=20)

def plant(loc, height=1.9):
    """Tall palm: arching fronds from a floor pot."""
    g = grp(loc)
    cyl(0.2, 0.36, (0, 0, 0.18), M['pot'], g, r2=0.24)
    for i in range(26):
        a = rnd.uniform(0, math.tau)
        lean = rnd.uniform(0.1, 0.6)
        ln = rnd.uniform(0.6, 1.0) * height
        w = 0.11
        bm = bmesh.new()
        segs = 8
        prev = None
        for k in range(segs + 1):
            t = k / segs
            wd = w * math.sin(math.pi * (0.1 + 0.9 * t) ** 0.7)
            bend = lean + t * t * 1.3
            px = ln * t * math.sin(bend) * 0.8
            pz = ln * t * math.cos(bend * 0.75)
            v1 = bm.verts.new((px, -wd / 2, pz)); v2 = bm.verts.new((px, wd / 2, pz))
            if prev:
                bm.faces.new((prev[0], prev[1], v2, v1))
            prev = (v1, v2)
        bmesh.ops.transform(bm, matrix=Matrix.Translation((0, 0, 0.34)) @ Matrix.Rotation(a, 4, 'Z'), verts=bm.verts)
        _finish(bm, 'frond', M['leaf'] if i % 3 else M['leaf2'], g, 0, smooth=True)

def torchiere(x, y):
    cyl(0.14, 0.03, (x, y, 0.015), M['plastic'])
    cyl(0.014, 1.72, (x, y, 0.88), M['plastic'], seg=12)
    cyl(0.03, 0.12, (x, y, 1.78), M['plastic'], r2=0.2, seg=28)
    cyl(0.17, 0.005, (x, y, 1.835), M['warm'], seg=24)

def privacy(parent, x, y, ln, along='x'):
    sz = (ln, 0.03, 0.3) if along == 'x' else (0.03, ln, 0.3)
    box(sz, (x, y, 0.74 + 0.15), M['screen_panel'], parent, 0.008)

def painting(axis, pos, along, z, w, h, bands, side=-1):
    frame(axis, pos, along, z, w, h, bands[0], side, M['frame_grey'])
    n = len(bands)
    iw, ih = w - 0.2, h - 0.2
    for i, colr in enumerate(bands):
        bh = ih / n
        zz = z + ih / 2 - bh * (i + 0.5)
        m_ = mat('band', colr, 0.7)
        if axis == 'x':
            box((iw, 0.004, bh), (along, pos + side * 0.031, zz), m_)
        else:
            box((0.004, iw, bh), (pos + side * 0.031, along, zz), m_)

def sofa(loc, rotz, seats=3):
    g = grp(loc, rotz)
    w = 0.68 * seats + 0.36
    box((w, 0.85, 0.24), (0, 0, 0.2), M['couch'], g, 0.03)
    box((w, 0.22, 0.48), (0, 0.33, 0.56), M['couch'], g, 0.05)
    for s_ in (-1, 1):
        box((0.18, 0.85, 0.5), (s_ * (w / 2 - 0.09), 0, 0.33), M['couch'], g, 0.04)
    for i in range(seats):
        cx_ = -w / 2 + 0.18 + 0.34 + i * 0.68
        box((0.66, 0.6, 0.15), (cx_, -0.08, 0.39), M['couch'], g, 0.05)
        box((0.66, 0.16, 0.36), (cx_, 0.2, 0.62), M['couch'], g, 0.06, rot=(-0.15, 0, 0))

def side_table(x, y, lamp_=False, plant_=False):
    box((0.6, 0.6, 0.04), (x, y, 0.55), M['table_wood'], bevel=0.004)
    for sx in (-1, 1):
        for sy in (-1, 1):
            box((0.045, 0.045, 0.53), (x + sx * 0.26, y + sy * 0.26, 0.265), M['table_wood'])
    if lamp_:
        box((0.12, 0.12, 0.3), (x, y, 0.72), M['table_wood'], bevel=0.01)
        cyl(0.1, 0.22, (x, y, 1.0), M['shade'], r2=0.19, seg=28)
    if plant_:
        g = grp((x, y, 0.57))
        cyl(0.11, 0.2, (0, 0, 0.1), M['white'], g, r2=0.13)
        for i in range(26):
            a = rnd.uniform(0, math.tau); ln = rnd.uniform(0.2, 0.42); lean = rnd.uniform(0.15, 1.0)
            box((0.08, ln, 0.002), (math.sin(a) * ln * 0.45 * math.sin(lean), math.cos(a) * ln * 0.45 * math.sin(lean), 0.2 + ln * 0.5 * math.cos(lean)),
                M['leaf'] if i % 2 else M['leaf2'], g, rot=(math.pi / 2 - lean, 0, -a))

# --- The viewer's desk: centre of the bullpen, facing the front wall.
desk(None, (0.0, 0.8, 0), 0, screen='doc', mon_x=-0.5, clutter=0.8)
frame('y', XA, -2.4, 1.7, 0.6, 0.8, '#c9c2b2', 1)
privacy(None, -0.78, 0.8, 0.76, 'y')
cyl(0.055, 0.045, (-0.6, 0.95, 0.74 + 0.0225), M['red'], seg=24)
# Neighbour to the right, facing the other way; low cream cabinet with files at her end.
desk(None, (1.56, 0.8, 0), math.pi, screen='doc', mon_x=0.25, clutter=1.0, lamp_=True)
chair(None, (1.7, 1.6, 0), math.pi + 0.5)
box((0.36, 0.27, 0.2), (1.2, 0.72, 0.74 + 0.1), M['pink'], bevel=0.01)
box((0.4, 0.3, 0.1), (1.22, 0.7, 0.74 + 0.25), M['blue_bin'], bevel=0.01)
box((0.42, 0.9, 0.72), (2.55, 0.75, 0.36), M['screen_panel'], bevel=0.006)
papers(None, (2.55, 0.75, 0.72), 40, M['manila'])
papers(None, (2.53, 0.78, 0.795), 12)
bin_(0.85, 0.15)
# Desk pair ahead of the viewer, nearer reception (two salesmen facing each other).
g = grp((-0.4, 2.75, 0), math.pi / 2)
desk(g, (0, -0.39, 0), 0, screen='doc', mon_x=-0.3, clutter=1.0, lamp_=True)
desk(g, (0, 0.39, 0), math.pi, screen='doc', mon_x=-0.3, clutter=1.0)
privacy(g, 0, 0.0, 1.2, 'x')
chair(g, (0.0, -1.2, 0), -0.4)
chair(g, (0.1, 1.15, 0), math.pi + 0.35)
bin_(0.55, 2.0)
# Desk pair behind the viewer.
g = grp((-0.6, -1.9, 0), math.pi / 2)
desk(g, (0, -0.39, 0), 0, mon_x=0.3, lamp_=True)
desk(g, (0, 0.39, 0), math.pi, mon_x=0.3)
chair(g, (0.0, -1.2, 0), 0.3)
chair(g, (0.1, 1.15, 0), math.pi - 0.3)

# --- Column: certificates, uplighter lamp, tall palm, copier.
frame('x', COL[1] - 0.25, COL[0], 1.65, 0.36, 0.3, '#eeeade', -1)
frame('y', COL[0] + 0.25, COL[1], 1.7, 0.32, 0.26, '#efeadb', 1, M['frame_wood'])
frame('y', COL[0] + 0.25, COL[1], 1.3, 0.24, 0.3, '#e9e6da', 1)
torchiere(COL[0] + 0.45, COL[1] + 0.4)
torchiere(XB - 0.4, -2.85)
plant((COL[0] - 0.65, COL[1] - 0.1, 0), 1.7)
cg = grp((-2.7, 2.0, 0), math.pi / 2)
box((0.8, 0.68, 0.9), (0, 0, 0.45), M['white'], cg, 0.012)
box((0.84, 0.7, 0.12), (0, 0, 0.98), M['white'], cg, 0.015)
box((0.5, 0.36, 0.02), (0.1, -0.1, 1.05), M['handle'], cg, 0.004)
box((0.4, 0.3, 0.03), (-0.62, 0, 0.7), M['white'], cg, 0.006)
bankers_box(None, (-2.9, 2.75, 0), 0.2, False)
bankers_box(None, (-2.9, 2.75, 0.29), -0.1, True)

# --- Reception: curved counter, wood panels with black dividers, grey-green top.
RC = (-1.6, 5.85); RR = 1.75
def counter(x0, y0, x1, y1):
    dx, dy = x1 - x0, y1 - y0
    ln = math.hypot(dx, dy); ang = math.atan2(dy, dx)
    cg_ = grp(((x0 + x1) / 2, (y0 + y1) / 2, 0), ang)
    box((ln, 0.06, 0.98), (0, 0, 0.49), M['desk_wood'], cg_)
    box((0.02, 0.07, 0.98), (-ln / 2, 0, 0.49), M['blackframe'], cg_)
    box((ln + 0.02, 0.07, 0.035), (0, 0, 0.99), M['blackframe'], cg_)
    box((ln + 0.1, 0.46, 0.04), (0, 0.17, 1.03), M['counter_top'], cg_, 0.008)
angs = [math.radians(a_) for a_ in (196, 214, 232, 250, 268, 286, 304, 322)]
pts = [(RC[0] + RR * math.cos(a_), RC[1] + RR * math.sin(a_)) for a_ in angs]
for i in range(len(pts) - 1):
    counter(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])
box((0.26, 0.05, 0.06), (-1.35, 4.2, 1.08), M['chrome'], bevel=0.004, rot=(0.3, 0, 0.05))
cyl(0.055, 0.08, (-0.6, 4.5, 1.09), M['water'], seg=20)
cyl(0.04, 0.12, (-0.9, 4.33, 1.11), M['handle'], seg=16)
box((0.3, 0.22, 0.004), (-2.05, 4.28, 1.053), M['purple'], rot=(0, 0, 0.3))
monitor(None, (-1.7, 4.55, 0.74), math.pi + 0.2, 'off')
box((0.5, 0.3, 0.035), (-1.7, 4.55, 0.722), M['desk_wood'])
box((0.06, 0.06, 0.7), (-1.7, 4.55, 0.35), M['desk_wood'])
box((2.3, 0.5, 0.035), (-1.45, 5.33, 0.74), M['desk_wood'], bevel=0.004)
for xx in (-2.4, -0.5):
    box((0.4, 0.46, 0.72), (xx, 5.33, 0.36), M['desk_wood'], bevel=0.004)
box((0.42, 0.4, 0.2), (-1.0, 5.33, 0.86), M['white'], bevel=0.02)          # fax / printer
box((0.3, 0.05, 0.14), (-1.0, 5.16, 0.99), M['paper'], rot=(0.5, 0, 0))
lamp(None, -0.45, 5.3, 0.757)
chair(None, (-1.55, 4.85, 0), math.pi + 0.3)
# Wall behind reception.
frame('x', YB, -2.05, 1.72, 0.62, 0.86, '#1d2c44', -1)                    # dark framed poster
box((0.3, 0.01, 0.2), (-1.25, YB - 0.006, 2.1), M['blue_sign'])
frame('x', YB, -1.25, 1.72, 0.46, 0.38, '#efe9d8', -1, M['frame_wood'])
frame('x', YB, -0.72, 1.72, 0.3, 0.4, '#eee6cf', -1, M['frame_wood'])
frame('x', YB, -1.7, 1.12, 0.34, 0.28, '#efece2', -1)
og = grp((-1.0, YB - 0.05, 1.05))
for lvl in range(4):
    box((0.6, 0.09, 0.02), (0, 0, lvl * 0.16), M['plastic'], og, rot=(0.5, 0, 0))
    box((0.26, 0.012, 0.15), (-0.15, -0.02, lvl * 0.16 + 0.08), rnd.choice((M['manila'], M['blue'], M['manila'])), og, rot=(0.35, 0, 0))
    box((0.26, 0.012, 0.15), (0.15, -0.02, lvl * 0.16 + 0.08), rnd.choice((M['manila'], M['paper'])), og, rot=(0.35, 0, 0))
box((0.2, 0.012, 0.26), (-0.35, YB - 0.008, 1.62), M['frame_wood'], bevel=0.003)
box((0.3, 0.02, 0.16), (0.05, YB - 0.012, 2.12), M['exit_dark'])
box((0.22, 0.004, 0.06), (0.05, YB - 0.024, 2.09), M['exit'])
frame('x', YB, 0.05, 1.55, 0.36, 0.6, '#f1f0ea', -1, M['frame_grey'])
cyl(0.014, 1.75, (0.25, YB - 0.2, 0.875), M['white'], seg=12)             # coat stand
cyl(0.16, 0.02, (0.25, YB - 0.2, 0.01), M['white'])
for a_ in range(4):
    box((0.012, 0.16, 0.012), (0.25 + math.sin(a_ * 1.57) * 0.07, YB - 0.2 + math.cos(a_ * 1.57) * 0.07, 1.7), M['white'], rot=(0.7, 0, -a_ * 1.57))
# Waiting area: big landscape painting, grey sofa and armchair, side tables.
painting('x', YB, 1.85, 1.6, 1.6, 1.1, ['#3f9bb0', '#2f8f86', '#2a7f63', '#3b9a78', '#7fc0b0', '#2f7d6a'])
sofa((1.85, YB - 0.48, 0), 0, 3)
sofa((2.42, 4.0, 0), -math.pi / 2, 1)
side_table(0.42, YB - 0.36, lamp_=True)
side_table(2.6, 3.1, plant_=True)
bin_(2.6, 3.12)

# --- Grey cubicle panels left of reception, accounting nook behind them.
pan = [((0.05, 2.0, 1.5), (-3.5, 4.6, 0.75)), ((1.4, 0.05, 1.5), (-4.2, 3.6, 0.75))]
boxes(pan, M['cubicle'], None, 0.004, 'cubicle')
boxes([((0.07, 2.02, 0.03), (-3.5, 4.6, 1.515)), ((1.42, 0.07, 0.03), (-4.2, 3.6, 1.515)), ((0.07, 0.07, 1.53), (-3.5, 3.6, 0.765)), ((0.07, 0.07, 1.53), (-3.5, 4.6, 0.765))], M['handle'], None, 0.003, 'cubicle_trim')
box((0.45, 1.0, 0.03), (-3.25, 4.9, 1.2), M['cubicle'], bevel=0.004)
pg = grp((-3.25, 5.1, 1.215))
cyl(0.12, 0.16, (0, 0, 0.08), M['pink'], pg, r2=0.14)
for i in range(22):
    a_ = rnd.uniform(0, math.tau); ln = rnd.uniform(0.25, 0.5); lean = rnd.uniform(0.2, 1.1)
    box((0.11, ln, 0.002), (math.sin(a_) * ln * 0.45 * math.sin(lean), math.cos(a_) * ln * 0.45 * math.sin(lean), 0.16 + ln * 0.5 * math.cos(lean)), M['leaf'] if i % 2 else M['leaf2'], pg, rot=(math.pi / 2 - lean, 0, -a_))
tray(None, -3.25, 4.6, 1.215)
box((1.6, 0.02, 1.1), (-3.5, YB - 0.012, 1.7), M['paper'])                # wall year-planner
plan = []
for i in range(1, 12):
    plan.append(((0.006, 0.004, 1.1), (-4.3 + i * 0.1333, YB - 0.024, 1.7)))
for i in range(1, 9):
    plan.append(((1.6, 0.004, 0.005), (-3.5, YB - 0.024, 1.15 + i * 0.122)))
boxes(plan, M['handle'], name='planner_lines')
desk(None, (-4.3, 4.75, 0), math.pi / 2, mon_x=0.25, lamp_=True)
chair(None, (-5.0, 4.75, 0), -math.pi / 2 + 0.3)
desk(None, (-6.4, 6.3 - 0.9, 0) if False else (-5.3, 6.3, 0), math.pi, mon_x=-0.2) if False else None
for i, yy in enumerate((3.05, 2.1)):
    file_cabinet((XA + 0.26, yy, 0), math.pi / 2, drawers=5 if i < 1 else 4, top='boxes')
box((1.2, 0.02, 0.85), (XA + 0.012, 0.3, 1.6), M['cork'], rot=(0, 0, math.pi / 2))
for i in range(9):
    box((0.004, rnd.uniform(0.15, 0.22), rnd.uniform(0.2, 0.28)), (XA + 0.025, 0.3 + rnd.uniform(-0.45, 0.45), 1.6 + rnd.uniform(-0.26, 0.26)), rnd.choice((M['paper'], M['yellow'], M['paper'], M['pink'])))
desk(None, (-4.4, 0.7, 0), math.pi / 2, mon_x=0.2)
chair(None, (-5.1, 0.7, 0), -math.pi / 2)
desk(None, (-3.62, 0.7, 0), -math.pi / 2, mon_x=-0.2, lamp_=True)
chair(None, (-2.9, 0.8, 0), math.pi / 2 + 0.3)

# --- In front of the conference-room glass: honey credenza, ficus; further back, poster, shelves.
for yy in (-0.1,):
    cg_ = grp((XB - 0.36, yy, 0), -math.pi / 2)
    box((0.93, 0.5, 0.72), (0, 0, 0.36), M['desk_wood'], cg_, 0.004)
    for k in range(2):
        box((0.89, 0.012, 0.32), (0, -0.255, 0.05 + k * 0.34 + 0.16), M['desk_wood'], cg_, 0.004)
        box((0.14, 0.012, 0.014), (0, -0.266, 0.05 + k * 0.34 + 0.27), M['handle'], cg_, 0.002)
binder_row(None, XB - 0.4, -0.1, 0.72)
tree((XB - 0.42, 0.5, 0), 1.4)
frame('y', XB - 0.07, -1.0, 1.7, 0.55, 0.7, '#1b2a3e', -1)
sh = grp((XB - 0.3, -2.15, 0), -math.pi / 2)
box((1.3, 0.36, 1.75), (0, 0, 0.875), M['shelf'], sh, 0.004)
for lvl in range(4):
    box((1.22, 0.3, 0.36), (0, -0.04, 0.2 + lvl * 0.4 + 0.02), M['darkroom'], sh)
    xx = -0.56
    while xx < 0.5:
        w = rnd.choice((0.04, 0.055, 0.07))
        if rnd.random() < 0.85:
            box((w, 0.24, rnd.uniform(0.27, 0.31)), (xx + w / 2, -0.1, 0.06 + lvl * 0.4 + 0.15), rnd.choice((M['blue'], M['blue'], M['white'], M['green'], M['plastic'], M['red'])), sh, 0.003)
        xx += w + 0.004
bankers_box(sh, (-0.3, 0, 1.75), 0.05, False)
bankers_box(sh, (0.25, 0, 1.75), -0.05, True)

# --- Wall behind the viewer: world map, door, dark-blind window, cabinets.
box((1.7, 0.02, 1.2), (-4.4, YA + 0.012, 1.6), M['map_sea'])
for i in range(40):
    box((rnd.uniform(0.15, 0.45), 0.004, rnd.uniform(0.12, 0.35)), (-4.4 + rnd.uniform(-0.65, 0.65), YA + 0.024, 1.6 + rnd.uniform(-0.42, 0.42)),
        rnd.choice((M['yellow'], M['pink'], M['map_g'], M['map_o'], M['map_g'])))
for i, xx in enumerate((0.3, 1.25, 2.2)):
    file_cabinet((xx, YA + 0.26, 0), math.pi, drawers=4, top='random')

# --- Inside the glass rooms.
desk(None, (5.0, 3.8, 0), math.pi / 2, mon_x=0.3, lamp_=True)
chair(None, (5.8, 3.8, 0), math.pi / 2)
chair(None, (4.0, 3.4, 0), -math.pi / 2 + 0.3)
chair(None, (4.0, 4.3, 0), -math.pi / 2 - 0.2)
box((0.36, 0.7, 1.5), (XR - 0.2, 2.4, 0.75), M['shelf'], bevel=0.004)
frame('x', YB, 5.0, 1.7, 0.9, 0.6, '#7b6a55', -1)
tree((6.3, 5.1, 0), 1.6)
ct = grp((4.9, -0.8, 0))
box((1.2, 2.8, 0.045), (0, 0, 0.72), M['table_wood'], ct, 0.012)
box((0.5, 0.1, 0.7), (0, -1.1, 0.35), M['plastic'], ct)
box((0.5, 0.1, 0.7), (0, 1.1, 0.35), M['plastic'], ct)
for yy in (-0.95, 0, 0.95):
    chair(ct, (-0.95, yy, 0), -math.pi / 2 + rnd.uniform(-.3, .3))
    chair(ct, (0.95, yy, 0), math.pi / 2 + rnd.uniform(-.3, .3))
box((1.8, 0.03, 1.1), (4.9, YP - 0.08, 1.5), M['white'], bevel=0.004)

# ------------------------------------------------------------------ render
world = bpy.data.worlds.new('w')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (0.02, 0.02, 0.022, 1)
scene.world = world

cam_d = bpy.data.cameras.new('cam')
cam = bpy.data.objects.new('cam', cam_d)
cam.location = (SEAT[0], SEAT[1], 1.2)
cam.rotation_euler = (math.pi / 2, 0, -math.radians(YAW))
col.objects.link(cam)
scene.camera = cam

scene.render.engine = 'CYCLES'
cy = scene.cycles
cy.device = 'CPU'
cy.samples = SAMPLES
cy.use_adaptive_sampling = True
cy.adaptive_threshold = 0.02
cy.use_denoising = True
cy.max_bounces = 8
cy.diffuse_bounces = 5
cy.glossy_bounces = 3
cy.sample_clamp_indirect = 8
cy.caustics_reflective = False
cy.caustics_refractive = False
scene.render.threads_mode = 'AUTO'
scene.view_settings.view_transform = 'AgX'
try:
    scene.view_settings.look = 'AgX - Medium High Contrast'
except Exception:
    pass
scene.view_settings.exposure = 0.0

if MODE == 'pano':
    cam_d.type = 'PANO'
    try:
        cam_d.panorama_type = 'EQUIRECTANGULAR'
    except Exception:
        cam_d.cycles.panorama_type = 'EQUIRECTANGULAR'
    scene.render.resolution_x = WIDTH
    scene.render.resolution_y = WIDTH // 2
    scene.render.use_multiview = True
    scene.render.views_format = 'STEREO_3D'
    cam_d.stereo.convergence_mode = 'OFFAXIS'
    cam_d.stereo.convergence_distance = 4.0
    cam_d.stereo.interocular_distance = 0.064
    cam_d.stereo.use_spherical_stereo = True
    cam_d.stereo.use_pole_merge = True
    cam_d.stereo.pole_merge_angle_from = math.radians(55)
    cam_d.stereo.pole_merge_angle_to = math.radians(80)
    scene.render.image_settings.views_format = 'STEREO_3D'
    scene.render.image_settings.stereo_3d_format.display_mode = 'TOPBOTTOM'
    scene.render.image_settings.stereo_3d_format.use_squeezed_frame = False
else:
    cam_d.lens = 16
    cam_d.sensor_width = 36
    scene.render.resolution_x = WIDTH
    scene.render.resolution_y = int(WIDTH * 9 / 16)
scene.render.resolution_percentage = 100
if OUT.lower().endswith('.jpg'):
    scene.render.image_settings.file_format = 'JPEG'
    scene.render.image_settings.quality = 93
else:
    scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print('RENDERED', OUT)
