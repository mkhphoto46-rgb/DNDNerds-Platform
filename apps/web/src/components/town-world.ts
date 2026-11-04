import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { makeVillageBuilding, makeTownSurface } from "./town-architecture";
import { addTownProps } from "./town-props";

export const TOWN_STOPS = [
  { x: 0, z: 29, lookX: 0, lookZ: 13 },
  { x: -0.7, z: 20, lookX: -4, lookZ: 10 },
  { x: 1.3, z: 10, lookX: 0, lookZ: -4 },
  { x: 1.1, z: 1, lookX: 6, lookZ: -10 },
  { x: 0.4, z: -7, lookX: 6, lookZ: -21 },
  { x: -0.6, z: -15, lookX: -3, lookZ: -24 },
  { x: 0, z: -25, lookX: 0, lookZ: -43 },
] as const;

const mat = (color: number, roughness = 1) => new THREE.MeshStandardMaterial({ color, roughness });
const timber = mat(0x6c4934);

function box(width: number, height: number, depth: number, material: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function addDoubleGate(group: THREE.Group, width: number, height: number, z: number) {
  const oak = makeTownSurface("oak_wood_planks", 0xe1bd94);
  const iron = new THREE.MeshStandardMaterial({ color: 0x292b2a, metalness: .68, roughness: .54 });
  const seam = mat(0x271c19);
  const leafWidth = width / 2 - .04;
  for (const side of [-1, 1]) {
    const x = side * (leafWidth / 2 + .02);
    group.add(box(leafWidth, height, .28, oak, x, height / 2, z));
    for (let i = 1; i < 6; i++) group.add(box(.016, height - .14, .02, seam, x - leafWidth / 2 + i * leafWidth / 6, height / 2, z + .16));
    for (const y of [.76, height * .56, height - .52]) {
      group.add(box(leafWidth - .08, .13, .055, iron, x, y, z + .19));
      group.add(box(leafWidth - .08, .13, .055, iron, x, y, z - .19));
      for (let i = 0; i < 5; i++) {
        const studX = x - leafWidth * .39 + i * leafWidth * .195;
        const stud = new THREE.Mesh(new THREE.SphereGeometry(.038, 8, 6), iron);
        stud.position.set(studX, y, z + .23); group.add(stud);
      }
    }
    const brace = box(.14, Math.hypot(leafWidth - .3, height - 1.25), .07, iron, x, height * .5, z + .215);
    brace.rotation.z = side * .55;
    group.add(brace);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.16, .034, 8, 20), iron);
    ring.position.set(side * .36, height * .47, z + .23); group.add(ring);
  }
  group.add(box(.16, height + .18, .4, iron, 0, height / 2, z + .05));
}

function cobbleTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#a48367";
  ctx.fillRect(0, 0, 1024, 1024);
  let seed = 42;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 29000; i++) {
    const x = rand() * 1024, y = rand() * 1024;
    const light = rand() > .45;
    ctx.fillStyle = light ? `rgba(232,204,160,${.025 + rand() * .11})` : `rgba(54,42,36,${.02 + rand() * .08})`;
    ctx.beginPath(); ctx.ellipse(x, y, .8 + rand() * 4, .6 + rand() * 3, rand() * Math.PI, 0, Math.PI * 2); ctx.fill();
  }
  for (let i = 0; i < 190; i++) {
    const x = rand() * 1024, y = rand() * 1024;
    const radius = 3 + rand() * 13;
    const shade = 149 + Math.floor(rand() * 32);
    ctx.fillStyle = `rgba(${shade},${shade - 12},${shade - 29},.42)`;
    ctx.strokeStyle = "rgba(73,57,48,.16)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let corner = 0; corner < 7; corner++) {
      const angle = corner * Math.PI * 2 / 7;
      const px = x + Math.cos(angle) * radius * (.7 + rand() * .45);
      const py = y + Math.sin(angle) * radius * (.65 + rand() * .45);
      if (corner === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 5);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function masonryTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#b2a08d";
  ctx.fillRect(0, 0, 512, 512);
  for (let row = 0; row < 16; row++) {
    for (let col = -1; col < 9; col++) {
      const x = col * 72 + (row % 2) * 36;
      const y = row * 32;
      const shade = 182 + Math.round(Math.sin(col * 11 + row * 19) * 13);
      ctx.fillStyle = `rgb(${shade},${shade - 14},${shade - 30})`;
      ctx.fillRect(x + 2, y + 2, 68, 28);
      ctx.fillStyle = "#ede2c6";
      ctx.globalAlpha = .18;
      ctx.fillRect(x + 3, y + 3, 64, 2);
      ctx.globalAlpha = 1;
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.5, 2.5);
  return texture;
}

function cloudTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d")!;
  const glow = context.createRadialGradient(64, 64, 8, 64, 64, 62);
  glow.addColorStop(0, "rgba(255,246,229,.94)");
  glow.addColorStop(.45, "rgba(255,230,210,.8)");
  glow.addColorStop(.77, "rgba(247,198,185,.3)");
  glow.addColorStop(1, "rgba(247,198,185,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function bird() {
  const group = new THREE.Group();
  const feather = new THREE.MeshBasicMaterial({ color: 0x483e43, side: THREE.DoubleSide });
  const wingGeometry = new THREE.BufferGeometry();
  wingGeometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1.05, .15, 0, .16, -.1, .12], 3));
  wingGeometry.computeVertexNormals();
  const wings: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(wingGeometry, feather);
    wing.scale.x = side;
    group.add(wing);
    wings.push(wing);
  }
  const body = new THREE.Mesh(new THREE.SphereGeometry(.18, 7, 5), feather);
  body.scale.set(.65, .6, 1.5);
  group.add(body);
  group.userData.wings = wings;
  return group;
}

function tenSidedGeometry() {
  const points: number[] = [];
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    const b = (i + 1) * Math.PI * 2 / 5;
    const ax = Math.cos(a), az = Math.sin(a), bx = Math.cos(b), bz = Math.sin(b);
    points.push(0, 1.25, 0, ax, 0, az, bx, 0, bz);
    points.push(0, -1.25, 0, bx, 0, bz, ax, 0, az);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  geo.computeVertexNormals();
  return geo;
}

