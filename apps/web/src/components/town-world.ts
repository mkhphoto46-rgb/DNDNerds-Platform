import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { makeVillageBuilding, createBrickTexture } from "./town-architecture";

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

function villageTree(x: number, z: number, size: number, seed: number) {
  const tree = new THREE.Group();
  tree.position.set(x, 0, z);
  const bark = mat(0x625643);
  const leaves = [mat(0x4e6450), mat(0x5b7156), mat(0x687959), mat(0x576952)];
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.16, .32, size * .58, 9), bark);
  trunk.position.y = size * .29; trunk.castShadow = true; tree.add(trunk);
  for (let i = 0; i < 8; i++) {
    const angle = i * 2.399 + seed;
    const reach = size * (.2 + i % 3 * .035);
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(.035, .1, reach * 1.4, 7), bark);
    branch.position.set(Math.cos(angle) * reach * .43, size * (.43 + i % 3 * .09), Math.sin(angle) * reach * .43);
    branch.rotation.z = Math.cos(angle) * .65;
    branch.rotation.x = -Math.sin(angle) * .65;
    branch.castShadow = true; tree.add(branch);
    const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(size * (.2 + i % 3 * .025), 2), leaves[(i + seed) % leaves.length]);
    canopy.position.set(Math.cos(angle) * reach, size * (.62 + i % 3 * .12), Math.sin(angle) * reach);
    canopy.scale.set(1.2, .8 + i % 2 * .12, .98);
    canopy.castShadow = true; canopy.receiveShadow = true; tree.add(canopy);
  }
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(size * .24, 2), leaves[seed % leaves.length]);
  crown.position.y = size * .91; crown.castShadow = true; tree.add(crown);
  return tree;
}

function person(color: number, x: number, z: number) {
  const group = new THREE.Group(); group.position.set(x, 0, z);
  const cloth = mat(color), trousers = mat(0x49443e), leather = mat(0x49382c);
  const skin = mat(0xb99276), hair = mat(0x48382d);
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, px: number, py: number, pz: number) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(px, py, pz);
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
  };
  const torso = add(new THREE.CapsuleGeometry(.22, .34, 5, 12), cloth, 0, 1.15, 0);
  torso.scale.set(1, 1, .65);
  add(new THREE.CylinderGeometry(.21, .29, .46, 14), cloth, 0, .84, 0);
  add(new THREE.CylinderGeometry(.215, .22, .055, 14), leather, 0, 1.01, 0);
  add(new THREE.CylinderGeometry(.065, .075, .14, 10), skin, 0, 1.49, 0);
  const head = add(new THREE.SphereGeometry(.155, 16, 12), skin, 0, 1.66, 0);
  head.scale.set(.91, 1.19, .96);
  add(new THREE.SphereGeometry(.165, 14, 10, 0, Math.PI * 2, 0, Math.PI * .55), hair, 0, 1.71, .01);
  add(new THREE.SphereGeometry(.039, 8, 6), skin, 0, 1.65, -.145).scale.set(.7, 1.3, 1);
  for (const side of [-1, 1]) add(new THREE.SphereGeometry(.036, 8, 6), skin, side * .143, 1.66, 0);
  const legs: THREE.Group[] = [], arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(side * .115, .83, 0);
    const trouser = new THREE.Mesh(new THREE.CapsuleGeometry(.086, .52, 4, 10), trousers);
    trouser.position.y = -.31; trouser.castShadow = true; leg.add(trouser);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(.16, .15, .28), leather);
    boot.position.set(0, -.73, -.035); boot.castShadow = true; leg.add(boot);
    group.add(leg); legs.push(leg);
    const arm = new THREE.Group(); arm.position.set(side * .245, 1.36, 0);
    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(.073, .38, 4, 10), cloth);
    sleeve.position.set(side * .025, -.22, 0); sleeve.castShadow = true; arm.add(sleeve);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(.068, 10, 8), skin);
    hand.scale.set(.7, 1.2, .75); hand.position.set(side * .025, -.49, 0); hand.castShadow = true; arm.add(hand);
    group.add(arm); arms.push(arm);
  }
  add(new THREE.BoxGeometry(.3, .38, .15), leather, 0, 1.15, .18);
  for (const side of [-1, 1]) add(new THREE.BoxGeometry(.035, .44, .04), leather, side * .14, 1.21, -.155);
  group.userData.origin = { x, z }; group.userData.legs = legs; group.userData.arms = arms;
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

