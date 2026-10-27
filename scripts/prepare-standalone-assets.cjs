const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const app=path.resolve(__dirname,'..'),build=process.env.NEXT_BUILD_DIR||'.next';
if(!/^\.next[-\w]*$/.test(build))throw new Error('Invalid build directory');
const output=path.join(app,build),standalone=path.join(output,'standalone');
for(const [from,to] of [[path.join(output,'static'),path.join(standalone,build,'static')],[path.join(app,'public'),path.join(standalone,'public')]]){
 fs.mkdirSync(to,{recursive:true});fs.cpSync(from,to,{recursive:true,dereference:true});
}
execFileSync(process.execPath,[path.join(__dirname,'prepare-standalone-pdf.cjs'),build],{cwd:app,stdio:'inherit'});
