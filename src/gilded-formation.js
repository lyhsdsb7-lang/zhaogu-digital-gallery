import * as THREE from 'three';

// The mesh and its incoming filaments share one field, so each spark lands
// precisely where the irregular reveal front is creating the original surface.
const field = `
  uniform float uProgress;
  uniform float uLowerY;
  uniform float uHeight;
  float hash3(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.13, 0.37, 0.71));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float grain(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i), hash3(i+vec3(1,0,0)), f.x),
                   mix(hash3(i+vec3(0,1,0)), hash3(i+vec3(1,1,0)), f.x), f.y),
               mix(mix(hash3(i+vec3(0,0,1)), hash3(i+vec3(1,0,1)), f.x),
                   mix(hash3(i+vec3(0,1,1)), hash3(i+vec3(1,1,1)), f.x), f.y), f.z);
  }
  float birthOrder(vec3 p) {
    float height = clamp((p.y-uLowerY) / uHeight, 0.0, 1.0);
    return 0.12 + height * 0.62 + grain(p * 4.2) * 0.13
      + grain(p * 12.0) * 0.07;
  }
  float frontier() { return mix(-0.22, 1.22, uProgress); }
`;

export function installMaterialReveal(material, uniforms) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec3 vFormationPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
      vFormationPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
      #include <project_vertex>
    `);
    shader.fragmentShader = `varying vec3 vFormationPosition;
      uniform float uOriginal;
      ${field}\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', `
      #include <clipping_planes_fragment>
      float formationGap = frontier() - birthOrder(vFormationPosition);
      if (uOriginal < 0.5 && formationGap < 0.0) discard;
      float moltenEdge = (1.0-uOriginal) * exp(-max(formationGap, 0.0)*85.0);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
      #include <emissivemap_fragment>
      totalEmissiveRadiance += vec3(1.5, 0.5, 0.055) * moltenEdge * 1.3;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.7, 0.25, 0.045), moltenEdge * 0.6);
    `);
  };
  material.customProgramCacheKey = () => 'zhaogu-gilded-front-v1';
  material.needsUpdate = true;
}

const flight = `
  attribute vec3 aScatter;
  attribute float aSeed;
  uniform float uTime;
  uniform float uSpread;
  uniform float uFieldWidth;
  ${field}
  vec3 flightPosition(float t) {
    vec3 source = aScatter;
    source.x *= uFieldWidth;
    source *= mix(0.22, 1.0, uSpread);
    float phase = aSeed * 38.0;
    source += vec3(sin(uTime*.65+phase)*.16, cos(uTime*.43+phase)*.12, sin(uTime*.51+phase)*.2);
    vec3 c1 = source + vec3(-source.x*.15, 1.25 + aSeed*.6, -source.z*.55);
    vec3 c2 = position + vec3(source.x*.38, .6 + sin(phase)*.45, .8*cos(phase));
    float s = 1.0-t;
    vec3 p = s*s*s*source + 3.0*s*s*t*c1 + 3.0*s*t*t*c2 + t*t*t*position;
    float turbulence = sin(t*3.14159265) * .14;
    p += vec3(sin(phase+uTime*1.1+t*8.0), cos(phase*.7+t*10.0), sin(phase*.4+t*12.0)) * turbulence;
    return p;
  }
  float landing() {
    vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
    return clamp((frontier()-birthOrder(world)+.26) / .26, 0.0, 1.0);
  }
