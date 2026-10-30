import * as esbuild from 'esbuild';
await esbuild.build({ entryPoints:['addons-entry.js'], bundle:true, format:'esm', minify:true, outfile:'addons.min.js',
  plugins:[{name:'ext',setup(b){ b.onResolve({filter:/^three$/},()=>({path:'./three.module.min.js',external:true})); }}],
  banner:{js:'/* three.js r170 addons (RoomEnvironment, BufferGeometryUtils, SimplexNoise), MIT, see three-LICENSE.txt */'} });
