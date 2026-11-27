import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const asset = name => '/tree/' + name;
const groundHeight = (x,z) => .075*Math.sin(.8*x+.3*z) + .09*Math.sin(.55*z-x*.24);

function windMaterial(material, clock) {
  material.onBeforeCompile = shader => {
    shader.uniforms.treeTime=clock;
    shader.vertexShader='uniform float treeTime;\n'+shader.vertexShader.replace('#include <begin_vertex>',`
      #include <begin_vertex>
      float exposure=smoothstep(3.,9.,position.y);
      float gust=sin(.85*treeTime+position.x*.71+position.z*.4);
      float flutter=sin(2.*treeTime+position.x*2.2+position.z*1.7);
      transformed.x+=exposure*(.058*gust+.016*flutter);
      transformed.y+=exposure*.018*cos(treeTime+position.x+position.z);
    `);
  };
}

function forestWall(texture) {
  const positions=[],uv=[],indices=[];
  for(let i=0;i<=48;i++){
    const t=i/48,angle=(t-.5)*2.8;
    for(const y of [-6,29]){
      positions.push(32*Math.sin(angle),y,-32*Math.cos(angle));
      uv.push(t,y===29?1:0);
    }
    if(i) {const n=i*2;indices.push(n-2,n,n-1,n-1,n,n+1);}
  }
  const geo=new THREE.BufferGeometry();
  geo.setIndex(indices);geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  return new THREE.Mesh(geo,new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,toneMapped:false,color:0xd6e3ce}));
}

function makeUnderstory(texture,count,fern,random) {
  const card=new THREE.PlaneGeometry(1,1,2,3);
  card.translate(0,.5,0);
  const pos=card.attributes.position;
  for(let i=0;i<pos.count;i++)pos.setZ(i,.15*pos.getY(i)**2+.12*Math.abs(pos.getX(i)));
  card.computeVertexNormals();
  const mat=new THREE.MeshLambertMaterial({map:texture,alphaTest:.38,side:THREE.DoubleSide,color:fern?0xb3c795:0xb5c696});
  const mesh=new THREE.InstancedMesh(card,mat,count*3), dummy=new THREE.Object3D();
  for(let i=0;i<count;i++){
    const x=(random()-.5)*35,z=random()*27-22;
    const scale=(fern?.67:.26)*(1+random()*1.25);
    for(let j=0;j<3;j++){
      dummy.position.set(x,groundHeight(x,z)-.045,z);
      dummy.rotation.set(.08,2.1*j+i*.48,0);
      dummy.scale.set(scale*(fern?1.5:1.15),scale,scale);
      dummy.updateMatrix();mesh.setMatrixAt(3*i+j,dummy.matrix);
    }
  }
  mesh.receiveShadow=true;return mesh;
}

function driftingLeaves() {
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute([-.11,0,0,-.043,.038,-.014,.041,.032,-.014,.12,.003,0,.042,-.029,-.004,-.049,-.031,-.006,0,.003,.016],3));
  geo.setIndex([0,1,6,1,2,6,2,3,6,3,4,6,4,5,6,5,0,6]);geo.computeVertexNormals();
  const mesh=new THREE.InstancedMesh(geo,new THREE.MeshLambertMaterial({side:THREE.DoubleSide,color:0xa3bf66}),18);
  mesh.frustumCulled=false; const dummy=new THREE.Object3D();
  return {mesh,update(t){
    for(let i=0;i<mesh.count;i++){
      const a=i*2.39996, u=(t*(.068+.005*(i%5))+i*.61803)%1;
      dummy.position.set(3.8*Math.cos(a)+u*1.7+.42*Math.sin(7*u+a),6.35+.9*Math.sin(a)-6.25*u,2.8*Math.sin(a)+.39*Math.cos(8*u+a));
      dummy.rotation.set(7*u+a,4*u+a,5*u+.8*Math.cos(12*u+a));
      dummy.scale.setScalar((.58+(i%4)*.13)*Math.min(1,10*u,(1-u)*10));
      dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate=true;
  }};
}

