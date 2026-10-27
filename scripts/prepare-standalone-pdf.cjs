// PDF.js resolves its optional canvas and CMaps at runtime; Next tracing cannot
// reliably discover these through pnpm. Copy the installed dependencies exactly.
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const app=path.resolve(__dirname,'..'),build=process.argv[2]||process.env.NEXT_BUILD_DIR||'.next';
if(!/^\.next[-\w]*$/.test(build))throw new Error('Invalid build directory');
const standalone=path.join(app,build,'standalone');
if(!fs.existsSync(path.join(standalone,'server.js')))throw new Error('Standalone build missing');
const from=createRequire(path.join(app,'package.json'));
const pdf=path.dirname(from.resolve('pdfjs-dist/package.json'));
const pdfRequire=createRequire(path.join(pdf,'package.json'));
const copy=(source,dest)=>{fs.mkdirSync(path.dirname(dest),{recursive:true});fs.cpSync(source,dest,{recursive:true,dereference:true});};
for(const file of ['package.json','legacy/build/pdf.mjs','legacy/build/pdf.worker.mjs','cmaps'])copy(path.join(pdf,file),path.join(standalone,'node_modules/pdfjs-dist',file));
const canvasPackage=pdfRequire.resolve('@napi-rs/canvas/package.json');
pdfRequire('@napi-rs/canvas'); // Identify and copy the native package actually loaded on this platform.
copy(path.dirname(canvasPackage),path.join(standalone,'node_modules/@napi-rs/canvas'));
let copiedNative=false;
for(const file of Object.keys(require.cache).filter(file=>file.endsWith('.node')&&file.includes('canvas'))){
  const dir=path.dirname(file),manifest=path.join(dir,'package.json');
  if(!fs.existsSync(manifest))continue;
  const pkg=JSON.parse(fs.readFileSync(manifest,'utf8'));
  if(!pkg.name?.startsWith('@napi-rs/canvas-'))continue;
  copy(dir,path.join(standalone,'node_modules',pkg.name));copiedNative=true;
}
if(!copiedNative)throw new Error('Canvas native dependency was not identified');
console.log('STANDALONE_PDF_DEPENDENCIES_READY '+build);
