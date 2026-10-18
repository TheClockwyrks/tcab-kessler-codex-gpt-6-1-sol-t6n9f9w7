"""One-time asset production. Not part of installation or the build."""
import json, math, subprocess, pathlib, random, wave, array
ROOT=pathlib.Path(__file__).resolve().parent.parent
WORK=ROOT/'tools'/'recipes'; WORK.mkdir(exist_ok=True)
def run(*args):
 p=subprocess.run([str(a) for a in args],capture_output=True,text=True)
 if p.returncode: raise RuntimeError(p.stderr+p.stdout)
def image(name,size,fn,sheet=False):
 ops=[]
 for y in range(size):
  for x in range(size):
   c=fn(x+.5,y+.5)
   if c: ops.append(dict(op='set_pixel',x=x,y=y,color='#'+''.join(f'{max(0,min(255,int(v))):02x}' for v in c)))
 path=WORK/(name.replace('/','-')+'.json'); path.write_text(json.dumps(ops))
 run('draw-sheet' if sheet else 'draw','render','--actions',path,'--out',ROOT/'assets/sprites'/f'{name}.png','--width',size,'--height',size,'--no-layers')
def planet(x,y):
 dx=(x-80)/70; dy=(y-80)/70; r=math.hypot(dx,dy)
 if r>1:
  a=math.exp(-(r-1)*30)*90
  return (92,200,215,a) if r<1.12 else None
 z=math.sqrt(1-r*r); light=max(0,(-dx*.6-dy*.45+z*.7));
 land=math.sin(dx*13+math.sin(dy*19)*1.5)+math.sin(dy*24+dx*7)+.5*math.sin(dx*43-dy*30)
 base=(135,142,104) if land>.6 else (35,88,110)
 cloud=max(0,math.sin(dy*32+dx*13+math.sin(dx*12)*2)-.55)*.4
 return tuple((v*(.16+.84*light)+cloud*130) for v in base)+(255,)
image('planet',160,planet)
colors=[(100,242,221),(255,108,107),(185,170,255),(108,198,255),(255,212,123)]
for i,kind in enumerate(['widen','narrow','multiball','shield','pierce']):
 def pod(x,y,i=i):
  dx=x-12;dy=y-12;r=math.hypot(dx,dy); c=colors[i]
  shell= abs(dx)+abs(dy)<11 and abs(dx)+abs(dy)>8
  mark=(i==0 and (abs(dy)<1.3 and abs(dx)<6 or abs(abs(dx)-5)<1 and abs(dy)<3)) or (i==1 and abs(dy)<1.3 and abs(dx)<5) or (i==2 and min(math.hypot(dx-a,dy-b) for a,b in [(-4,2),(4,2),(0,-4)])<2.4) or (i==3 and abs(r-5)<1.2 and dy<3) or (i==4 and abs(dx+dy*.5)<1.5 and abs(dy)<6)
  if shell or mark:return (*c,255)
  if abs(dx)+abs(dy)<10:return (15,30,46,240)
  return None
 image('pods/'+kind,24,pod)
for f in range(6):
 def ball(x,y,f=f):
  dx=x-12;dy=y-12;r=math.hypot(dx,dy)
  if r>11:return None
  if r>8:return (110,225,255,(11-r)*30)
  z=math.sqrt(max(0,1-r*r/64));l=max(.15,(-dx/8*.4-dy/8*.5+z*.8))
  stripe=abs(math.sin(math.atan2(dy,dx)+f*math.pi/3)*r)<1.3
  c=(255,208,130) if stripe else (161,222,240)
  return tuple(v*l for v in c)+(255,)
 image('ball/'+str(f),24,ball,True)
