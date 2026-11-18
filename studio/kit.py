"""Shared helpers for the room-building scripts: materials, simple shapes,
and the bake-and-export step that turns a Blender scene into a 3D model with
its lighting painted on."""
import math, os
import bpy, bmesh
from mathutils import Matrix, Vector

scene = None
col = None

def reset():
    global scene, col
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    col = scene.collection
    return scene, col

def srgb(hexstr):
    h = hexstr.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1]

_mats = {}
def mat(color, rough=0.85, emit=None, strength=0.0, name=None):
    key = (color, rough, emit, strength)
    if key in _mats:
        return _mats[key]
    m = bpy.data.materials.new(name or color)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = srgb(color)
    b.inputs['Roughness'].default_value = rough
    if emit:
        b.inputs['Emission Color'].default_value = srgb(emit)
        b.inputs['Emission Strength'].default_value = strength
    _mats[key] = m
    return m

def glow(color, strength):
    key = ('glow', color, strength)
    if key in _mats:
        return _mats[key]
    m = bpy.data.materials.new('glow' + color)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    e = nt.nodes.new('ShaderNodeEmission')
    e.inputs['Color'].default_value = srgb(color)
    e.inputs['Strength'].default_value = strength
    o = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(e.outputs[0], o.inputs[0])
    _mats[key] = m
    return m

def finish(bm, name, materials, smooth=False, bevel=0.0, subsurf=0):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    for m in (materials if isinstance(materials, (list, tuple)) else [materials]):
        me.materials.append(m)
    col.objects.link(ob)
    if bevel:
        md = ob.modifiers.new('bevel', 'BEVEL')
        md.width = bevel
        md.segments = 3
        md.limit_method = 'ANGLE'
    if subsurf:
        md = ob.modifiers.new('subsurf', 'SUBSURF')
        md.levels = subsurf
        md.render_levels = subsurf
    return ob

def xform(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    return (Matrix.Translation(loc) @ Matrix.Rotation(rot[2], 4, 'Z') @ Matrix.Rotation(rot[1], 4, 'Y') @ Matrix.Rotation(rot[0], 4, 'X')
            @ Matrix.Diagonal((scale[0], scale[1], scale[2], 1)))

def box(size, loc, material, rot=(0, 0, 0), bevel=0.0, name='box'):
    bm = bmesh.new()
    g = bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.transform(bm, matrix=xform(loc, rot, size), verts=g['verts'])
    return finish(bm, name, material, bevel=bevel)

def boxes(items, material, bevel=0.0, name='boxes'):
    bm = bmesh.new()
    for it in items:
        g = bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.transform(bm, matrix=xform(it[1], it[2] if len(it) > 2 else (0, 0, 0), it[0]), verts=g['verts'])
    return finish(bm, name, material, bevel=bevel)

def cyl(r, depth, loc, material, r2=None, rot=(0, 0, 0), seg=20, name='cyl', bevel=0.0):
    bm = bmesh.new()
    g = bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=depth)
    bmesh.ops.transform(bm, matrix=xform(loc, rot), verts=g['verts'])
    ob = finish(bm, name, material, smooth=True, bevel=bevel)
    try:
        ob.data.set_sharp_from_angle(angle=0.9)
    except Exception:
        pass
    return ob

def ball(radius, loc, material, scale=(1, 1, 1), rot=(0, 0, 0), sub=3, name='ball'):
    bm = bmesh.new()
    g = bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=radius)
    bmesh.ops.transform(bm, matrix=xform(loc, rot, scale), verts=g['verts'])
    return finish(bm, name, material, smooth=True)

def tube(points, radii, material, seg=10, name='tube', cap=True):
    """A bent tube through `points` with a radius at each point."""
    bm = bmesh.new()
    rings = []
    n = len(points)
    for i, p in enumerate(points):
        p = Vector(p)
        a = Vector(points[max(0, i - 1)])
        b = Vector(points[min(n - 1, i + 1)])
        t = (b - a).normalized()
        up = Vector((0, 0, 1)) if abs(t.z) < 0.95 else Vector((1, 0, 0))
        u = t.cross(up).normalized()
        v = t.cross(u).normalized()
        ring = [bm.verts.new(p + (u * math.cos(k * math.tau / seg) + v * math.sin(k * math.tau / seg)) * radii[i]) for k in range(seg)]
        rings.append(ring)
    for i in range(n - 1):
        for k in range(seg):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % seg], rings[i + 1][(k + 1) % seg], rings[i + 1][k]))
    if cap:
        bm.faces.new(rings[0][::-1])
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return finish(bm, name, material, smooth=True)

