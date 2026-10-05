"""Original toy fire dragon with articulated legs and scalloped wings."""
import bpy,os,sys,math
from mathutils import Vector
sys.path.insert(0,os.path.dirname(__file__))
from style import reset_scene,mat,sphere,cyl,join,export_glb,studio,game_camera,render,triangles
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../../..'));reset_scene()
red=mat('Dragon scales','#E94F35');shade=mat('Dragon ridge','#B52F3B');cream=mat('Dragon belly','#FFD982');gold=mat('Dragon horns','#FFB933');black=mat('Dragon pupils','#272840');white=mat('Dragon eyes','#FFF6DB');membrane=mat('Dragon membranes','#FF9673')
root=bpy.data.objects.new('dragon',None);bpy.context.scene.collection.objects.link(root);parts=[]
def finish(role,pieces,pivot):
    o=join(pieces,'dragon_'+role);bpy.context.scene.cursor.location=pivot;bpy.ops.object.origin_set(type='ORIGIN_CURSOR');o.parent=root;parts.append(o)
def cone(name,pos,r,h,material,angle=(0,0,0)):
    bpy.ops.mesh.primitive_cone_add(vertices=7,radius1=r,radius2=.01,depth=h,location=pos);o=bpy.context.object;o.name=name;o.data.materials.append(material);o.rotation_euler=angle;return o
body=[sphere('torso',1,(0,.1,.95),red,segs=12,rings=7,scale=(.56,.83,.63)),sphere('breast',1,(0,-.53,1),cream,segs=10,rings=5,scale=(.37,.14,.48))]
# Tapering tail curls behind the body; ridged silhouette remains clear from above.
for i in range(5):
    body.append(sphere('tail',1,(.08*i,.67+i*.25,.75-i*.1),red,segs=8,rings=4,scale=(.26-i*.035,.29,.23-i*.027)))
for i in range(4):body.append(cone('dorsal fin',(0,.25+i*.24,1.55-i*.14),.12,.3,gold))
# Expressive brow, protruding muzzle, nostrils, horns and small fangs.
body += [sphere('neck',.4,(0,-.55,1.4),red,segs=10,rings=5),sphere('head',1,(0,-.77,1.74),red,segs=12,rings=6,scale=(.43,.42,.35)),sphere('muzzle',1,(0,-1.08,1.6),red,segs=10,rings=5,scale=(.38,.3,.19)),sphere('lower jaw',1,(0,-1.06,1.48),cream,segs=8,rings=4,scale=(.31,.24,.065))]
for side in [-1,1]:
    body += [cone('horn',(side*.3,-.6,2.08),.095,.4,gold,(0,side*.28,0)),sphere('eye',1,(side*.35,-.96,1.8),white,segs=8,rings=4,scale=(.095,.12,.11)),sphere('pupil',.052,(side*.39,-1.025,1.8),black,segs=8,rings=4),sphere('nostril',.035,(side*.16,-1.32,1.68),shade,segs=6,rings=3),cone('fang',(side*.24,-1.17,1.47),.035,.14,white,(math.pi,0,0))]
finish('body',body,(0,0,0))
for role,x,y in [('leg_fl',-.42,-.42),('leg_fr',.42,-.42),('leg_bl',-.42,.54),('leg_br',.42,.54)]:
    pieces=[sphere('thigh',1,(x,y,.62),red,segs=8,rings=4,scale=(.2,.22,.3)),sphere('paw',1,(x,y-.08,.17),red,segs=8,rings=4,scale=(.22,.28,.15))]
    for dx in [-.11,0,.11]:pieces.append(cone('claw',(x+dx,y-.29,.13),.045,.15,cream,(math.pi/2,0,0)))
    finish(role,pieces,(x,y,.72))
for side,role in [(-1,'wing_l'),(1,'wing_r')]:
    pivot=(side*.4,.05,1.3);verts=[pivot,(side*.85,.13,2.0),(side*1.65,.08,1.94),(side*1.36,.25,1.62),(side*1.58,.62,1.5),(side*1.0,.46,1.35),(side*.92,.9,1.18)]
    faces=[(0,1,2),(0,2,3),(0,3,4),(0,4,5),(0,5,6)]
    mesh=bpy.data.meshes.new('scalloped wing');mesh.from_pydata(verts,[],faces);o=bpy.data.objects.new('membrane',mesh);bpy.context.scene.collection.objects.link(o);mesh.materials.append(membrane);mod=o.modifiers.new('wing thickness','SOLIDIFY');mod.thickness=.025;pieces=[o]
    for end in [verts[1],verts[2],verts[4],verts[6]]:
        start=Vector(pivot);end=Vector(end);delta=end-start;rib=cyl('wing rib',.035,delta.length,(start+end)/2,shade,verts=6,bev=0);rib.rotation_euler=delta.to_track_quat('Z','Y').to_euler();pieces.append(rib)
    finish(role,pieces,pivot)
assert sum(triangles(o) for o in parts)<=5000
export_glb([root]+parts,os.path.join(ROOT,'public/assets/models/dragon.glb'))
if '--render' in sys.argv:
    studio(size=(1100,850));game_camera(target=(0,0,1),ortho_scale=5);render(os.path.join(ROOT,'art/previews/kit/dragon.png'))