export async function createTownWorld(host: HTMLElement, markers: Record<string, HTMLButtonElement | null> = {}, onWalkStage?: (stage: number) => void) {
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
  for (const [x, y, z, size] of [[-24, 19, -37, 1.1], [18, 19, -40, 1.25], [-7, 24, -74, 1.45], [31, 23, -70, 1.2], [-35, 25, -78, 1.3]]) {
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
  const birds = [0, 1, 2, 3].map(i => {
    const flyer = bird();
    flyer.position.set(-19 - i * 10, 18 + i * 1.6, -29 - i * 7);
    flyer.scale.setScalar(.7 + i * .1);
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
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(190, 190), mat(0x4b5547));
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
      const kind = side === -1 && i === 1 ? "tavern" : side === 1 && i === 3 ? "guild" : side === 1 && i === 4 ? "cartography" : side === -1 && i === 4 ? "shop" : "cottage";
      scene.add(makeVillageBuilding(side, z, i + (side === 1 ? 2 : 0), kind));
    });
  }
  const leafColors = [0x57744d,0x647e57,0x789165,0x667b50,0x4d6950];
  for (const side of [-1,1] as const) {
    for (const [i,z] of [27,17,7,-3,-13,-23,-33].entries()) {
      const planter = box(.62,.45,1.5,mat(0x9a653e),side*5.3,.23,z);
      scene.add(planter);
      for (let j=0;j<6;j++) {
        const bloom = new THREE.Mesh(new THREE.IcosahedronGeometry(.17,1),mat(leafColors[(i+j)%leafColors.length]));
        bloom.position.set(side*5.3 + (j%2-.5)*.35,.56 + (j%3)*.1,z+(j-2.5)*.22);
        bloom.scale.set(1, .62, 1.3);
        scene.add(bloom);
      }
    }
  }
  const square = new THREE.Mesh(new THREE.CircleGeometry(11, 48), mat(0xc5b49a));
  square.rotation.x = -Math.PI / 2; square.position.set(0, .015, -3); square.receiveShadow = true; scene.add(square);
  const fountainBase = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, .55, 24), mat(0xc8c6ae));
  fountainBase.position.set(-.8, .38, -4.5); fountainBase.castShadow = true; scene.add(fountainBase);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(2.04, 2.04, .06, 24), new THREE.MeshStandardMaterial({ color: 0x73b7bd, metalness: .18, roughness: .2 }));
  water.position.set(-.8, .69, -4.5); scene.add(water);
  const fountainTop = new THREE.Mesh(new THREE.CylinderGeometry(.43, .7, 1.7, 12), mat(0xdfd7be));
  fountainTop.position.set(-.8, 1.52, -4.5); scene.add(fountainTop);
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
  const brickMap = createBrickTexture(0x88654f);
  brickMap.repeat.set(2, 3);
  const masonry = new THREE.MeshStandardMaterial({ map: brickMap, bumpMap: brickMap, bumpScale: .085, roughness: .98 });
  const castleStone = mat(0xbeb7a0);
  castle.add(box(10, 8.2, 4, masonry, 0, 4.1, 0));
  castle.add(box(13, 7.3, 3.6, masonry, -13.8, 3.65, -.25));
  castle.add(box(13, 7.3, 3.6, masonry, 13.8, 3.65, -.25));
  castle.add(box(3.2, 4.4, .2, mat(0x483d36), 0, 2.2, 2.13));
  castle.add(box(2.7, 3.7, .26, mat(0x916445), 0, 1.85, 2.28));
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
  for (const side of [-1, 1]) curtain.add(box(11.1, 9.4, 2.2, masonry, side * 14.1, 4.7, 44));
  scene.add(curtain);
  const signTargets: THREE.Mesh[] = [];
  const signLocations = [
    { key: "tavern", label: "میخانه", x: -3.95, z: 13, side: -1 },
    { key: "guild", label: "تالار همراهان", x: 3.95, z: -9, side: 1 },
    { key: "cartography", label: "نقشه‌سازی", x: 3.95, z: -21, side: 1 },
    { key: "market", label: "بازارچه", x: -3.95, z: -21, side: -1 },
    { key: "arena", label: "میدان نبرد", x: 3.95, z: -33, side: 1 },
  ];
  const iron = new THREE.MeshStandardMaterial({ color: 0x322b23, metalness: .75, roughness: .55 });
  for (const sign of signLocations) {
    const frame = new THREE.Group(); frame.position.set(sign.x, 4.25, sign.z);
    // Bracket reaches into the facade; two chains carry a solid wooden board.
    frame.add(box(1.7, .10, .12, iron, sign.side * .43, .92, 0));
    frame.add(box(.10, .8, .18, iron, sign.side * 1.23, .59, 0));
    for (const x of [-.58, .58]) {
      for (let i = 0; i < 5; i++) {
        const link = new THREE.Mesh(new THREE.TorusGeometry(.045, .012, 5, 10), iron);
        link.position.set(x, .78 - i * .065, 0); link.rotation.y = (i % 2) * Math.PI / 2;
        frame.add(link);
      }
    }
    frame.add(box(1.9, .95, .16, mat(0x513523), 0, 0, 0));
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
    ctx.font='bold 132px "B Nazanin Local", Tahoma, sans-serif';
    ctx.shadowColor="#000"; ctx.shadowBlur=8; ctx.fillText(sign.label,512,265,910);
    for (const x of [55,969]) for (const y of [55,457]) { ctx.beginPath(); ctx.arc(x,y,7,0,Math.PI*2); ctx.fill(); }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy=8;
    const faceMaterial = new THREE.MeshStandardMaterial({map:texture, roughness:.9, emissive:0xe0b377, emissiveMap:texture, emissiveIntensity:.32});
    for (const facing of [-1,1]) {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(1.86,.91),faceMaterial);
      face.position.z=facing*.086; face.rotation.y=facing<0?Math.PI:0;
      face.userData.landmark=sign.key; frame.add(face); signTargets.push(face);
    }
    scene.add(frame);
  }
  const people = [[-3,16,0x56695e],[3,11,0x8b6756],[-2,2,0x64758b],[2,-6,0x948061],[-3,-14,0x706879],[3,-23,0x727f68]].map(([x,z,color]) => person(color,x,z));
  people.forEach(p => scene.add(p));
  [[-12,31,6,1],[12,26,6.5,2],[-12,5,6.2,3],[12,-5,6.8,4],[-12,-24,6.4,5],[12,-36,6.1,6],[-5.5,-2,3.4,7],[5.6,9,3.5,8]].forEach(([x,z,size,seed]) => scene.add(villageTree(x,z,size,seed)));
  const loader = new GLTFLoader();
  const modelNames = ["stall-red", "stall-green", "cart", "lantern", "rock-small"];
  await Promise.all(modelNames.map(name => new Promise<void>(resolve => {
    loader.load(`/town-models/${name}.glb`, gltf => {
      const object = gltf.scene;
      object.traverse(child => { if (child instanceof THREE.Mesh) { child.castShadow = true; child.receiveShadow = true; } });
      const place = (x: number, z: number, scale: number, rotation = 0) => { const clone = object.clone(true); clone.position.set(x, 0, z); clone.scale.setScalar(scale); clone.rotation.y = rotation; scene.add(clone); };
      if (name.startsWith("stall")) {
        for (const [x,z] of name === "stall-red" ? [[-5,-15],[-5,-20]] : [[5,-25],[5,-31]]) place(x,z,3.2, x > 0 ? -Math.PI / 2 : Math.PI / 2);
      } else if (name === "cart") place(-4.8,14,2.2,.35);
      else if (name === "lantern") for (const z of [25,14,4,-10,-23]) { place(-4.8,z,3); place(4.8,z-3,3); }
      else if (name === "rock-small") for (const [x,z] of [[-11,9],[11,0],[-11,-28],[10,-36]]) place(x,z,3);
      resolve();
    }, undefined, () => resolve());
  })));
  const resize = () => { const width = host.clientWidth, height = host.clientHeight; if (!width || !height) return; camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width,height,false); };
  const observer = new ResizeObserver(resize); observer.observe(host); resize();
  let stage = 0, target = 0, pointerX = 0, pointerY = 0, disposed = false, frame = 0;
  let freeWalk = false, walkX = camera.position.x, walkZ = camera.position.z;
  let velocityX = 0, velocityZ = 0, bobPhase = 0, bobStrength = 0;
  let lastWalkEmitted = 0;
  let yaw = 0, yawTarget = 0, pitchTarget = 0, dragging = false, dragX = 0, dragY = 0, dragTravel = 0;
  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || !(event.target instanceof HTMLCanvasElement)) return;
    dragging = true; dragX = event.clientX; dragY = event.clientY; dragTravel = 0;
  };
  const onPointerDrag = (event: PointerEvent) => {
    if (!dragging) return;
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
      const hit = raycaster.intersectObjects(signTargets,false)[0];
      if (hit) markers[hit.object.userData.landmark]?.click();
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
    const t = 1 - Math.exp(-delta * 2.3);
    stage += (target - stage) * t;
    const lower = Math.floor(stage), upper = Math.min(TOWN_STOPS.length - 1, lower + 1), blend = stage - lower;
    const from = TOWN_STOPS[Math.max(0, lower)], to = TOWN_STOPS[upper];
    if (freeWalk) {
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
    const elapsed = clock.elapsedTime;

    people.forEach((p,i) => {
      const origin = p.userData.origin as { x: number; z: number };
      p.position.x = origin.x + Math.sin(elapsed * .2 + i * 2.1) * .55;
      p.position.z = origin.z + Math.cos(elapsed * .2 + i * 2.1) * .55;
      p.position.y = Math.abs(Math.sin(elapsed * 2.2 + i)) * .012;
      p.rotation.y = Math.sin(elapsed * .28 + i) * .22;
      (p.userData.legs as THREE.Group[]).forEach((leg, side) => { leg.rotation.x = Math.sin(elapsed * 2.2 + i + side * Math.PI) * .22; });
      (p.userData.arms as THREE.Group[]).forEach((arm, side) => { arm.rotation.x = -Math.sin(elapsed * 2.2 + i + side * Math.PI) * .16; });
    });
    cloudClusters.forEach((cloud, i) => { cloud.position.x += delta * (.13 + i * .035); if (cloud.position.x > 43) cloud.position.x = -43; });
    birds.forEach((flyer, i) => {
      flyer.position.x += delta * (1.7 + i * .22);
      flyer.position.y = 18 + i * 1.6 + Math.sin(elapsed * .9 + i) * .3;
      if (flyer.position.x > 38) flyer.position.x = -42 - i * 5;
      (flyer.userData.wings as THREE.Mesh[]).forEach((wing, side) => { wing.rotation.z = (side ? -1 : 1) * Math.sin(elapsed * 6.2 + i) * .38; });
    });
    flames.forEach(flame => { (flame.userData.flameMaterial as THREE.ShaderMaterial).uniforms.time.value = elapsed; });
    water.rotation.y += delta * .05;
    renderer.render(scene,camera);
  };
  render();
  return {
    setStage(value: number) {
      target = THREE.MathUtils.clamp(value,0,TOWN_STOPS.length-1);
      if (freeWalk && target === lastWalkEmitted) return;
      freeWalk = false; pressed.clear(); yawTarget = 0; pitchTarget = 0;
    },
    setPointer(x: number,y: number) { pointerX = x; pointerY = y; },
    dispose() {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerDrag);
      window.removeEventListener("pointerup", onPointerUp);
      scene.traverse(child => { if (child instanceof THREE.Mesh) { child.geometry.dispose(); const materials = Array.isArray(child.material) ? child.material : [child.material]; materials.forEach(m => { if (m instanceof THREE.MeshStandardMaterial) m.map?.dispose(); m.dispose(); }); } });
      skyTexture.dispose();
      cloudMap.dispose();
      renderer.dispose(); renderer.domElement.remove();
    },
  };
}