def point_light(loc, color, watts, radius=0.15):
    d = bpy.data.lights.new('pl', 'POINT')
    d.color = srgb(color)[:3]
    d.energy = watts
    d.shadow_soft_size = radius
    ob = bpy.data.objects.new('pl', d)
    ob.location = loc
    col.objects.link(ob)
    return ob

def setup_cycles(samples, view='Standard'):
    scene.render.engine = 'CYCLES'
    cy = scene.cycles
    cy.device = 'CPU'
    cy.samples = samples
    cy.use_adaptive_sampling = False
    cy.use_denoising = True
    cy.max_bounces = 6
    cy.diffuse_bounces = 4
    cy.sample_clamp_indirect = 8
    cy.caustics_reflective = False
    cy.caustics_refractive = False
    scene.view_settings.view_transform = view

def bake_export(out, prefix, sizes, samples, classify):
    """classify(object) -> group name, or None to keep the object for lighting
    only (it is not exported). sizes: {group: texture size}."""
    os.makedirs(out, exist_ok=True)
    setup_cycles(samples)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    groups = {k: [] for k in sizes}
    for ob in list(col.objects):
        if ob.type != 'MESH':
            continue
        gname = classify(ob)
        if gname:
            groups[gname].append(ob)
    merged = {}
    for gname, obs in groups.items():
        bm = bmesh.new()
        mats = []
        planar = all(o.get('planar_uv') for o in obs) and len(obs) > 0
        for ob in obs:
            me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
            me.transform(ob.matrix_world)
            slots = list(ob.data.materials) or [mat('#ffffff')]
            remap = []
            for m_ in slots:
                if m_ not in mats:
                    mats.append(m_)
                remap.append(mats.index(m_))
            n0 = len(bm.faces)
            bm.from_mesh(me)
            bm.faces.ensure_lookup_table()
            for f in bm.faces[n0:]:
                f.material_index = remap[min(f.material_index, len(remap) - 1)]
            bpy.data.meshes.remove(me)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        me = bpy.data.meshes.new(prefix + '_' + gname)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(prefix + '_' + gname, me)
        for m_ in mats:
            me.materials.append(m_)
        ob['planar'] = 1 if planar else 0
        merged[gname] = ob
        print('GROUP', gname, 'objects', len(obs), 'triangles', len(me.polygons), 'materials', len(mats))
    for obs in groups.values():
        for ob in obs:
            bpy.data.objects.remove(ob)
    for ob in merged.values():
        col.objects.link(ob)

    for gname, ob in merged.items():
        me = ob.data
        if ob['planar']:
            xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]
            x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
            uv = me.uv_layers.new(name='UVMap')
            for loop in me.loops:
                co = me.vertices[loop.vertex_index].co
                uv.data[loop.index].uv = ((co.x - x0) / (x1 - x0) * 0.998 + 0.001, (co.y - y0) / (y1 - y0) * 0.998 + 0.001)
            continue
        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(50), island_margin=0.0, area_weight=0.0)
        bpy.ops.uv.pack_islands(margin=0.0015)
        bpy.ops.object.mode_set(mode='OBJECT')
    print('UNWRAPPED')

    for gname, ob in merged.items():
        size = sizes[gname]
        img = bpy.data.images.new('bake_' + gname, size, size, alpha=False)
        for m_ in ob.data.materials:
            nt = m_.node_tree
            node = nt.nodes.get('BAKE_TARGET') or nt.nodes.new('ShaderNodeTexImage')
            node.name = 'BAKE_TARGET'
            node.image = img
            for n_ in nt.nodes:
                n_.select = False
            node.select = True
            nt.nodes.active = node
        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.bake(type='COMBINED', margin=6, use_clear=True)
        img.filepath_raw = os.path.join(out, f'{prefix}_{gname}.png')
        img.file_format = 'PNG'
        img.save()
        print('BAKED', gname)

    for ob in list(col.objects):
        if ob.type == 'MESH' and ob not in merged.values():
            bpy.data.objects.remove(ob)
    for ob in merged.values():
        ob.data.materials.clear()
    bpy.ops.object.select_all(action='DESELECT')
    for ob in merged.values():
        ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, prefix + '.glb'), export_format='GLB', use_selection=True,
                              export_materials='NONE', export_normals=False, export_apply=False, export_yup=True)
    print('RENDERED', out)