function torchFlame(seed: number) {
  const group = new THREE.Group();
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, seed: { value: seed } },
    vertexShader: `varying vec2 uvFlame;
      void main(){uvFlame=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec2 uvFlame; uniform float time; uniform float seed;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      void main(){
        float y=uvFlame.y; float t=time+seed;
        float turbulence=noise(vec2(uvFlame.x*5.0,y*5.0-t*2.3));
        float drift=sin(y*7.0-t*2.0)*.045*y + (turbulence-.5)*.21*y;
        float x=abs(uvFlame.x-.5+drift);
        float width=.24*pow(max(0.0,1.0-y),.72);
        float edge=1.0-smoothstep(width*.45,width+.04,x);
        float plume=smoothstep(.0,.14,y)*(1.0-smoothstep(.65,1.0,y+(turbulence-.5)*.22));
        float alpha=edge*plume*.56;
        vec3 color=mix(vec3(1.0,.19,.025),vec3(1.0,.85,.34),edge*(1.0-y));
        gl_FragColor=vec4(color,alpha);
      }`,
  });
  for (let i = 0; i < 3; i++) {
    const layer = new THREE.Mesh(new THREE.PlaneGeometry(.88, 1.18), material);
    layer.rotation.y = i * Math.PI / 3;
    group.add(layer);
  }
  group.userData.flameMaterial = material;
  return group;
}

