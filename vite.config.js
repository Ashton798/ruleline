import {defineConfig} from 'vite';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
const startLocalAI = () => {
  if (process.platform !== 'win32') return;
  const script = resolve(process.cwd(), 'start-ai.ps1');
  const child = spawn('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-Auto'], {windowsHide:true,stdio:'ignore'});
  child.on('error',()=>{});
  child.unref();
};
const localAI = {name:'ruleline-local-ai', configureServer:startLocalAI, configurePreviewServer:startLocalAI};
const proxy={'/api':{
  target:'http://127.0.0.1:4399',
  configure(proxy){
    proxy.on('proxyReq',(proxyReq,req)=>{
      // The local AI server accepts the documented 4177 origin. Only translate
      // requests coming from the same loopback Vite origin, never other sites.
      const host=req.headers.host;
      if(host&&/^127\.0\.0\.1:\d+$/.test(host)&&req.headers.origin===`http://${host}`){
        proxyReq.setHeader('Origin','http://127.0.0.1:4177');
      }
    });
  }
}};
export default defineConfig({plugins:[localAI],build:{rollupOptions:{input:{home:'index.html',lakeside:'lakeside/index.html',tree:'tree/index.html'}}},server:{proxy},preview:{proxy}});
