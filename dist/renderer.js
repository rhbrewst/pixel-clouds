(function (root) {
  'use strict';
  const M = root.PixelCloudModel;
  function PixelCloudRenderer(canvas) {
    const ctx = canvas.getContext('2d', { alpha: false });
    const palette = { blue:'#08a9ef', pale:'#7bcaff', white:'#ffffff' };
    let width=0, height=0, dpr=1;
    let fills=[], roots=[];
    const mapCols=48, mapRows=32, stride=mapCols+1;
    const field=new Float32Array(stride*(mapRows+1));
    const roughMap=new Float32Array(field.length), phaseMap=new Float32Array(field.length);
    // Seeded gradient noise gives the clouds continuous motion without a loop seam.
    let seed = 7391;
    const random = () => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; };
    const permutation = Array.from({length:256},(_,i)=>i);
    for(let i=255;i>0;i--) { const j=Math.floor(random()*(i+1)); [permutation[i],permutation[j]]=[permutation[j],permutation[i]]; }
    const p = [...permutation,...permutation];
    const fade = t => t*t*t*(t*(t*6-15)+10);
    const mix = (a,b,t) => a+(b-a)*t;
    const clamp = value => Math.max(0,Math.min(1,value));
    const grad = (hash,x,y,z) => { const h=hash&15,u=h<8?x:y,v=h<4?y:h===12||h===14?x:z; return ((h&1)?-u:u)+((h&2)?-v:v); };
    function noise(x,y,z) {
      const X=Math.floor(x)&255,Y=Math.floor(y)&255,Z=Math.floor(z)&255;
      x-=Math.floor(x); y-=Math.floor(y); z-=Math.floor(z);
      const u=fade(x),v=fade(y),w=fade(z),A=p[X]+Y,AA=p[A]+Z,AB=p[A+1]+Z,B=p[X+1]+Y,BA=p[B]+Z,BB=p[B+1]+Z;
      return mix(mix(mix(grad(p[AA],x,y,z),grad(p[BA],x-1,y,z),u),mix(grad(p[AB],x,y-1,z),grad(p[BB],x-1,y-1,z),u),v),mix(mix(grad(p[AA+1],x,y,z-1),grad(p[BA+1],x-1,y,z-1),u),mix(grad(p[AB+1],x,y-1,z-1),grad(p[BB+1],x-1,y-1,z-1),u),v),w);
    }
    function checker(a,b) {
      const tile=document.createElement('canvas');
      const unit=Math.max(1,Math.round(2*dpr));
      tile.width=tile.height=unit*2;
      const c=tile.getContext('2d');
      c.fillStyle=a; c.fillRect(0,0,tile.width,tile.height);
      c.fillStyle=b; c.fillRect(0,0,unit,unit); c.fillRect(unit,unit,unit,unit);
      return ctx.createPattern(tile,'repeat');
    }
    function sampleInfo(nx,ny) {
      const gx=clamp(nx)*mapCols,gy=clamp(ny)*mapRows;
      const x=Math.min(mapCols-1,Math.floor(gx)),y=Math.min(mapRows-1,Math.floor(gy));
      return { index:y*stride+x, fx:gx-x, fy:gy-y };
    }
    function sample(map,info) {
      const {index,fx,fy}=info;
      return mix(mix(map[index],map[index+1],fx),mix(map[index+stride],map[index+stride+1],fx),fy);
    }
    function cellThreshold(x,y,depth) {
      let hash=Math.imul(x+173,374761393)^Math.imul(y+421,668265263)^Math.imul(depth+1,1274126177);
      hash=Math.imul(hash^(hash>>>13),1274126177);
      return ((hash^(hash>>>16))>>>0)/4294967296;
    }
    function buildNode(left,top,size,nominal,depth,gridX,gridY) {
      const nx=(left+size/2)/width,ny=(top+size/2)/height;
      const info=sampleInfo(nx,ny),x=Math.round(left*dpr),y=Math.round(top*dpr);
      const node={ nx,ny,left:x,top:y,w:Math.round((left+size)*dpr)-x,h:Math.round((top+size)*dpr)-y,
        nominal,info,rough:sample(roughMap,info),phase:sample(phaseMap,info),threshold:cellThreshold(gridX,gridY,depth),children:null };
      if(depth<3) {
        node.children=[];
        for(let dy=0;dy<2;dy++) for(let dx=0;dx<2;dx++)
          node.children.push(buildNode(left+dx*size/2,top+dy*size/2,size/2,nominal/2,depth+1,gridX*2+dx,gridY*2+dy));
      }
      return node;
    }
    this.resize = () => {
      const rect=canvas.getBoundingClientRect();
      width=Math.max(1,rect.width);height=Math.max(1,rect.height);dpr=Math.min(devicePixelRatio||1,2);
      canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
      fills=[palette.blue,checker(palette.blue,palette.pale),palette.pale,checker(palette.pale,palette.white),palette.white];
      for(let y=0;y<=mapRows;y++) for(let x=0;x<=mapCols;x++) {
        const nx=x/mapCols,ny=y/mapRows,index=y*stride+x;
        roughMap[index]=noise(nx*13+8,ny*13+4,2.7)*.1+noise(nx*31,ny*31,1.3)*.025;
        phaseMap[index]=nx*10+ny*7+noise(nx*8,ny*8,1.7)*2.5;
      }
      // Every level shares the same anchors. Refinement subdivides local cells;
      // it never rescales or replaces the whole grid during a transition.
      const size=Math.max(8,40*Math.min(width/1708,height/1024));
      roots=[];
      for(let y=0;y<Math.ceil(height/size);y++) for(let x=0;x<Math.ceil(width/size);x++)
        roots.push(buildNode(x*size,y*size,size,40,0,x,y));
    };
    function whiteLevel(m) { return m>.08?4:m>.025?3:m>-.025?2:m>-.085?1:0; }
    this.draw = (project,index,progress,idleTime=0) => {
      const t=clamp(progress),time=M.sampleTime(project,index,t)+idleTime;
      const motion=M.sampleMotion(project,index,t),shape=M.sampleSpace(project,index,t);
      ctx.fillStyle=palette.white;ctx.fillRect(0,0,canvas.width,canvas.height);
      // Bilinear field sampling avoids the old three-cell blocks moving in lockstep.
      for(let y=0;y<=mapRows;y++) for(let x=0;x<=mapCols;x++) {
        const nx=x/mapCols,ny=y/mapRows,sx=nx*3.5+time*.023,sy=ny*2.8+time*.006;
        field[y*stride+x]=noise(sx+4.8,sy+8.1,time*.009)*.79+noise(sx*2.1+18,sy*2.1-7,time*.014)*.17+noise(sx*4.2,sy*4.2,time*.019)*.04;
      }
      const angle=shape.rotation*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
      const cx=shape.x/100*width,cy=shape.y/100*height,rx=shape.width/200*width,ry=shape.height/200*height;
      function paint(node) {
        if(node.children && node.threshold<clamp((node.nominal-motion.size)/(node.nominal/2))) {
          for(const child of node.children) paint(child);
          return;
        }
        const px=node.nx*width-cx,py=node.ny*height-cy;
        const dx=(px*cos+py*sin)/rx,dy=(-px*sin+py*cos)/ry;
        const edge=Math.pow(dx**4+dy**4,.25);
        const swell=Math.sin(node.phase-t*5)*.085*motion.ripple;
        const opening=whiteLevel(1.12-edge+node.rough+swell);
        if(opening===4) return;
        const n=sample(field,node.info);
        const skyLevel=n<-.10?0:n<-.025?1:n<.075?2:n<.15?3:4;
        const level=Math.max(skyLevel,opening);
        if(level===4) return;
        ctx.fillStyle=fills[level];ctx.fillRect(node.left,node.top,node.w,node.h);
      }
      for(const node of roots) paint(node);
      return shape;
    };
  }
  root.PixelCloudRenderer = PixelCloudRenderer;
})(globalThis);
