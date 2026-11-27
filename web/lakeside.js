import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Water } from 'three/addons/objects/Water.js';

const motion = matchMedia('(prefers-reduced-motion: reduce)');

function makeRippleNormals() {
  const size = 128;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = 2 * Math.PI * x / size, v = 2 * Math.PI * y / size;
      const phase = .8 * Math.sin(u * 2 + v);
      const nx = .13 * Math.cos(3*u + 9*v + phase) + .08 * Math.cos(7*u - 12*v);
      const ny = .22 * Math.cos(2*u + 7*v + phase) + .1 * Math.cos(5*u + 16*v);
      const i = (y * size + x) * 4;
      pixels.set([128 + 127*nx, 128 + 127*ny, 128 + 127*Math.sqrt(1-nx*nx-ny*ny), 255], i);
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = texture.needsUpdate = true;
  return texture;
}

function addBreeze(material, clock, canopy) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.breezeTime = clock;
    shader.vertexShader = 'uniform float breezeTime;\n' + shader.vertexShader;
    const bend = canopy ? '.033 * smoothstep(2.,8.,position.y)' : '.061 * pow(max(0.,position.y), 1.5)';
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 root = instanceMatrix[3].xyz;
        float wave = sin(.74*breezeTime + root.x*.31 + root.z*.19 + position.z*.35);
        float flutter = .36*sin(1.69*breezeTime + root.x*.65 + position.x*2.3);
        transformed.x += (${bend})*(wave+flutter);
        transformed.z += (${bend})*.4*cos(.89*breezeTime+root.z*.25);
      #endif
    `);
  };
  material.customProgramCacheKey = () => canopy ? 'crown-wind' : 'meadow-wind';
}

export async function openLake({canvas, getProgress, onReady = () => {}}) {
  const compact = matchMedia('(max-width: 760px), (pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({canvas, antialias: !compact, powerPreference: 'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio, compact ? 1.15 : 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xb5c6ba);
  scene.fog = new THREE.FogExp2(0xb2c6b9, .0049);
  const skyLight = new THREE.HemisphereLight(0xf3f1d8, 0x78866b, 1.32);
  const sun = new THREE.DirectionalLight(0xffedce, 2.05);
  sun.position.set(27,38,-19);
  sun.target.position.set(-6,0,-5);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(compact ? 512 : 1024);
  Object.assign(sun.shadow.camera,{left:-42,right:42,top:43,bottom:-43,near:1,far:110});
  sun.shadow.normalBias = .025;
  sun.shadow.bias = -.00025;
  scene.add(sun,sun.target,skyLight);

  const gltf = await new GLTFLoader().loadAsync('/lakeside/ruleline-woodland.glb');
  scene.add(gltf.scene);
  const camera = gltf.cameras[0];
  const cameraRig = new THREE.Group();
  camera.parent.add(cameraRig);
  cameraRig.add(camera);
  const pointer = new THREE.Vector2();
  function lookAround(event) {
    if (event.pointerType === 'mouse' && !motion.matches) {
      pointer.set(2*event.clientX/innerWidth-1, 1-2*event.clientY/innerHeight);
    }
  }
  function centerView() { pointer.set(0,0); }
  const path = new THREE.AnimationMixer(gltf.scene);
  const shot = path.clipAction(gltf.animations[0]).play();
  shot.paused = true;
  const clock = {value:0};
  gltf.scene.traverse(object => {
    if (!object.isMesh) return;
    const material = object.material;
    const name = material.name;
    if (name === 'Morning atmosphere') {
      material.fog = false;
      material.toneMapped = false;
    } else {
      object.castShadow = /Hornbeam|Bracken|Lichen/.test(name);
      object.receiveShadow = !/Distant spruce/.test(name);
      if (material.map) material.map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      if (/Hornbeam leaves|Sedge|Bracken/.test(name)) {
        material.emissiveMap = material.map;
        material.emissive.setRGB(.10,.13,.075);
        addBreeze(material,clock,name==='Hornbeam leaves');
      }
      if (/Hornbeam bark|Lichen schist|Moss and leaf litter/.test(name)) {
        material.bumpMap = material.map;
        material.bumpScale = name === 'Lichen schist' ? .055 : .032;
      }
    }
  });
  const lake = gltf.scene.getObjectByName('Lake');
  const water = new Water(lake.geometry.clone().rotateX(Math.PI/2),{
    textureWidth:compact?256:512, textureHeight:compact?256:512,
    waterNormals:makeRippleNormals(), sunDirection:sun.position.clone().sub(sun.target.position).normalize(),
    sunColor:0xfff2cf, waterColor:0x22594e, distortionScale:.68, fog:true
  });
  water.rotation.x = -Math.PI/2;
  water.material.uniforms.size.value = 7.5;
  water.material.fragmentShader = water.material.fragmentShader.replace(
    'vec3 outgoingLight = albedo;',
    `float fresnel = .25 + .68 * pow(1.0 - theta, 3.0);
     vec3 depthTint = waterColor * (.72 + .24 * max(0.,surfaceNormal.y));
     vec3 outgoingLight = mix(depthTint, reflectionSample, fresnel)
                        + specularLight * .09;`
  );
  lake.visible = false;
  scene.add(water);
  renderer.shadowMap.needsUpdate = true;
  const updateReflection = water.onBeforeRender;
  let reflectionDue = true;
  water.onBeforeRender = function(...args) {
    if (reflectionDue) updateReflection.apply(this,args);
  };

  let target=0, progress=0, previous=0, elapsed=0, frame=0, resized=true;
  function viewport() {
    const width = window.innerWidth, height = window.innerHeight;
    renderer.setSize(width,height,false);
    camera.aspect = width / height;
    camera.fov = camera.aspect < .9 ? 64 : 51;
    camera.updateProjectionMatrix();
    target = THREE.MathUtils.clamp(getProgress(),0,1);
    resized = true;
  }
  viewport();
  progress = target;
  addEventListener('resize',viewport);
  window.addEventListener('pointermove',lookAround,{passive:true});
  window.addEventListener('blur',centerView);
  document.addEventListener('pointerleave',centerView);
  function render(now) {
    const dt = Math.min(.10,(now-previous)/1000);
    if (previous && !resized && now-previous < (compact? 31: 15)) return;
    previous = now;
    // Hash navigation can reposition the section without another scroll event.
    target = THREE.MathUtils.clamp(getProgress(),0,1);
    const last = progress;
    progress = motion.matches ? target : THREE.MathUtils.damp(progress,target,6.8,dt);
    if (Math.abs(progress-target)<.00002) progress=target;
    if (motion.matches && !resized && last===progress && frame>0) return;
    // Direct clip sampling also preserves the final key at progress = 1.
    shot.time = progress*shot.getClip().duration;
    path.update(0);
    if (!motion.matches) {
      elapsed+=dt;
      cameraRig.position.x = THREE.MathUtils.damp(cameraRig.position.x,.14*Math.sin(.31*elapsed)+.18*pointer.x,3,dt);
      cameraRig.position.y = THREE.MathUtils.damp(cameraRig.position.y,.045*Math.sin(.42*elapsed)+.055*pointer.y,3,dt);
      cameraRig.position.z = .09*Math.sin(.24*elapsed);
    } else {
      cameraRig.position.set(0,0,0);
    }
    clock.value=elapsed;
    water.material.uniforms.time.value=.18*elapsed;
    reflectionDue = resized || frame % (compact ? 4 : 3) === 0 || motion.matches;
    renderer.render(scene,camera);
    if (!frame) { canvas.dataset.ready='true'; onReady(); }
    canvas.dataset.progress=progress.toFixed(4);
    frame++;resized=false;
  }
  let inView = true;
  const onVisibility=()=>{
    previous=0; resized=true;
    renderer.setAnimationLoop(document.hidden || !inView ? null : render);
  };
  const observer = new IntersectionObserver(([entry])=>{
    inView = entry.isIntersecting;
    onVisibility();
  });
  observer.observe(canvas);
  onVisibility();
  const onMotion=()=>{resized=true;};
  document.addEventListener('visibilitychange',onVisibility);
  motion.addEventListener('change',onMotion);
  return ()=>{
    observer.disconnect();
    renderer.setAnimationLoop(null);
    removeEventListener('resize',viewport);
    window.removeEventListener('pointermove',lookAround); window.removeEventListener('blur',centerView);
    document.removeEventListener('pointerleave',centerView);
    document.removeEventListener('visibilitychange',onVisibility); motion.removeEventListener('change',onMotion);
    gltf.scene.traverse(object=>{if(object.isMesh){object.geometry?.dispose(); (Array.isArray(object.material)?object.material:[object.material]).forEach(material=>{material?.map?.dispose();material?.dispose();});}});
    water.geometry.dispose(); water.material.uniforms.normalSampler.value?.dispose(); water.material.dispose(); renderer.dispose();
  };
}
