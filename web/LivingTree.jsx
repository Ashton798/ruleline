import React, {useEffect, useRef} from 'react';
import * as THREE from 'three';

export default function LivingTree({active}) {
  const host = useRef(null);
  useEffect(() => {
    if (!active) return;
    const element = host.current;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'}); } catch { return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,1.5));
    renderer.setClearColor(0x000000,0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36,1,.1,100);
    camera.position.set(0,4,17);
    camera.lookAt(0,4,0);
    scene.add(new THREE.HemisphereLight(0xd8ffe1,0x21482c,2.2));
    const light = new THREE.DirectionalLight(0xf1ffc3,2.5);
    light.position.set(-5,12,8); scene.add(light);
    const bark = new THREE.MeshStandardMaterial({color:0x315934,roughness:.92});
    const leafMaterial = new THREE.MeshStandardMaterial({color:0x75d45f,roughness:.65,side:THREE.DoubleSide});
    const branchGeometry = new THREE.CylinderGeometry(.65,1,1,8);
    const leafGeometry = new THREE.SphereGeometry(1,6,4);
    const tree = new THREE.Group(); scene.add(tree);
    const tips = [];
    let seed = 4291;
    const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    function branch(start, direction, length, thickness, level) {
      const end = start.clone().add(direction.clone().multiplyScalar(length));
      const mesh = new THREE.Mesh(branchGeometry,bark);
      mesh.position.copy(start).add(end).multiplyScalar(.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.clone().normalize());
      mesh.scale.set(thickness,length,thickness); tree.add(mesh);
      if (!level) { tips.push(end); return; }
      for (let i=0;i<3;i++) {
        const angle = i * Math.PI * 2 / 3 + random() * 1.5;
        const next = direction.clone().multiplyScalar(.48).add(new THREE.Vector3(Math.cos(angle)*.65,.38+random()*.3,Math.sin(angle)*.65)).normalize();
        branch(end,next,length*(.65+random()*.1),thickness*.57,level-1);
      }
    }
    branch(new THREE.Vector3(0,0,0),new THREE.Vector3(0,1,0),2.8,.38,4);
    const leaves = new THREE.InstancedMesh(leafGeometry,leafMaterial,tips.length*7);
    leaves.instanceMatrix.setUsage(THREE.DynamicDrawUsage); tree.add(leaves);
    const leafData=[];
    for(const tip of tips) for(let index=0;index<7;index++) leafData.push({position:tip.clone().add(new THREE.Vector3((random()-.5)*1.4,(random()-.5)*1.1,(random()-.5)*1.4)),phase:random()*Math.PI*2,size:.12+random()*.11});
    const object = new THREE.Object3D();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame=0, started=performance.now();
    function resize() { const rect=element.getBoundingClientRect(); if(!rect.width||!rect.height)return; renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix(); }
    function draw(now) {
      const elapsed = reduced.matches ? 6 : Math.max(0,(now-started)/1000);
      const growth = Math.min(1,elapsed/4);
      tree.rotation.y = reduced.matches ? .25 : .25 + Math.sin(elapsed*.15)*.14;
      leafData.forEach((leaf,index)=>{
        const cycle = (elapsed*.1+leaf.phase/(Math.PI*2))%1;
        const falling = !reduced.matches && cycle>.88;
        object.position.copy(leaf.position);
        if(falling){const fall=(cycle-.88)/.12;object.position.y-=fall*3;object.position.x+=Math.sin(elapsed+leaf.phase)*fall*.7;}
        object.rotation.set(leaf.phase,leaf.phase+elapsed*.12,leaf.phase*.6);
        const size=leaf.size*growth*(falling?Math.max(.05,1-(cycle-.88)/.12):1);
        object.scale.set(size*.7,size*1.35,size*.35);object.updateMatrix();leaves.setMatrixAt(index,object.matrix);
      });
      leaves.instanceMatrix.needsUpdate=true;renderer.render(scene,camera);
      if(!reduced.matches&&!document.hidden) frame=requestAnimationFrame(draw);
    }
    function restart(){cancelAnimationFrame(frame);resize();draw(performance.now());}
    const observer=new ResizeObserver(restart);observer.observe(element);
    reduced.addEventListener('change',restart);document.addEventListener('visibilitychange',restart);
    restart();
    return ()=>{cancelAnimationFrame(frame);observer.disconnect();reduced.removeEventListener('change',restart);document.removeEventListener('visibilitychange',restart);branchGeometry.dispose();leafGeometry.dispose();bark.dispose();leafMaterial.dispose();renderer.dispose();renderer.domElement.remove();};
  },[active]);
  return <div ref={host} className="living-tree" aria-hidden="true"/>;
}
