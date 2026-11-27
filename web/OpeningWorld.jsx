import React, {useEffect, useRef} from 'react';
import * as THREE from 'three';

// A lightweight procedural scene: all geometry stays local to the intro.
export default function OpeningWorld({leaving}) {
  const host = useRef(null);
  const leavingRef = useRef(leaving);
  useEffect(() => { leavingRef.current = leaving; }, [leaving]);

  useEffect(() => {
    const node = host.current;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let renderer;
    try { renderer = new THREE.WebGLRenderer({antialias:true, alpha:true, powerPreference:'high-performance'}); }
    catch { return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x173f35, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    node.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#4d8a70');
    scene.fog = new THREE.FogExp2('#6da48a', .032);
    const camera = new THREE.PerspectiveCamera(48, 1, .1, 90);
    const ambient = new THREE.HemisphereLight(0xdafee0, 0x183e22, 2.1);
    const sun = new THREE.DirectionalLight(0xf2ffd0, 2.2);
    sun.position.set(-5, 10, 8);
    scene.add(ambient, sun);

    const groundGeo = new THREE.SphereGeometry(28, 40, 20);
    const groundMat = new THREE.MeshStandardMaterial({color:0x285d3a, roughness:1});
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.scale.set(1, .12, 1); ground.position.set(0, -4.6, -7); scene.add(ground);
    const hillGeo = new THREE.ConeGeometry(1, 1, 5);
    const hillMat = new THREE.MeshStandardMaterial({color:0x376e53, roughness:1, flatShading:true});
    for (let i=0; i<18; i++) {
      const hill = new THREE.Mesh(hillGeo, hillMat);
      const size = 2.5 + (i%4)*.7;
      hill.position.set((i-9)*2.7, -1.5, -19-(i%3)*2); hill.scale.set(size*1.4,size*2,size); scene.add(hill);
    }

    // Flat, faceted leaves at many depths, with real lighting and shadows from colour variation.
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0,-.18,0,-.095,0,0,0,.24,.045, .095,0,0],3));
    geometry.setIndex([0,1,2,0,2,3]); geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({color:0xffffff, roughness:.75, metalness:.02, side:THREE.DoubleSide});
    const count = window.matchMedia('(max-width: 700px)').matches ? 4200 : 7200;
    const leaves = new THREE.InstancedMesh(geometry, material, count);
    const dummy = new THREE.Object3D(), color = new THREE.Color();
    const palette = ['#0a582d','#177334','#228943','#48ad4a','#85d65d','#c3ec8a'];
    // Seeded positions make the shape stable across renders.
    let seed=4371; const random=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646};
    for (let i=0;i<count;i++) {
      const a=random()*Math.PI*2, radius=Math.sqrt(random())*3.4;
      dummy.position.set(Math.cos(a)*radius, 1+Math.sin(a)*radius*.85, -2+(random()-.5)*3.2);
      dummy.rotation.set(random()*Math.PI,random()*Math.PI,random()*Math.PI);
      const scale=.55+random()*.95; dummy.scale.setScalar(scale); dummy.updateMatrix();
      leaves.setMatrixAt(i,dummy.matrix); color.set(palette[Math.floor(random()*palette.length)]); leaves.setColorAt(i,color);
    }
    leaves.instanceMatrix.needsUpdate = true; scene.add(leaves);

    const trunkGeo = new THREE.CylinderGeometry(.15,.28,4,7);
    const trunkMat = new THREE.MeshStandardMaterial({color:0x244c2b,roughness:1});
    const crownGeo = new THREE.IcosahedronGeometry(1,1);
    const crownMat = new THREE.MeshStandardMaterial({color:0x367c42,roughness:1,flatShading:true});
    for(let i=0;i<22;i++) {
      const x=(i%2?-1:1)*(5.5+(i%5)*1.1), z=-2-Math.floor(i/2)*1.65;
      const trunk=new THREE.Mesh(trunkGeo,trunkMat); trunk.position.set(x,-.1,z); scene.add(trunk);
      const crown=new THREE.Mesh(crownGeo,crownMat); crown.position.set(x,2,z); crown.scale.set(1.6,1.8,1.5); scene.add(crown);
    }
    let frame=0, start=performance.now(), exitStart=null;
    function resize(){const w=node.clientWidth||1,h=node.clientHeight||1;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}
    function draw(now){
      const t=(now-start)*.001;
      if(leavingRef.current && exitStart===null)exitStart=now;
      const progress=exitStart===null?0:Math.min(1,(now-exitStart)/1850);
      const eased=progress*progress*(3-2*progress);
      camera.position.set(reduced.matches?0:Math.sin(t*.22)*.32,1.15+(reduced.matches?0:Math.sin(t*.3)*.1),9-eased*15);
      camera.lookAt(0,1,-5);
      leaves.rotation.z=reduced.matches?0:Math.sin(t*.16)*.08;
      renderer.render(scene,camera);
      if(!reduced.matches&&!document.hidden)frame=requestAnimationFrame(draw);
    }
    function update(){cancelAnimationFrame(frame);resize();draw(performance.now())}
    const observer = new ResizeObserver(update); observer.observe(node);
    window.addEventListener('resize',update); document.addEventListener('visibilitychange',update); reduced.addEventListener('change',update);
    update();
    return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',update);document.removeEventListener('visibilitychange',update);reduced.removeEventListener('change',update);geometry.dispose();material.dispose();groundGeo.dispose();groundMat.dispose();hillGeo.dispose();hillMat.dispose();trunkGeo.dispose();trunkMat.dispose();crownGeo.dispose();crownMat.dispose();renderer.dispose();renderer.domElement.remove()};
  }, []);
  return <div className="opening-world" ref={host} aria-hidden="true"/>;
}