`;

export function createGildedFormation(geometry, bounds, pixelRatio, mobile) {
  const uniforms = {
    uTime: { value: 0 }, uProgress: { value: 0 }, uSpread: { value: 0 },
    uLowerY: { value: bounds.min.y }, uHeight: { value: bounds.max.y - bounds.min.y },
    uOriginal: { value: 0 }, uPixelRatio: { value: pixelRatio },
    uFieldWidth: { value: 1 }, uHalo: { value: 0 }
  };
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: `
      attribute float aKind;
      uniform float uPixelRatio;
      uniform float uHalo;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vKind;
      varying float vAngle;
      ${flight}
      void main() {
        if(aSeed < .82) {
          vColor=vec3(0.0); vAlpha=0.0; vKind=aKind; vAngle=0.0;
          gl_Position=vec4(2.0,2.0,2.0,1.0); gl_PointSize=1.0;
          return;
        }
        float t = landing();
        vec3 p = flightPosition(t);
        vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
        vec4 head = projectionMatrix * viewPosition;
        vec4 tail = projectionMatrix * modelViewMatrix * vec4(flightPosition(max(0.0,t-.03)),1.0);
        vec2 direction = head.xy / head.w - tail.xy / tail.w;
        vAngle = t > .01 ? atan(direction.y, direction.x) : aSeed*6.28;
        float flying = sin(t * 3.14159265);
        float landed = smoothstep(.94,1.0,t);
        float gold = step(2.5,aKind);
        vColor = mix(vec3(.015,.07,.065), vec3(.45,.16,.024), gold);
        vColor = mix(vColor, vec3(1.1,.52,.08), flying*step(.975,aSeed));
        float sparse = step(.82,aSeed);
        vAlpha = sparse * (.32 + flying*.58) * (1.0-landed);
        vKind = aKind;
        gl_Position = head;
        float size = mix(1.1,3.2,step(.96,aSeed)) + flying*2.4;
        if (aKind < 1.5) size *= 3.3;
        gl_PointSize = clamp(size*uPixelRatio*(10.0 / -viewPosition.z),1.0,23.0);
        if(uHalo>.5) gl_PointSize *= 4.0;
      }
    `,
    fragmentShader: `
      uniform float uHalo;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vKind;
      varying float vAngle;
      void main() {
        vec2 q = gl_PointCoord-vec2(.5);
        q = mat2(cos(vAngle),-sin(vAngle),sin(vAngle),cos(vAngle))*q;
        float r = length(q);
        float shape;
        if(vKind<.5) shape=exp(-q.y*q.y*850.0-q.x*q.x*8.0);
        else if(vKind<1.5) shape=exp(-q.y*q.y*300.0-q.x*q.x*16.0)*(1.0+q.x);
        else if(vKind<2.5) shape=exp(-r*r*40.0);
        else if(vKind<3.5) shape=1.0-smoothstep(.22,.36,abs(q.x)+abs(q.y*1.6));
        else if(vKind<4.5) shape=(1.0-smoothstep(.03,.055,abs(q.y+sin(q.x*8.0)*.13)))*(1.0-smoothstep(.2,.5,abs(q.x)));
        else shape=exp(-abs(q.x)*35.0-abs(q.y)*8.0)+exp(-abs(q.y)*35.0-abs(q.x)*8.0);
        if(uHalo>.5) shape=exp(-r*r*18.0)*.14;
        float alpha=shape*vAlpha;
        if(alpha<.008) discard;
        gl_FragColor=vec4(vColor,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
  const cloud = new THREE.Points(geometry,material);
  cloud.frustumCulled=false;
  cloud.renderOrder=2;

  const glowGeometry = new THREE.BufferGeometry();
  Object.entries(geometry.attributes).forEach(([name,a])=>glowGeometry.setAttribute(name,a));
  const indices=[];
  const seeds=geometry.getAttribute('aSeed');
  for(let i=0;i<seeds.count;i++) if(seeds.getX(i)>.975) indices.push(i);
  glowGeometry.setIndex(indices);
  const glowMaterial=material.clone();
  glowMaterial.uniforms={...uniforms,uHalo:{value:1}};
  const glow=new THREE.Points(glowGeometry,glowMaterial);
  glow.frustumCulled=false;
  glow.renderOrder=3;

  // Short parametric tails, rather than a decorative spiral around the object.
  const trailCount=mobile?450:900, segments=10;
  const tails=new THREE.BufferGeometry();
  const attributes={position:[],aScatter:[],aSeed:[],aTail:[]};
  for(let i=0;i<trailCount;i++) {
    const index=Math.floor(i*seeds.count/trailCount);
    for(let s=0;s<segments;s++) for(const end of [s,s+1]) {
      for(const name of ['position','aScatter']) {
        const a=geometry.getAttribute(name);
        attributes[name].push(a.getX(index),a.getY(index),a.getZ(index));
      }
      attributes.aSeed.push(seeds.getX(index));
      attributes.aTail.push(end/segments);
    }
  }
  for(const [name,data] of Object.entries(attributes)) tails.setAttribute(name,new THREE.Float32BufferAttribute(data,name==='position'||name==='aScatter'?3:1));
  const tailMaterial=new THREE.ShaderMaterial({
    uniforms,transparent:true,depthWrite:false,
    vertexShader:`
      attribute float aTail;
      varying float vAlpha;
      varying vec3 vColor;
      ${flight}
      void main(){
        float t=landing();
        float lag=aTail*.23;
        vec3 p=flightPosition(max(0.0,t-lag));
        vAlpha=pow(1.0-aTail,1.7)*sin(t*3.14159265)*.55;
        vColor=mix(vec3(.07,.17,.13),vec3(.8,.3,.025),step(.42,aSeed));
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
      }
    `,
    fragmentShader:`
      varying float vAlpha;
      varying vec3 vColor;
      void main(){
        if(vAlpha<.003) discard;
        gl_FragColor=vec4(vColor,vAlpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
  const filaments=new THREE.LineSegments(tails,tailMaterial);
  filaments.frustumCulled=false;
  filaments.renderOrder=1;
  return {uniforms,cloud,glow,filaments};
}