export async function createTownWorld(host: HTMLElement, markers: Record<string, HTMLButtonElement | null> = {}, onWalkStage?: (stage: number) => void, onEnter?: (key: string) => void, onTransitionStart?: (key: string) => void) {
  await document.fonts.ready;
  const scene = new THREE.Scene();
  const skyCanvas = document.createElement("canvas");
  skyCanvas.width = 4; skyCanvas.height = 512;
  const skyContext = skyCanvas.getContext("2d")!;
  const skyGradient = skyContext.createLinearGradient(0,0,0,512);
  skyGradient.addColorStop(0,"#111a2b"); skyGradient.addColorStop(.5,"#28364c"); skyGradient.addColorStop(.78,"#6b5863"); skyGradient.addColorStop(1,"#b97d61");
  skyContext.fillStyle = skyGradient; skyContext.fillRect(0,0,4,512);
  const skyTexture = new THREE.CanvasTexture(skyCanvas); skyTexture.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTexture;
  scene.fog = new THREE.Fog(0x414657, 42, 125);
  const camera = new THREE.PerspectiveCamera(60, 1, .1, 160);
  camera.position.set(0, 1.8, 29);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 700 ? 1 : 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0x9daed0, 0x322923, .55));
  const sun = new THREE.DirectionalLight(0xffb678, 1.25);
  sun.position.set(-26, 9, -28);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -.00015; sun.shadow.normalBias = .035; sun.shadow.radius = 2;
  sun.shadow.camera.left = -38; sun.shadow.camera.right = 38;
  sun.shadow.camera.top = 38; sun.shadow.camera.bottom = -38;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 90;
  scene.add(sun);
  const skyFill = new THREE.DirectionalLight(0x9aaed1, .25);
  skyFill.position.set(12, 17, 31);
  scene.add(skyFill);
  const cloudMap = cloudTexture();
  const cloudClusters: THREE.Group[] = [];
  for (const [x, y, z, size] of [[-24, 19, -37, 1.1], [18, 19, -40, 1.25], [-7, 24, -74, 1.45], [31, 23, -70, 1.2], [-35, 25, -78, 1.3], [-35, 22, 26, 1.4], [22, 20, 33, 1.15], [3, 25, 57, 1.5], [-48, 20, 1, 1.3], [47, 23, -12, 1.2]]) {
    const cluster = new THREE.Group();
    cluster.position.set(x, y, z);
    for (let i = 0; i < 5; i++) {
      const cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudMap, color: i % 2 ? 0xffdfc5 : 0xfff0d8, transparent: true, opacity: .26, depthWrite: false, fog: false }));
      cloud.position.set((i - 2) * 2.3 * size, Math.sin(i * 2.4) * .8 * size, -i * .3);
      cloud.scale.set((5.5 + i % 3) * size, (3.1 + i % 2) * size, 1);
      cluster.add(cloud);
    }
    scene.add(cluster);
    cloudClusters.push(cluster);
  }
  const birds = [0, 1, 2, 3, 4, 5, 6, 7].map(i => {
    const flyer = bird();
    const altitude = 12.2 + (i % 4) * 1.15 + Math.floor(i / 4) * .55;
    flyer.position.set(-30 + (i % 4) * 9 - Math.floor(i / 4) * 12, altitude, 14 - (i * 11) % 58);
    flyer.scale.setScalar(.66 + (i % 3) * .13);
    flyer.userData.baseAltitude = altitude;
    scene.add(flyer);
    return flyer;
  });
  for (const [x, z] of [[-5, 21], [5, 10], [-5, -14], [5, -22]]) {
    const light = new THREE.SpotLight(0xffb457, 42, 14, Math.PI / 2.8, .75, 2);
    light.position.set(x, 3.3, z);
    light.target.position.set(x > 0 ? -1 : 1, 0, z);
    light.castShadow = z === 21 || z === 10;
    light.shadow.mapSize.set(512, 512);
    light.shadow.bias = -.0002; light.shadow.normalBias = .025;
    scene.add(light.target);
    scene.add(light);
  }
  const groundMap = new THREE.TextureLoader().load("/town-images/town-ground.png");
  groundMap.colorSpace = THREE.SRGBColorSpace;
  groundMap.wrapS = groundMap.wrapT = THREE.RepeatWrapping;
  groundMap.repeat.set(14, 14);
  groundMap.anisotropy = 8;
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(190, 190), new THREE.MeshStandardMaterial({ map: groundMap, roughness: 1, emissiveMap: groundMap, emissive: 0x70655a, emissiveIntensity: .22 }));
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  scene.add(grass);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 112), new THREE.MeshStandardMaterial({ map: cobbleTexture(), roughness: 1 }));
  road.rotation.x = -Math.PI / 2; road.position.set(0, .025, -12);
  road.receiveShadow = true; scene.add(road);
  for (const side of [-1, 1] as const) {
    const curb = box(.4, .15, 112, mat(0xa8a18f), side * 4.43, .06, -12);
    scene.add(curb);
    [23, 13, 3, -9, -21, -33].forEach((z, i) => {
      const kind = side === -1 && i === 1 ? "tavern" : side === -1 && i === 2 ? "blacksmith" : side === 1 && i === 3 ? "guild" : side === 1 && i === 4 ? "cartography" : side === -1 && i === 4 ? "shop" : "cottage";
      scene.add(makeVillageBuilding(side, z, i + (side === 1 ? 2 : 0), kind));
    });
  }
  const propFootprints = addTownProps(scene);
  // Reserve ground space before asynchronous models load so the result does not
  // depend on which asset reaches the browser first.
  const occupied = [
    ...propFootprints,
    ...[[-5.55, -1.8], [-6.35, -3.65], [-5.45, -5.3]].map(([x, z]) => ({ x, z, radius: .58 })),
    ...[[-9.2, 18.15], [7.8, -27.35], [8.7, -39.15]].map(([x, z]) => ({ x, z, radius: 1.08 })),
  ];
  const reserveGround = (x: number, z: number, radius: number) => {
    if (occupied.some(item => Math.hypot(x - item.x, z - item.z) < radius + item.radius + .16)) return false;
    occupied.push({ x, z, radius });
    return true;
  };
  // The original untextured 11 m disc extended under the houses as a pale slab.
  // The lane already has stone paving, so only a small paved fountain apron is needed.
  const square = new THREE.Mesh(new THREE.CircleGeometry(3.15, 64), new THREE.MeshStandardMaterial({ map: cobbleTexture(), roughness: 1 }));
  square.rotation.x = -Math.PI / 2; square.position.set(-.8, .029, -4.5); square.receiveShadow = true; scene.add(square);
  const fountain = new THREE.Group(); fountain.position.set(-.8, 0, -4.5); scene.add(fountain);
  const fountainLight = new THREE.PointLight(0xffd5a0, 8, 7, 2);
  fountainLight.position.set(2.5, 3.2, 1.8);
  fountain.add(fountainLight);
  const fountainStone = makeTownSurface("old_sandstone_02", 0xd7cfbd);
  fountainStone.emissive.setHex(0x564435);
  fountainStone.emissiveIntensity = .48;
  fountainStone.side = THREE.DoubleSide;
  const basinProfile = [[0,.17],[2.02,.17],[2.02,.57],[2.16,.67],[2.23,.69],[2.25,.63],[2.15,.5],[2.15,.14],[2.48,.14],[2.48,.62],[2.43,.74],[2.28,.78],[2.09,.74],[2.02,.64]];
  const basin = new THREE.Mesh(new THREE.LatheGeometry(basinProfile.map(([r,y]) => new THREE.Vector2(r,y)), 64), fountainStone);
  basin.castShadow = true; basin.receiveShadow = true; fountain.add(basin);
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } }, side: THREE.DoubleSide,
    vertexShader: `uniform float time; varying vec2 vUv; varying vec3 vWorld; void main(){vUv=uv;vec3 p=position;float r=length(p.xy);p.z+=.007*sin(r*24.-time*2.1)+.005*sin(length(p.xy-vec2(.47,.23))*31.-time*2.8);vec4 world=modelMatrix*vec4(p,1.);vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`,
    fragmentShader: `uniform float time; varying vec2 vUv; varying vec3 vWorld; void main(){vec2 p=vUv-.5;float r=length(p);if(r>.5)discard;float ring=sin(r*50.-time*3.2)*.5+sin(length(p-vec2(.19,-.11))*68.-time*4.1)*.22;float shimmer=sin(p.x*47.+sin(p.y*31.+time*1.7))*sin(p.y*43.-time*1.3)*.025;vec3 n=normalize(cross(dFdx(vWorld),dFdy(vWorld)));vec3 viewDir=normalize(cameraPosition-vWorld);float fresnel=pow(1.-abs(dot(n,viewDir)),2.);vec3 deep=vec3(.07,.14,.15);vec3 sky=vec3(.21,.29,.31);vec3 c=mix(deep,sky,clamp(.4+fresnel*.55+ring*.035+shimmer,0.,1.));gl_FragColor=vec4(c,1.);}`,
  });
  const water = new THREE.Mesh(new THREE.RingGeometry(0, 2.08, 96, 24), waterMaterial);
  water.rotation.x = -Math.PI / 2; water.position.y = .745; fountain.add(water);
  const pedestal = new THREE.Mesh(new THREE.LatheGeometry([[0,.18],[.51,.18],[.54,.3],[.39,.42],[.25,1.42],[.4,1.48],[.48,1.6],[.41,1.7],[.26,1.74],[0,1.74]].map(([r,y]) => new THREE.Vector2(r,y)), 48), fountainStone);
  pedestal.castShadow = true; fountain.add(pedestal);
  const crown = new THREE.Mesh(new THREE.LatheGeometry([[0,1.67],[.39,1.67],[.5,1.76],[.44,1.84],[.28,1.89],[0,1.89]].map(([r,y]) => new THREE.Vector2(r,y)), 48), fountainStone);
  fountain.add(crown);
  const streamMaterial = new THREE.MeshPhysicalMaterial({ color: 0xa8c4bf, transparent: true, opacity: .48, roughness: .12, metalness: .08, depthWrite: false });
  const dropletMaterial = new THREE.MeshPhysicalMaterial({ color: 0x95b7b5, transparent: true, opacity: .48, roughness: .08, depthWrite: false });
  const droplets: { mesh: THREE.Mesh; curve: THREE.CatmullRomCurve3; offset: number }[] = [];
  const splashRings: { mesh: THREE.Mesh; phase: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const angle = i * 2.39996;
    const landing = 1.48 + (i % 3) * .13;
    const points = Array.from({length: 20}, (_, j) => { const t=j/19; const radius=.28+t*(landing-.28); return new THREE.Vector3(Math.cos(angle)*radius, 1.65+.15*Math.sin(t*Math.PI)-.9*t*t, Math.sin(angle)*radius); });
    const curve = new THREE.CatmullRomCurve3(points);
    fountain.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, .008+(i%2)*.002, 5, false), streamMaterial));
    for (let j=0;j<5;j++) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(.018+(j%3)*.004, 6, 5), dropletMaterial);
      fountain.add(mesh); droplets.push({mesh, curve, offset:(j/5+i*.09)%1});
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(.07,.095,24), new THREE.MeshBasicMaterial({color:0xb5d3cb,transparent:true,opacity:.23,depthWrite:false,side:THREE.DoubleSide}));
    ring.rotation.x=-Math.PI/2; ring.position.set(Math.cos(angle)*landing,.753,Math.sin(angle)*landing);
    fountain.add(ring); splashRings.push({mesh:ring,phase:i*.27});
  }
  const arena = new THREE.Group(); arena.position.set(0, 0, -43);
  const fenceWood = mat(0x68432f);
  const railWood = mat(0x936343);
  for (let i = 0; i < 28; i++) {
    const angle = i / 28 * Math.PI * 2;
    const x = Math.sin(angle) * 7.6, z = Math.cos(angle) * 7.6;
    arena.add(box(.2, 1.35, .23, fenceWood, x, .68, z));
    for (const y of [.46, .93]) {
      const rail = box(1.75, .13, .14, railWood, x, y, z);
      rail.rotation.y = angle;
      arena.add(rail);
    }
  }
  const arenaFloor = new THREE.Mesh(new THREE.CylinderGeometry(7.3, 7.3, .32, 36), mat(0xd2b894));
  arenaFloor.position.y = .18; arena.add(arenaFloor); scene.add(arena);
  const flames: THREE.Group[] = [];
  for (const angle of [.45, Math.PI - .45, Math.PI + .45, Math.PI * 2 - .45]) {
    const x = Math.sin(angle) * 8.7, z = Math.cos(angle) * 8.7;
    const torch = new THREE.Mesh(new THREE.CylinderGeometry(.12, .17, 2.45, 8), timber);
    torch.position.set(x, 1.22, z); torch.castShadow = true; arena.add(torch);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(.38, .22, .26, 10), mat(0x514236));
    bowl.position.set(x, 2.55, z); arena.add(bowl);
    const flame = torchFlame(angle * 3);
    flame.position.set(x, 3.03, z); arena.add(flame); flames.push(flame);
    const glow = new THREE.PointLight(0xff873b, 9, 7, 2);
    glow.position.set(x, 2.85, z); arena.add(glow);
  }
  const ridgeColors = [0x93ad9b,0x7e9b8e,0xa9b99f];
  for (let i=0;i<9;i++) {
    const hill = new THREE.Mesh(new THREE.IcosahedronGeometry(10 + (i%3)*2, 1), mat(ridgeColors[i%ridgeColors.length]));
    hill.scale.set(2.3, .75 + (i%3)*.16, 1);
    hill.position.set((i-4)*18, -1.5, -93 - (i%2)*10);
    scene.add(hill);
  }
  const castle = new THREE.Group(); castle.position.set(0, 0, -62);
  const masonry = makeTownSurface("castle_brick_01", 0xc8c9c6);
  const castleStone = mat(0xbeb7a0);
  // The inner keep has a walkable gateway rather than a painted-on door.
  castle.add(box(10, 3.8, 4, masonry, 0, 6.3, 0));
  for (const x of [-4.15, 4.15]) castle.add(box(1.7, 4.4, 4, masonry, x, 2.2, 0));
  castle.add(box(13, 7.3, 3.6, masonry, -13.8, 3.65, -.25));
  castle.add(box(13, 7.3, 3.6, masonry, 13.8, 3.65, -.25));
  addDoubleGate(castle, 6.2, 4.1, 2.16);
  const gateLight = new THREE.PointLight(0xffce8c, 22, 15, 2);
  gateLight.position.set(0, 5.6, 7.4);
  castle.add(gateLight);
  for (const x of [-6.4, 6.4]) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.85, 2.05, 12.5, 12), masonry);
    tower.position.set(x, 6.25, 0); tower.castShadow = true; castle.add(tower);
    castle.add(box(4.2, .33, 4.2, castleStone, x, 12.5, 0));
    for (let i = 0; i < 10; i++) {
      const angle = i * Math.PI * 2 / 10;
      const merlon = box(.7, .63, .65, castleStone, x + Math.cos(angle) * 1.7, 13, Math.sin(angle) * 1.7);
      merlon.rotation.y = -angle;
      castle.add(merlon);
    }
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.45, 4.3, 10), mat(0x965347));
    cap.position.set(x, 14.7, 0); cap.castShadow = true; castle.add(cap);
    castle.add(box(.16, 2.4, .16, timber, x, 18.5, 0));
    const flag = box(1.45, .8, .08, mat(0xc56e52), x + 1.01, 19.13, 0);
    flag.rotation.z = -.09; castle.add(flag);
    const slit = box(.1, 1.6, .36, mat(0x534941), x + (x > 0 ? -1.8 : 1.8), 7.1, 1.2);
    castle.add(slit);
  }
  for (let x = -19.4; x <= 19.4; x += 2.1) castle.add(box(.86, .72, 3.9, masonry, x, Math.abs(x) < 5 ? 8.5 : 7.6, -.15));
  for (const x of [-3.25, 3.25]) {
    castle.add(box(.95, 3.1, .13, mat(0xad3f39), x, 6.15, 2.16));
    castle.add(box(1.08, .09, .17, mat(0xe6b66a), x, 7.75, 2.2));
    const crest = new THREE.Mesh(new THREE.IcosahedronGeometry(.28, 0), mat(0xf0cf8e));
    crest.scale.set(.8, 1.3, .2); crest.position.set(x, 6.2, 2.27); castle.add(crest);
  }
  scene.add(castle);
  // The town sits inside a continuous curtain wall. The towers rise above the roofs
  // so the enclosure remains legible while the camera stays at walking height.
  const curtain = new THREE.Group();
  const coping = mat(0x9c9080);
  const slate = mat(0x555e68, .94);
  for (const side of [-1, 1]) {
    for (let z = -52; z <= 42; z += 6) {
      curtain.add(box(2.15, 9.4, 6.05, masonry, side * 19.5, 4.7, z));
      curtain.add(box(2.48, .34, 6.1, coping, side * 19.5, 9.55, z));
      for (let notch = -2; notch <= 2; notch++) {
        if (notch % 2 === 0) curtain.add(box(2.36, .74, .65, masonry, side * 19.5, 10.08, z + notch * 1.05));
      }
      if (z % 18 === 2) curtain.add(box(.09, 1.34, .14, mat(0x463f39), side * 18.36, 6.1, z));
    }
    for (const z of [31, -5, -39]) {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.35, 2.65, 12.7, 14), masonry);
      tower.position.set(side * 19.5, 6.35, z);
      tower.castShadow = true; tower.receiveShadow = true; curtain.add(tower);
      const parapet = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, .44, 14), coping);
      parapet.position.set(side * 19.5, 12.85, z); curtain.add(parapet);
      for (let i = 0; i < 12; i++) {
        const angle = i / 12 * Math.PI * 2;
        curtain.add(box(.7, .8, .77, masonry, side * 19.5 + Math.cos(angle) * 2.38, 13.4, z + Math.sin(angle) * 2.38));
      }
      const roofSeat = new THREE.Mesh(new THREE.CylinderGeometry(2.38, 2.38, 1.1, 14), masonry);
      roofSeat.position.set(side * 19.5, 13.3, z); curtain.add(roofSeat);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(3.05, 3.9, 14), slate);
      roof.position.set(side * 19.5, 15.28, z); roof.castShadow = true; curtain.add(roof);
      for (const slitZ of [-.8, .8]) curtain.add(box(.1, 1.35, .15, mat(0x49413c), side * 17.11, 8.2, z + slitZ));
    }
  }
  for (const side of [-1, 1]) {
    curtain.add(box(2.15, 9.4, 8, masonry, side*19.5, 4.7, -57));
    curtain.add(box(11.1, 9.4, 2.2, masonry, side * 14.1, 4.7, 44));
    curtain.add(box(5.8, 9.4, 2.2, masonry, side * 5.75, 4.7, 44));
  }
  curtain.add(box(5.7, 5, 2.3, masonry, 0, 6.9, 44));
  for (const x of [-3.35,3.35]) curtain.add(box(1, 4.5, 2.3, masonry, x, 2.25, 44));
  addDoubleGate(curtain, 5.55, 4.15, 45.3);
  scene.add(curtain);
  // The painted gate occupies only the central bay of the 3D curtain wall.
  // Its masonry wings, coping and merlons meet the same height as the side walls.
  const gateAtlas = new THREE.TextureLoader().load("/town-images/castle-gate.png");
  gateAtlas.colorSpace = THREE.SRGBColorSpace;
  gateAtlas.anisotropy = 8;
  gateAtlas.wrapS = gateAtlas.wrapT = THREE.ClampToEdgeWrapping;
  gateAtlas.repeat.set(.42, .84);
  gateAtlas.offset.set(.29, 0);
  const gateFace = new THREE.MeshStandardMaterial({ map: gateAtlas, roughness: .96, emissive: 0x5d482e, emissiveMap: gateAtlas, emissiveIntensity: .19 });
  const gateWidth = 11.8;
  for (const [z, streetFace] of [[-59.82, 4], [42.78, 5]]) {
    const gateBay = new THREE.Mesh(new THREE.BoxGeometry(gateWidth, 9.4, .42), [masonry, masonry, masonry, masonry, masonry, masonry]);
    (gateBay.material as THREE.Material[])[streetFace] = gateFace;
    gateBay.position.set(0, 4.7, z);
    gateBay.castShadow = false;
    gateBay.receiveShadow = true;
    scene.add(gateBay);
    for (const side of [-1, 1]) scene.add(box(13.9, 9.4, .46, masonry, side * 12.85, 4.7, z));
    scene.add(box(39.6, .34, .76, coping, 0, 9.55, z));
    for (let x = -19.3; x <= 19.3; x += 2.1) {
      if (Math.abs(x) < gateWidth / 2 - .3) continue;
      scene.add(box(.95, .74, .7, masonry, x, 10.08, z));
    }
  }
  const signTargets: THREE.Mesh[] = [];
  const signLocations = [
    { key: "tavern", label: "Tavern", x: -2.85, z: 13, side: -1 },
    { key: "blacksmith", label: "آهنگری", x: -2.85, z: 3, side: -1 },
    { key: "guild", label: "دوستان و گفتگو", x: 2.85, z: -9, side: 1 },
    { key: "cartography", label: "نقشه‌خانه", x: 2.85, z: -21, side: 1 },
    { key: "market", label: "بازارچه", x: -2.85, z: -21, side: -1 },
    { key: "arena", label: "میدان نبرد", x: 2.85, z: -33, side: 1 },
  ];
  const iron = new THREE.MeshStandardMaterial({ color: 0x322b23, metalness: .75, roughness: .55 });
  for (const sign of signLocations) {
    const frame = new THREE.Group(); frame.position.set(sign.x, 3.85, sign.z);
    // The board hangs clear of the facade; one long iron arm reaches the wall.
    frame.add(box(2.48, .09, .11, iron, sign.side * 1.12, .92, 0));
    frame.add(box(.09, .46, .13, iron, sign.side * 2.3, .68, 0));
    for (const x of [-.58, .58]) {
      for (let i = 0; i < 5; i++) {
        const link = new THREE.Mesh(new THREE.TorusGeometry(.045, .012, 5, 10), iron);
        link.position.set(x, .78 - i * .065, 0); link.rotation.y = (i % 2) * Math.PI / 2;
        frame.add(link);
      }
    }
    frame.add(box(2.45, 1.22, .16, mat(0x513523), 0, 0, 0));
    const canvas = document.createElement("canvas"); canvas.width = 1024; canvas.height = 512;
    const ctx = canvas.getContext("2d")!;
    const grain = ctx.createLinearGradient(0,0,0,512);
    grain.addColorStop(0,"#573b27"); grain.addColorStop(.5,"#38281d"); grain.addColorStop(1,"#513521");
    ctx.fillStyle = grain; ctx.fillRect(0,0,1024,512);
    for (let i=0;i<80;i++) {
      ctx.strokeStyle = i%2 ? "#ffffff08" : "#00000019";
      ctx.beginPath(); ctx.moveTo(0,i*6.5); ctx.bezierCurveTo(300,i*6.5+15,700,i*6.5-12,1024,i*6.5+5); ctx.stroke();
    }
    ctx.strokeStyle="#b99258"; ctx.lineWidth=9; ctx.strokeRect(20,20,984,472);
    ctx.lineWidth=2; ctx.strokeRect(35,35,954,442);
    ctx.fillStyle="#e9c88d"; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.direction="rtl";
    ctx.font='bold 185px "B Nazanin Local", Tahoma, sans-serif';
    ctx.shadowColor="#000"; ctx.shadowBlur=8; ctx.fillText(sign.label,512,265,910);
    for (const x of [55,969]) for (const y of [55,457]) { ctx.beginPath(); ctx.arc(x,y,7,0,Math.PI*2); ctx.fill(); }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy=8;
    const faceMaterial = new THREE.MeshStandardMaterial({map:texture, roughness:.9, emissive:0xe0b377, emissiveMap:texture, emissiveIntensity:.32});
    for (const facing of [-1,1]) {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(2.4,1.17),faceMaterial);
      face.position.z=facing*.086; face.rotation.y=facing<0?Math.PI:0;
      face.userData.landmark=sign.key; signTargets.push(face);
      frame.add(face);
    }
    scene.add(frame);
  }
  const portalTargets: THREE.Mesh[] = [];
  scene.traverse(object => { if (object instanceof THREE.Mesh && object.userData.portalKey) portalTargets.push(object); });
  const loader = new GLTFLoader();
  // Photo-scanned CC0 props provide organic surfaces without primitive stand-ins.
  const scannedProps = [
    { id: "pine_sapling_small", file: "pine_sapling_small_1k.gltf", height: 6.2, radius: .85, spots: [[-12, 35], [12, 34], [-13, 18], [13, 7], [-14, -5], [13, -18], [-11, -37], [11, -38], [-12, -43], [12, -44], [-10, -49], [10, -49], [-8.8, -51], [8.8, -51], [-12.6, 28], [12.4, 24], [-12.8, 8], [12.5, -4], [-12.4, -23], [12.6, -31], [-11.4, -44], [11.7, -41], [-15.2, 31], [15.1, 29], [-15.4, 11], [15.2, 16], [-15.1, -12], [15.4, -10], [-15.1, -29], [15.2, -34], [-13.7, -47], [13.8, -47], [-5.35, 31.25], [5.35, 31.25], [-5.2, -27.1], [5.2, -27.1]] },
    { id: "wine_barrel_01", file: "wine_barrel_01_1k.gltf", height: .85, radius: .43, spots: [[5.3, 18.45], [-5.45, -26.3], [5.45, -25.4], [-5.15, 6.2], [5.35, 7.3], [-5.3, -13.35], [5.4, -17.35], [-5.35, -37.4]] },
    { id: "wooden_crate_01", file: "wooden_crate_01_1k.gltf", height: .62, radius: .44, spots: [[5.4, 19.8], [-5.35, -28.9], [-5.25, -17.25], [5.4, -29.2], [-5.25, 9.65], [5.25, -1.15], [5.3, -17.5], [-5.4, -41.2]] },
  ];
  for (const spec of scannedProps) spec.spots = spec.spots.filter(([x, z]) => reserveGround(x, z, spec.radius));
  let assetsActive = true;
  void Promise.all(scannedProps.map(spec => new Promise<void>(resolve => {
    loader.load(`/town-models/polyhaven/${spec.id}/${spec.file}`, gltf => {
      if (!assetsActive) { resolve(); return; }
      const source = spec.id === "pine_sapling_small" ? gltf.scene.children[1] : gltf.scene;
      if (!source) { resolve(); return; }
      source.traverse(child => {
        if (!(child instanceof THREE.Mesh)) return;
        child.castShadow = true;
        child.receiveShadow = true;
        if (spec.id === "pine_sapling_small") {
          const original = child.material as THREE.MeshStandardMaterial;
          const foliage = original.clone();
          foliage.side = THREE.DoubleSide;
          foliage.emissive.setHex(original.name.includes("twig") ? 0xa8bc98 : 0x4d4134);
          foliage.emissiveMap = original.map;
          foliage.emissiveIntensity = original.name.includes("twig") ? .9 : .12;
          child.material = foliage;
        }
      });
      const bounds = new THREE.Box3().setFromObject(source);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      if (size.y < .001) { resolve(); return; }
      spec.spots.forEach(([x,z], i) => {
        const holder = new THREE.Group(); holder.position.set(x, 0, z); holder.rotation.y=i*1.75;
        const object = source.clone(true);
        object.position.set(-center.x, -bounds.min.y, -center.z);
        holder.scale.setScalar((spec.id === "pine_sapling_small" && Math.abs(x) < 7 ? 3.8 : spec.height) / size.y);
        holder.add(object); scene.add(holder);
      });
      resolve();
    }, undefined, () => resolve());
  })));
  const woodProp = makeTownSurface("oak_wood_planks", 0xb8a08a);
  woodProp.emissive = new THREE.Color(0x59402b);
  woodProp.emissiveMap = woodProp.map;
  woodProp.emissiveIntensity = .15;
  const stoneProp = makeTownSurface("old_sandstone_02", 0xaba6a0);
  const ironProp = new THREE.MeshStandardMaterial({ color: 0x3b3734, metalness: .5, roughness: .78 });
  for (const spec of [
    { file: "merchant-cart.glb", height: 1.2, spots: [[-9.2, 18.15], [7.8, -27.35], [8.7, -39.15]] },
    { file: "rock-wide.glb", height: .75, spots: [[-10.4, -36], [10.4, -48], [-10, 34], [11, 26], [-10.7, 14], [10.8, -13]] },
    { file: "rock-small.glb", height: .42, spots: [[-9.9, -37.1], [10.8, -47.3], [-11, 34.8], [10.3, 26.9], [-10.2, 13.3], [10.5, -13.7]] },
  ]) {
    loader.load(`/town-models/${spec.file}`, gltf => {
      if (!assetsActive) return;
      const source = gltf.scene;
      source.traverse(child => {
        if (!(child instanceof THREE.Mesh)) return;
        child.material = spec.file.includes("rock") ? stoneProp : child.name.includes("axle") || child.name.includes("wheel rim") ? ironProp : woodProp;
        child.castShadow = true;
        child.receiveShadow = true;
      });
      const bounds = new THREE.Box3().setFromObject(source);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      if (size.y < .001) return;
      spec.spots.forEach(([x, z], index) => {
        const holder = new THREE.Group();
        holder.position.set(x, .015, z);
        holder.rotation.y = index * 1.48 + .45;
        holder.scale.setScalar(spec.height / size.y);
        const object = source.clone(true);
        object.position.set(-center.x, -bounds.min.y, -center.z);
        holder.add(object);
        scene.add(holder);
      });
    });
  }
  const sheepTargets: THREE.Object3D[] = [];
  const sheepBillboards: THREE.Mesh[] = [];
  const sheepBleat = new Audio("/audio/sheep-bleat-loud.mp3?v=2");
  sheepBleat.volume = 1;
  const sheepTexture = new THREE.TextureLoader().load("/town-images/sheep-cutout.png");
  sheepTexture.colorSpace = THREE.SRGBColorSpace;
  sheepTexture.anisotropy = 8;
  const sheepMaterial = new THREE.MeshBasicMaterial({ map: sheepTexture, transparent: true, alphaTest: .16, depthWrite: true, side: THREE.DoubleSide, toneMapped: true });
  [[-5.55, -1.8], [-6.35, -3.65], [-5.45, -5.3]].forEach(([x, z], index) => {
    const height = index === 1 ? 1.13 : 1.02;
    const sheep = new THREE.Mesh(new THREE.PlaneGeometry(height * 1.27, height), sheepMaterial);
    sheep.position.set(x, height / 2 + .025, z);
    sheep.userData.sheep = true;
    scene.add(sheep);
    sheepTargets.push(sheep);
    sheepBillboards.push(sheep);
  });
  const resize = () => { const width = host.clientWidth, height = host.clientHeight; if (!width || !height) return; camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width,height,false); };
  const observer = new ResizeObserver(resize); observer.observe(host); resize();
  let stage = 0, target = 0, pointerX = 0, pointerY = 0, disposed = false, frame = 0;
  let freeWalk = false, walkX = camera.position.x, walkZ = camera.position.z;
  let velocityX = 0, velocityZ = 0, bobPhase = 0, bobStrength = 0;
  let lastWalkEmitted = 0;
  let yaw = 0, yawTarget = 0, pitchTarget = 0, dragging = false, dragX = 0, dragY = 0, dragTravel = 0;
  let entrance: { key: string; started: number; from: THREE.Vector3; to: THREE.Vector3; fromRotation: THREE.Quaternion; toRotation: THREE.Quaternion; hinge?: THREE.Group; facing: number; covered: boolean; sent: boolean } | null = null;
  const entryKeys = ["gate", "tavern", "play", "guild", "cartography", "market", "arena"];
  const beginEntrance = (key: string) => {
    if (entrance) return;
    const door = portalTargets.find(mesh => mesh.userData.portalKey === key);
    const position = door?.getWorldPosition(new THREE.Vector3()) ?? new THREE.Vector3(key === "gate" ? 0 : key === "play" ? -.8 : 0, 1.75, key === "gate" ? 45.3 : key === "play" ? -4.5 : -43);
    const facing = (door?.userData.portalFacing as number | undefined) ?? 0;
    const to = door ? new THREE.Vector3(position.x-facing*.85, 1.75, position.z) : new THREE.Vector3(position.x, 1.75, position.z+(key === "gate" ? -1.8 : 3.2));
    const look = door ? new THREE.Vector3(position.x-facing*3.2, 1.75, position.z) : position;
    const endingCamera = camera.clone(); endingCamera.position.copy(to); endingCamera.lookAt(look);
    entrance = { key, started: performance.now(), from: camera.position.clone(), to, fromRotation: camera.quaternion.clone(), toRotation: endingCamera.quaternion.clone(), hinge: door?.userData.portalHinge as THREE.Group | undefined, facing, covered: false, sent: false };
    freeWalk = false; pressed.clear();
  };
  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || !(event.target instanceof HTMLCanvasElement)) return;
    dragging = true; dragX = event.clientX; dragY = event.clientY; dragTravel = 0;
  };
  const onPointerDrag = (event: PointerEvent) => {
    if (!dragging) {
      if (event.target === renderer.domElement) {
        const rect=host.getBoundingClientRect();
        raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),camera);
        renderer.domElement.style.cursor=raycaster.intersectObjects([...portalTargets,...signTargets,...sheepTargets],false).length ? "pointer" : "grab";
      }
      return;
    }
    dragTravel += Math.hypot(event.clientX-dragX,event.clientY-dragY);
    yawTarget -= (event.clientX - dragX) * .004;
    pitchTarget = THREE.MathUtils.clamp(pitchTarget - (event.clientY - dragY) * .003, -.65, .65);
    dragX = event.clientX; dragY = event.clientY;
  };
  const raycaster = new THREE.Raycaster();
  const onPointerUp = (event: PointerEvent) => {
    if (dragging && dragTravel < 7) {
      const rect = host.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),camera);
      const hit = raycaster.intersectObjects([...portalTargets,...signTargets,...sheepTargets],false)[0];
      if (hit?.object.userData.portalKey) beginEntrance(hit.object.userData.portalKey);
      else if (hit?.object.userData.landmark) beginEntrance(hit.object.userData.landmark);
      else if (hit?.object.userData.sheep) { sheepBleat.currentTime = 0; void sheepBleat.play(); }
    }
    dragging = false;
  };
  window.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerDrag);
  window.addEventListener("pointerup", onPointerUp);
  const pressed = new Set<string>();
  const walkKeys = new Set(["w", "a", "s", "d"]);
  const onKeyDown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (!walkKeys.has(key) || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target instanceof Element && event.target.closest("input,textarea,select,[contenteditable='true'],[data-social-dock]")) return;
    event.preventDefault();
    if (!freeWalk) { walkX = camera.position.x; walkZ = camera.position.z; velocityX = 0; velocityZ = 0; freeWalk = true; }
    pressed.add(key);
  };
  const onKeyUp = (event: KeyboardEvent) => { pressed.delete(event.key.toLowerCase()); };
  const onBlur = () => { pressed.clear(); dragging = false; };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  const clock = new THREE.Clock();
  const render = () => {
    if (disposed) return;
    frame = requestAnimationFrame(render);
    const delta = Math.min(clock.getDelta(), .05);
    const elapsed = clock.elapsedTime;
    const t = 1 - Math.exp(-delta * 2.3);
    stage += (target - stage) * t;
    const lower = Math.floor(stage), upper = Math.min(TOWN_STOPS.length - 1, lower + 1), blend = stage - lower;
    const from = TOWN_STOPS[Math.max(0, lower)], to = TOWN_STOPS[upper];
    if (entrance) {
      const progress=THREE.MathUtils.clamp((performance.now()-entrance.started)/1050,0,1);
      const ease=progress*progress*(3-2*progress);
      camera.position.lerpVectors(entrance.from,entrance.to,ease);
      camera.quaternion.copy(entrance.fromRotation).slerp(entrance.toRotation,ease);
      if (entrance.hinge) entrance.hinge.rotation.y=-entrance.facing*1.25*THREE.MathUtils.smoothstep(progress,.22,.8);
      if (progress >= .48 && !entrance.covered && entrance.key !== "guild") {
        entrance.covered = true;
        onTransitionStart?.(entrance.key);
      }
      if (progress>=1 && !entrance.sent) {
        entrance.sent=true;
        const key=entrance.key;
        onEnter?.(key);
        if (key === "guild") entrance=null;
      }
    } else if (freeWalk) {
      let inputX = Number(pressed.has("d")) - Number(pressed.has("a"));
      let inputZ = Number(pressed.has("s")) - Number(pressed.has("w"));
      const length = Math.hypot(inputX, inputZ) || 1;
      inputX /= length; inputZ /= length;
      const localX = inputX, localZ = inputZ;
      inputX = localX * Math.cos(yaw) - localZ * Math.sin(yaw);
      inputZ = localX * Math.sin(yaw) + localZ * Math.cos(yaw);
      const smoothing = 1 - Math.exp(-delta * 8);
      velocityX += (inputX * 4.4 - velocityX) * smoothing;
      velocityZ += (inputZ * 4.4 - velocityZ) * smoothing;
      walkX = THREE.MathUtils.clamp(walkX + velocityX * delta, -3.45, 3.45);
      walkZ = THREE.MathUtils.clamp(walkZ + velocityZ * delta, -32, 33);
      const nearest = TOWN_STOPS.reduce((best, stop, index) => Math.abs(stop.z - walkZ) < Math.abs(TOWN_STOPS[best].z - walkZ) ? index : best, 0);
      if (nearest !== lastWalkEmitted) { lastWalkEmitted = nearest; target = nearest; onWalkStage?.(nearest); }
      const speed = Math.hypot(velocityX, velocityZ);
      bobStrength += ((speed / 4.4) - bobStrength) * (1 - Math.exp(-delta * 6));
      bobPhase += speed * delta * 2.05;
      const bob = Math.sin(bobPhase) * .055 * bobStrength;
      camera.position.x += (walkX + pointerX * .15 - camera.position.x) * (1 - Math.exp(-delta * 11));
      camera.position.z += (walkZ - camera.position.z) * (1 - Math.exp(-delta * 11));
      camera.position.y = 1.8 + bob;
      yaw += (yawTarget + pointerX * .36 - yaw) * (1 - Math.exp(-delta * 7));
      camera.lookAt(camera.position.x + Math.sin(yaw) * 12, camera.position.y + Math.sin(pitchTarget - pointerY * .25 - .025) * 12, camera.position.z - Math.cos(yaw) * 12);
    } else {
      bobStrength = 0;
      const sceneX = THREE.MathUtils.lerp(from.x,to.x,blend) + pointerX * .25;
      const sceneZ = THREE.MathUtils.lerp(from.z,to.z,blend);
      camera.position.x += (sceneX - camera.position.x) * (1 - Math.exp(-delta * 8));
      camera.position.z += (sceneZ - camera.position.z) * (1 - Math.exp(-delta * 8));
      camera.position.y += (1.8 - camera.position.y) * (1 - Math.exp(-delta * 8));
      const routeYaw = Math.atan2(THREE.MathUtils.lerp(from.lookX,to.lookX,blend) - camera.position.x, camera.position.z - THREE.MathUtils.lerp(from.lookZ,to.lookZ,blend));
      yaw += (routeYaw + yawTarget + pointerX * .36 - yaw) * (1 - Math.exp(-delta * 7));
      camera.lookAt(camera.position.x + Math.sin(yaw) * 12, camera.position.y + Math.sin(pitchTarget - pointerY * .25 - .025) * 12, camera.position.z - Math.cos(yaw) * 12);
    }
    camera.updateMatrixWorld();

    sheepBillboards.forEach(sheep => sheep.lookAt(camera.position.x, sheep.position.y, camera.position.z));

    cloudClusters.forEach((cloud, i) => { cloud.position.x += delta * (.13 + i * .035); if (cloud.position.x > 43) cloud.position.x = -43; });
    birds.forEach((flyer, i) => {
      flyer.position.x += delta * (1.55 + (i % 4) * .23);
      flyer.position.y = (flyer.userData.baseAltitude as number) + Math.sin(elapsed * .9 + i) * .3;
      if (flyer.position.x > 38) flyer.position.x = -42 - (i % 4) * 4;
      (flyer.userData.wings as THREE.Mesh[]).forEach((wing, side) => { wing.rotation.z = (side ? -1 : 1) * Math.sin(elapsed * 6.2 + i) * .38; });
    });
    flames.forEach(flame => { (flame.userData.flameMaterial as THREE.ShaderMaterial).uniforms.time.value = elapsed; });
    waterMaterial.uniforms.time.value = elapsed;
    droplets.forEach(({mesh, curve, offset}) => { const t=(elapsed*.8+offset)%1; mesh.position.copy(curve.getPoint(t)); mesh.scale.setScalar(.7+.35*t); });
    splashRings.forEach(({mesh,phase}) => { const cycle=(elapsed*.9+phase)%1; mesh.scale.setScalar(1+cycle*3); (mesh.material as THREE.MeshBasicMaterial).opacity=.22*(1-cycle); });
    renderer.render(scene,camera);
  };
  render();
  return {
    setStage(value: number) {
      if (entrance) return;
      target = THREE.MathUtils.clamp(value,0,TOWN_STOPS.length-1);
      if (freeWalk && target === lastWalkEmitted) return;
      freeWalk = false; pressed.clear(); yawTarget = 0; pitchTarget = 0;
    },
    enterStage(value: number) { beginEntrance(entryKeys[Math.max(0,Math.min(entryKeys.length-1,value))]); },
    getCameraPosition() { return { x: camera.position.x, z: camera.position.z }; },
    setPointer(x: number,y: number) { pointerX = x; pointerY = y; },
    dispose() {
      disposed = true; assetsActive = false; sheepBleat.pause(); cancelAnimationFrame(frame); observer.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerDrag);
      window.removeEventListener("pointerup", onPointerUp);
      scene.traverse(child => { if (child instanceof THREE.Mesh) { child.geometry.dispose(); const materials = Array.isArray(child.material) ? child.material : [child.material]; materials.forEach(m => m.dispose()); } });
      skyTexture.dispose();
      cloudMap.dispose();
      renderer.dispose(); renderer.domElement.remove();
    },
  };
}
