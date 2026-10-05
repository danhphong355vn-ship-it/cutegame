"""Original low-poly skill props. Run Blender -b --python this_file (optional --render)."""
import os
import sys
import math
import bpy
sys.path.insert(0, os.path.dirname(__file__))
from style import reset_scene, mat, sphere, cyl, join, export_glb, studio, game_camera, render

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..'))
reset_scene()
stone = mat('Skill stone', '#827B91')
light = mat('Skill ridge', '#C4BCD2')
pink = mat('Skill petals', '#FF82BB')
gold = mat('Skill pollen', '#FFD668')
green = mat('Skill leaves', '#55B965')
wing = mat('Fairy wing', '#BBEDFF', emit='#A3DDFF', emit_strength=.2)
models = []

pieces = []
for i, (x,y,z,r,h) in enumerate([(0,0,0,1.05,2.5),(-.65,.15,0,.63,1.6),(.6,.1,0,.64,1.9),(0,.65,0,.65,1.4)]):
    bpy.ops.mesh.primitive_cone_add(vertices=7, radius1=r, radius2=.04, depth=h, location=(x,y,z+h/2))
    obj = bpy.context.object
    obj.data.materials.append(stone)
    obj.data.materials.append(light)
    for face in obj.data.polygons:
        face.material_index = 1 if face.center.x > 0 and face.normal.z > .1 else 0
    pieces.append(obj)
models.append(join(pieces, 'skill_mountain'))

pieces = [cyl('stem', .055, .52, (0,0,.26), green, verts=6, bev=0)]
for i in range(5):
    a = i*math.tau/5
    petal = sphere('petal', .2, (.19*math.cos(a),.19*math.sin(a),.57), pink, segs=8, rings=4, scale=(1.2,.8,.35))
    petal.rotation_euler.z = a
    pieces.append(petal)
pieces.append(sphere('pollen', .12, (0,0,.6), gold, segs=8, rings=4))
models.append(join(pieces, 'skill_flower'))

pieces = []
curve=bpy.data.curves.new('Binding vine','CURVE')
curve.dimensions='3D'
curve.bevel_depth=.085
curve.bevel_resolution=1
spline=curve.splines.new('POLY')
spline.points.add(23)
for i,p in enumerate(spline.points):
    a=i*.32
    p.co=(.35*math.cos(a),.35*math.sin(a),i*.065,1)
vine=bpy.data.objects.new('Binding vine',curve)
bpy.context.collection.objects.link(vine)
vine.data.materials.append(green)
bpy.context.view_layer.objects.active=vine
vine.select_set(True)
bpy.ops.object.convert(target='MESH')
pieces.append(bpy.context.object)
for i in range(12):
    a=i*.65
    if i%3==0:
        pieces.append(sphere('leaf', .2, (.52*math.cos(a),.52*math.sin(a),i*.12), green,segs=6,rings=4,scale=(1,.35,.5)))
models.append(join(pieces, 'skill_roots'))

pieces=[cyl('Magic trunk',.16,1.35,(0,0,.675),green,verts=7,bev=0)]
for i in range(5):
    a=i*math.tau/5
    pieces.append(sphere('Leaf crown',.42,(.38*math.cos(a),.38*math.sin(a),1.3+i*.06),green,segs=8,rings=5,scale=(1,1,.6)))
    pieces.append(sphere('Magic blossom',.16,(.52*math.cos(a),.52*math.sin(a),1.4+i*.06),pink,segs=8,rings=4))
models.append(join(pieces,'skill_tree'))

pieces = []
for x,z,length in [(.42,.25,.65),(.3,-.2,.45)]:
    pieces.append(sphere('wing lobe',1,(x,0,z),wing,segs=10,rings=6,scale=(length,.035,.32)))
models.append(join(pieces, 'skill_wing'))

# Each kit root is at the origin. The runtime gives every instance its placement.
path=os.path.join(ROOT,'public/assets/models/skill-art.glb')
export_glb(models,path)
print('SKILL_ART_BYTES',os.path.getsize(path))
if '--render' in sys.argv:
    for i,obj in enumerate(models): obj.location.x=(i-1.5)*2.5
    studio(size=(1200,700))
    game_camera(target=(0,0,1),ortho_scale=12)
    render(os.path.join(ROOT,'art/previews/kit/skill-art.png'))
