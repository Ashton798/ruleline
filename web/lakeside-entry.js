import {openLake} from './lakeside.js';
const canvas = document.querySelector('canvas');
const status = document.querySelector('#status');
openLake({canvas, getProgress:()=>1 - window.scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight), onReady:()=>{status.textContent='';}}).catch(error=>{
  status.textContent='湖岸场景未能载入，请使用支持 WebGL 的浏览器刷新重试。';
  console.error(error);
});