export async function openTree({canvas, getProgress, editor, centered=false, signal}) {
  const compact=matchMedia('(max-width:760px), (pointer:coarse)').matches;
  const reduced=matchMedia('(prefers-reduced-motion:reduce)');
  const textures=new THREE.TextureLoader();
  const [model,back,soil,fern,grass]=await Promise.all([
    new GLTFLoader().loadAsync(asset('ruleline-hornbeam.glb')),
    ...['forest.jpg','soil.jpg','fern.png','grass.png'].map(name=>textures.loadAsync(asset(name)))
  ]);
  if(signal.aborted)return;
  const renderer=new THREE.WebGLRenderer({canvas,antialias:!compact,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,compact?1.2:1.5));
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.13;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x7a8f71);scene.fog=new THREE.FogExp2(0x9daa87,.031);
  const camera=new THREE.PerspectiveCamera(48,1,.1,100);
  const clock={value:0};
  const sun=new THREE.DirectionalLight(0xffedbb,2.8);
  sun.position.set(7,11,3);sun.castShadow=true;sun.shadow.mapSize.setScalar(compact?1024:2048);
  Object.assign(sun.shadow.camera,{left:-9,right:9,top:10,bottom:-10,near:.5,far:35});
  sun.shadow.normalBias=.026;sun.shadow.bias=-.00035;
  scene.add(sun,new THREE.HemisphereLight(0xe5efd5,0x8d8c66,1.54));
  const rim=new THREE.DirectionalLight(0xe8f9ac,1.37);rim.position.set(2,7,-5);scene.add(rim);
  for(const texture of [back,soil,fern,grass])texture.colorSpace=THREE.SRGBColorSpace;
  scene.add(forestWall(back),model.scene);
  model.scene.traverse(obj=>{
    if(!obj.isMesh)return;
    const m=obj.material;
    obj.castShadow=obj.receiveShadow=true;
    m.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    if(m.name==='Living bark'){
      m.bumpMap=m.map;m.bumpScale=.105;m.roughness=.93;
    }else{
      m.emissive.setRGB(.19,.22,.075);m.emissiveMap=m.map;
      m.alphaTest=.36;m.alphaToCoverage=!compact;
      windMaterial(m,clock);
    }
  });
  soil.wrapS=soil.wrapT=THREE.MirroredRepeatWrapping;soil.repeat.set(22,20);
  soil.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  const floor=new THREE.PlaneGeometry(82,72,90,85);floor.rotateX(-Math.PI/2);
  const pos=floor.attributes.position,colors=[];
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),z=pos.getZ(i);pos.setY(i,groundHeight(x,z)-.02);
    const shade=(.68+.12*Math.sin(x*.64+Math.sin(z*1.2))+.09*Math.cos(z*1.21-x*.23))*(1-.51*Math.exp(-.22*(x*x+z*z)));
    colors.push(shade*.83,shade,shade*.80);
  }
  floor.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));floor.computeVertexNormals();
  const ground=new THREE.Mesh(floor,new THREE.MeshStandardMaterial({map:soil,bumpMap:soil,bumpScale:.026,roughness:1,vertexColors:true}));
  ground.receiveShadow=true;scene.add(ground);
  let seed=613;const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  scene.add(makeUnderstory(fern,130,true,random),makeUnderstory(grass,630,false,random));
  const falling=driftingLeaves();scene.add(falling.mesh);
  let progress=getProgress(),elapsed=0,previous=0,dirty=true,visible=true;
  const mouse=new THREE.Vector2(),follow=new THREE.Vector2();
  function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();dirty=true;}
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(canvas);resize();
  const clearPointer=()=>mouse.set(0,0);
  function point(e){if(e.pointerType==='mouse')mouse.set(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2);}
  function render(now){
    if(previous && !dirty && now-previous<(compact?30:15))return;
    const dt=previous?Math.min(.09,(now-previous)/1000):0;previous=now;
    const target=getProgress();
    if(reduced.matches&&!dirty&&Math.abs(progress-target)<.0001)return;
    progress=reduced.matches?target:THREE.MathUtils.damp(progress,target,5.5,dt);
    if(!reduced.matches)elapsed+=dt;
    follow.lerp(mouse,1-Math.exp(-4*dt));clock.value=elapsed;falling.update(elapsed);
    const portrait=camera.aspect<.90;
    const side=centered ? 0 : portrait ? (editor ? .04 : -.16) : (editor ? .235 : -.235);
    const yaw=-.11+progress*(editor?.22:.76)+(reduced.matches?0:.032*follow.x+.025*Math.sin(elapsed*.23));
    const dist=(portrait?13.8:10.5)-(editor?1.1:2.6)*progress;
    const targetY=(portrait?4.35:3.88)+.52*progress;
    camera.position.set(dist*Math.sin(yaw),1.81+progress*.7+(reduced.matches?0:.055*follow.y),dist*Math.cos(yaw));
    camera.lookAt(0,targetY,0);
    // Off-axis composition keeps the near tree clear of the website's text column.
    const w=canvas.width,h=canvas.height;
    camera.setViewOffset(w,h,side*w,portrait&&editor?-.14*h:0,w,h);
    renderer.render(scene,camera);dirty=false;canvas.dataset.ready='true';
    canvas.dataset.progress=progress.toFixed(3);
  }
  function activate(){previous=0;dirty=true;renderer.setAnimationLoop(visible&&!document.hidden?render:null);}
  const visibility=new IntersectionObserver(([e])=>{visible=e.isIntersecting;activate();});
  visibility.observe(canvas);renderer.shadowMap.needsUpdate=true;activate();
  document.addEventListener('visibilitychange',activate);reduced.addEventListener('change',activate);
  window.addEventListener('pointermove',point,{passive:true});window.addEventListener('blur',clearPointer);
  return ()=>{
    renderer.setAnimationLoop(null);resizeObserver.disconnect();visibility.disconnect();
    document.removeEventListener('visibilitychange',activate);reduced.removeEventListener('change',activate);
    window.removeEventListener('pointermove',point);window.removeEventListener('blur',clearPointer);
    const owned=new Set();
    scene.traverse(o=>{if(o.geometry)owned.add(o.geometry);if(o.material){owned.add(o.material);if(o.material.map)owned.add(o.material.map);}if(o.isInstancedMesh)o.dispose();});
    owned.forEach(item=>item.dispose());sun.shadow.dispose();renderer.dispose();renderer.forceContextLoss();
  };
}