# CLI-authored particle systems.
for name,count,speed,life,color in [('burst',42,85,650,'#ffd493'),('spark',18,65,300,'#9bffff'),('burnup',32,45,800,'#ff9c64')]:
 cfg=WORK/(name+'-config.json'); log=WORK/(name+'-ops.json')
 cfg.write_text(json.dumps(dict(width=160,height=160,duration_ms=1000,fps=30,seed=17,actions=str(log),preview=str(WORK/(name+'.gif')),system=str(ROOT/'assets/particles'/f'{name}.json'))))
 run('particle-2d','--config',cfg,'init')
 run('particle-2d','--config',cfg,'add-emitter','--name','shards','--shape','point','--x',0,'--y',0,'--burst',count,'--lifetime',life,'--lifetime-spread',100,'--speed',speed,'--speed-spread',25,'--cone-angle',180)
 run('particle-2d','--config',cfg,'set-particle','--emitter','shards','--size-from',4,'--size-to',0,'--opacity-from',1,'--opacity-to',0,'--color-gradient',color+'@0,#356b91@1','--stretch',.03)
 run('particle-2d','--config',cfg,'render','--frame',8,'--out',WORK/(name+'.png'))
# Distinct glass/metal synth cues.
names=['paddle-bounce','field-bounce','target-hit','target-break','shield-reflect','pod-catch','pod-catch-narrow','pod-burn','ball-lost','wave-clear','game-over','menu-move','menu-select']
for i,name in enumerate(names):
 dur=[150,210,120,420,330,280,300,430,650,900,1800,55,100][i];freq=[620,410,880,210,740,1040,290,160,120,660,65,1320,1760][i]
 cfg=WORK/(name+'-config.json');cfg.write_text(json.dumps(dict(sample_rate=22050,channels='mono',max_duration_ms=dur+250,seed=37,actions=str(WORK/(name+'-ops.json')),preview=str(WORK/(name+'.png')),wav=str(ROOT/'assets/audio'/f'{name}.wav'))))
 run('sfx-synth','--config',cfg,'init')
 run('sfx-synth','--config',cfg,'add-voice','--name','glass','--wave','sine','--freq',freq,'--dur',dur,'--gain',-13)
 run('sfx-synth','--config',cfg,'set-envelope','--voice','glass','--env','pluck')
 run('sfx-synth','--config',cfg,'set-pitch','--voice','glass','--slide-to',freq*(.35 if i in [3,6,7,8,10] else 1.5),'--over',dur)
 run('sfx-synth','--config',cfg,'add-voice','--name','harmonic','--wave','triangle','--freq',freq*2.01,'--dur',dur*.65,'--gain',-24)
 run('sfx-synth','--config',cfg,'set-envelope','--voice','harmonic','--env','pluck')
 run('sfx-synth','--config',cfg,'render')
for name in ['title','play']:
 cfg=WORK/('music-'+name+'-config.json');cfg.write_text(json.dumps(dict(sample_rate=22050,channels='mono',max_duration_ms=16000,seed=82,actions=str(WORK/('music-'+name+'-ops.json')),preview=str(WORK/('music-'+name+'.png')),wav=str(ROOT/'assets/audio'/f'music-{name}.wav'),midi=str(WORK/('music-'+name+'.mid')))))
 run('music','--config',cfg,'init');run('music','--config',cfg,'set-tempo','--bpm',120)
 for track,inst in [('bass','sine'),('glass','triangle')]:run('music','--config',cfg,'define-track','--name',track,'--instrument',inst)
 for j in range(32):
  run('music','--config',cfg,'add-note','--track','bass','--pitch',[38,38,41,36][j//8],'--t',j,'--dur',.9,'--velocity',38)
 for j in range(64):
  run('music','--config',cfg,'add-note','--track','glass','--pitch',([62,69,74,65,69,77,72,69] if name=='title' else [62,65,69,74,77,74,69,65])[j%8],'--t',j*.5,'--dur',.42,'--velocity',28 if name=='title' else 36)
 run('music','--config',cfg,'render')
 # Circular 100ms crossfade preserves ongoing material across the loop.
 p=ROOT/'assets/audio'/f'music-{name}.wav'
 with wave.open(str(p),'rb') as w: params=w.getparams(); data=array.array('h',w.readframes(w.getnframes()))
 n=int(params.framerate*.1)*params.nchannels
 tail=data[-n:];data=data[:-n]
 for j in range(n):data[j]=int(tail[j]*(1-j/n)+data[j]*j/n)
 data=array.array('h',(int(v*.075) for v in data))
 with wave.open(str(p),'wb') as w:w.setparams(params);w.writeframes(data.tobytes())
