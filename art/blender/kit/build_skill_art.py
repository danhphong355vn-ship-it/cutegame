"""Original stylized skill sculpture kit; Blender -b --python this_file -- --render."""
import os,sys,math,random,bpy
sys.path.insert(0,os.path.dirname(__file__))
from style import reset_scene,mat,sphere,cyl,join,export_glb,studio,game_camera,render
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../../..'))
reset_scene()
stone=mat('Basalt','#646B87');ridge=mat('Rock faces','#A4AEC4');pink=mat('Rose petals','#FF5D9D');pale=mat('Petal tips','#FFD1E9');gold=mat('Pollen','#FFCE45');green=mat('Jade leaves','#38AA70');vein=mat('Leaf vein','#B6F18D');wing=mat('Wing membrane','#ACD8FF');edge=mat('Wing filigree','#9471DA');bark=mat('Living wood','#85533D')
models=[]
def tube(name,points,r,material):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=r;c.bevel_resolution=1;c.resolution_u=3
    sp=c.splines.new('POLY');sp.points.add(len(points)-1)
    for p,co in zip(sp.points,points):p.co=(*co,1)
    o=bpy.data.objects.new(name,c);bpy.context.scene.collection.objects.link(o);o.data.materials.append(material);bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');return bpy.context.object
# Uneven, fractured ridges with a broad broken base rather than perfect cones.
rng=random.Random(12);pieces=[]
for x,y,r,h in [(0,0,.83,2.3),(-.6,.18,.6,1.55),(.6,.23,.62,1.8),(0,-.53,.52,1.1)]:
    verts=[]
    for layer,(z,rad) in enumerate([(0,r),(.3*h,r*.95),(.73*h,r*.46),(h,r*.08)]):
        for j in range(7):
            a=j*math.tau/7;rr=rad*rng.uniform(.78,1.17);verts.append((x+rr*math.cos(a)+layer*.055,y+rr*math.sin(a),z+rng.uniform(-.06,.06)))
    faces=[]
    for l in range(3):
        for j in range(7):faces.append((l*7+j,l*7+(j+1)%7,(l+1)*7+(j+1)%7,(l+1)*7+j))
    faces += [tuple(reversed(range(7))),tuple(range(21,28))]
    mesh=bpy.data.meshes.new('fracture');mesh.from_pydata(verts,[],faces);o=bpy.data.objects.new('ridge',mesh);bpy.context.scene.collection.objects.link(o);mesh.materials.append(stone);mesh.materials.append(ridge)
    for i,p in enumerate(mesh.polygons):p.material_index=int(i%7 in [1,2])
    pieces.append(o)
models.append(join(pieces,'skill_mountain'))
def blossom(x,y,z,scale=1):
    out=[]
    for ring in range(2):
        for i in range(6):
            a=(i+ring*.5)*math.tau/6;r=(.23 if ring==0 else .13)*scale
            o=sphere('cupped petal',1,(x+r*math.cos(a),y+r*math.sin(a),z+ring*.06*scale),pink if ring==0 else pale,segs=10,rings=5,scale=(.23*scale,.115*scale,.065*scale));o.rotation_euler=(.2*math.sin(a),-.2*math.cos(a),a);out.append(o)
    out.append(sphere('gold heart',.095*scale,(x,y,z+.08*scale),gold,segs=10,rings=5))
    return out
pieces=[tube('curved stem',[(0,0,0),(.04,0,.25),(0,0,.55)],.035,green)]+blossom(0,0,.57)
for side in [-1,1]:pieces.append(sphere('pointed leaf',1,(side*.12,0,.25),green,segs=8,rings=4,scale=(.17,.07,.035)))
models.append(join(pieces,'skill_flower'))
points=[(.34*math.cos(i*.22),.34*math.sin(i*.22),i*.045) for i in range(36)]
pieces=[tube('spiral vine',points,.055,green)]
for i in [6,13,21,29]:
    x,y,z=points[i];a=i*.22;o=sphere('vine leaf',1,(x*1.4,y*1.4,z),green,segs=8,rings=4,scale=(.19,.065,.03));o.rotation_euler.z=a;pieces.append(o)
models.append(join(pieces,'skill_roots'))
pieces=[tube('curving trunk',[(0,0,0),(-.1,0,.55),(.12,0,1.1),(0,0,1.6)],.1,bark)]
for i in range(5):
    a=i*math.tau/5;x=.48*math.cos(a);y=.48*math.sin(a);z=1.22+(i%2)*.25
    pieces.append(tube('branch',[(0,0,.7),(x*.6,y*.6,1.15),(x,y,z)],.045,bark));pieces+=blossom(x,y,z,.8)
    o=sphere('branch leaf',1,(x*.8,y*.8,z-.1),green,segs=8,rings=4,scale=(.3,.13,.08));o.rotation_euler.z=a;pieces.append(o)
models.append(join(pieces,'skill_tree'))
# Leaf-shaped lobes with explicit contrasting ribs and a tapered tip.
pieces=[]
for z,size in [(.22,1),(-.2,.65)]:
    points=[(0,0,z),(.3*size,0,z+.28*size),(.86*size,0,z+.33*size),(1.02*size,0,z+.08*size),(.63*size,0,z-.17*size),(.18*size,0,z-.1*size)]
    mesh=bpy.data.meshes.new('wing leaf');mesh.from_pydata(points,[],[(0,1,2,3),(0,3,4,5)]);o=bpy.data.objects.new('membrane',mesh);bpy.context.scene.collection.objects.link(o);mesh.materials.append(wing);mod=o.modifiers.new('two sided membrane','SOLIDIFY');mod.thickness=.014;pieces.append(o)
    pieces.append(tube('wing border',points+[points[0]],.015,edge));pieces.append(tube('wing rib',[points[0],(.5*size,-.012,z+.08*size),points[3]],.012,edge))
models.append(join(pieces,'skill_wing'))
export_glb(models,os.path.join(ROOT,'public/assets/models/skill-art.glb'))
if '--render' in sys.argv:
    for i,o in enumerate(models):o.location.x=(i-2)*2.4
    studio(size=(1400,700));game_camera(target=(0,0,.8),ortho_scale=12);render(os.path.join(ROOT,'art/previews/kit/skill-art.png'))

