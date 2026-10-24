import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type Kind = "cottage" | "tavern" | "guild" | "shop" | "cartography" | "blacksmith";

const material = (color: number, roughness = 1) => new THREE.MeshStandardMaterial({ color, roughness });
const wood = material(0x684b3b);
const paleWood = material(0xa47a54);
const darkWood = material(0x3d352f);
const stone = material(0xb2ac96);
const brass = new THREE.MeshStandardMaterial({ color: 0xe9be72, metalness: .55, roughness: .38 });
const windowGlow = new THREE.MeshStandardMaterial({ color: 0xe6bd85, emissive: 0xe49b51, emissiveIntensity: 1.8, roughness: .42 });
const wallColors = [0xdacbb2, 0xd6c7b1, 0xd5bea5, 0xcbd0c1, 0xdac9b7, 0xd0c9b8];
const roofColors = ["#805447", "#445967", "#9a604a", "#50646a", "#70535a", "#776653"];

const surfaceCache = new Map<string, { diffuse: THREE.Texture; normal: THREE.Texture; rough: THREE.Texture }>();
export function makeTownSurface(id: "medieval_red_brick" | "castle_brick_01" | "clay_roof_tiles" | "old_sandstone_02" | "oak_wood_planks", tint = 0xffffff) {
  let maps = surfaceCache.get(id);
  if (!maps) {
    const loader = new THREE.TextureLoader();
    const load = (suffix: string) => {
      const map = loader.load(`/town-textures/${id}/${id}_${suffix}_1k.jpg`);
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(1, 1);
      map.anisotropy = 8;
      return map;
    };
    maps = { diffuse: load("diff"), normal: load("nor_gl"), rough: load("rough") };
    maps.diffuse.colorSpace = THREE.SRGBColorSpace;
    surfaceCache.set(id, maps);
  }
  return new THREE.MeshStandardMaterial({ map: maps.diffuse, normalMap: maps.normal, normalScale: new THREE.Vector2(.42,.42), roughnessMap: maps.rough, color: tint, roughness: 1 });
}

export function createBrickTexture(base = 0x8f6751) {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1024;
  const c = canvas.getContext("2d")!;
  c.fillStyle = "#6b6258"; c.fillRect(0, 0, 1024, 1024);
  let seed = base; const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let row = 0; row < 16; row++) for (let col = -1; col < 9; col++) {
    const x = col * 128 + (row % 2) * 64, y = row * 64;
    const color = new THREE.Color(base).offsetHSL((random()-.5)*.025, (random()-.5)*.1, (random()-.5)*.14);
    c.fillStyle = `#${color.getHexString()}`;
    c.beginPath(); c.roundRect(x+3+random()*2,y+3,121,57,3); c.fill();
    c.fillStyle = "rgba(243,220,185,.16)"; c.fillRect(x+5,y+4,115,2);
    c.fillStyle = "rgba(25,19,16,.28)"; c.fillRect(x+4,y+58,119,3);
    for(let grain=0;grain<100;grain++){
      c.fillStyle = random()>.5 ? "rgba(245,218,181,.10)" : "rgba(35,24,19,.13)";
      c.fillRect(x+5+random()*114,y+6+random()*49,1+random()*4,1+random()*2);
    }
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8; texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

let wallMaterials: THREE.MeshStandardMaterial[] | null = null;
function getWallMaterials() {
  wallMaterials ??= wallColors.map((_, index) => makeTownSurface(index % 3 === 1 ? "castle_brick_01" : "medieval_red_brick", [0xffffff,0xded8ca,0xe9dbc8,0xdbdbd2,0xf1e4d8,0xd6d0c6][index]));
  return wallMaterials;
}

const facadeTextures = new Map<string, THREE.Texture>();
let sideTexture: THREE.Texture | null = null;
let towerTexture: THREE.Texture | null = null;
const towerLoader = new GLTFLoader();
function getFacadeMaterial(index: number, kind: Kind) {
  const variant = kind === "cottage" ? (index % 3 === 0 ? "townhouse" : index % 3 === 1 ? "tavern" : "cartography") : kind;
  let facadeTexture = facadeTextures.get(variant);
  if (!facadeTexture) {
    facadeTexture = new THREE.TextureLoader().load(`/town-images/${variant}-facade.png`);
    facadeTexture.colorSpace = THREE.SRGBColorSpace;
    facadeTexture.anisotropy = 8;
    facadeTextures.set(variant, facadeTexture);
  }
  const tint = [0xffffff, 0xf1e8df, 0xe9e6df, 0xf4eee6][index % 4];
  return new THREE.MeshStandardMaterial({
    map: facadeTexture,
    color: tint,
    roughness: .95,
    emissive: 0x8b5f35,
    emissiveMap: facadeTexture,
    emissiveIntensity: .32,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
}

function getSideMaterial(index: number) {
  if (!sideTexture) {
    sideTexture = new THREE.TextureLoader().load("/town-images/townhouse-side.png");
    sideTexture.colorSpace = THREE.SRGBColorSpace;
    sideTexture.anisotropy = 8;
  }
  return new THREE.MeshStandardMaterial({
    map: sideTexture,
    color: [0xffffff, 0xf1e8df, 0xe9e6df, 0xf4eee6][index % 4],
    roughness: .95,
    emissive: 0x795633,
    emissiveMap: sideTexture,
    emissiveIntensity: .19,
  });
}

function getTowerStoneMaterial() {
  if (!towerTexture) {
    towerTexture = new THREE.TextureLoader().load("/town-images/cartography-tower-stone.png");
    towerTexture.colorSpace = THREE.SRGBColorSpace;
    towerTexture.anisotropy = 8;
  }
  return new THREE.MeshStandardMaterial({ map: towerTexture, roughness: .95, side: THREE.DoubleSide });
}

function block(group: THREE.Group, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, shadows = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function beam(group: THREE.Group, from: THREE.Vector3, to: THREE.Vector3, thickness: number, mat: THREE.Material) {
  const delta = to.clone().sub(from);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(thickness, delta.length(), thickness), mat);
  mesh.position.copy(from).addScaledVector(delta, .5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  mesh.castShadow = true;
  group.add(mesh);
}

function roofTexture(base: string) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);
  const tone = new THREE.Color(base);
  for (let row = 0; row < 16; row++) {
    for (let col = -1; col < 12; col++) {
      const x = col * 49 + (row % 2) * 24;
      const y = row * 33;
      const variation = Math.sin(col * 15.4 + row * 7.3) * .055;
      const tile = tone.clone().offsetHSL(0, 0, variation);
      ctx.fillStyle = `#${tile.getHexString()}`;
      ctx.beginPath();
      ctx.roundRect(x + 1, y + 1, 47, 35, [3, 3, 9, 9]);
      ctx.fill();
      ctx.strokeStyle = "#342b25";
      ctx.globalAlpha = .22;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#fff2ce";
      ctx.globalAlpha = .1;
      ctx.fillRect(x + 5, y + 4, 34, 2);
      ctx.globalAlpha = 1;
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

let roofMaterials: THREE.MeshStandardMaterial[] | null = null;
let roofUnderside: THREE.MeshStandardMaterial | null = null;
function getRoofUnderside() {
  roofUnderside ??= makeTownSurface("oak_wood_planks", 0x9a785b);
  return roofUnderside;
}
function getRoofMaterials() {
  roofMaterials ??= roofColors.map(color => { const roof=makeTownSurface("clay_roof_tiles", new THREE.Color(color).lerp(new THREE.Color(0xffffff), .66).getHex()); roof.side=THREE.DoubleSide; roof.emissive = new THREE.Color(0x594035); roof.emissiveMap = roof.map; roof.emissiveIntensity = .13; return roof; });
  return roofMaterials;
}

function slopedRoof(group: THREE.Group, width: number, depth: number, eave: number, rise: number, mat: THREE.Material, tileColor: string) {
  const w = width / 2, d = depth / 2;
  // Two thick pitched roof solids close over a gabled 3D body.
  const underside = getRoofUnderside();
  block(group, width, .18, depth, underside, 0, eave - .08, 0);
  const slopeLength = Math.hypot(w, rise);
  const angle = Math.atan2(rise, w);
  for (const side of [-1, 1]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(slopeLength + .15, .18, depth + .13), [underside, underside, mat, underside, underside, underside]);
    mesh.position.set(side * w / 2, eave + rise / 2, 0);
    mesh.rotation.z = -side * angle;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    block(group, .14, .14, depth + .19, wood, side * w, eave - .07, 0);
  }
  block(group, .16, .2, depth + .19, wood, 0, eave + rise + .02, 0);
  for (const z of [-d, d]) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute([-w, eave, z, w, eave, z, 0, eave + rise, z], 3));
    geo.computeVertexNormals();
    geo.setAttribute("uv", new THREE.Float32BufferAttribute([.02, .56, .34, .56, .18, .97], 2));
    const gableMaterial = getSideMaterial(0).clone();
    gableMaterial.side = THREE.DoubleSide;
    const gable = new THREE.Mesh(geo, gableMaterial);
    gable.position.z += Math.sign(z) * .005;
    gable.castShadow = true;
    gable.receiveShadow = true;
    group.add(gable);
  }
}

function windowOnStreet(group: THREE.Group, x: number, y: number, z: number, facing: number, accent: THREE.Material, small = false) {
  const h = small ? .78 : 1.15;
  const w = small ? .65 : .91;
  block(group, .2, h + .2, w + .2, darkWood, x, y, z);
  block(group, .22, h, w, windowGlow, x + facing * .045, y, z, false);
  block(group, .25, h + .02, .06, wood, x + facing * .16, y, z, false);
  block(group, .25, .07, w + .04, wood, x + facing * .17, y, z, false);
  for (const direction of [-1, 1]) {
    const shutter = block(group, .13, h + .13, .22, accent, x + facing * .08, y, z + direction * (w / 2 + .15));
    shutter.rotation.y = direction * .22;
  }
  block(group, .38, .12, w + .52, stone, x + facing * .12, y - h / 2 - .1, z);
  block(group, .28, .17, w + .38, wood, x + facing * .15, y - h / 2 - .25, z);
}

function doorOnStreet(group: THREE.Group, x: number, facing: number, accent: THREE.Material, grand = false) {
  const height = grand ? 2.5 : 2.15;
  block(group, .23, height + .2, 1.25, stone, x, height / 2 + .32, 0);
  block(group, .26, height, 1.02, darkWood, x + facing * .06, height / 2 + .3, 0);
  const hinge = new THREE.Group();
  hinge.position.set(x + facing * .08, height / 2 + .3, -.43);
  group.add(hinge);
  const leaf = block(hinge, .28, height - .12, .86, accent, 0, 0, .43);
  for (const z of [.09, .77]) block(hinge, .3, height - .24, .05, paleWood, facing * .03, 0, z, false);
  for (const y of [-height * .22, height * .08]) block(hinge, .3, .055, .8, paleWood, facing * .04, y, .43, false);
  const handle = new THREE.Mesh(new THREE.SphereGeometry(.07, 8, 6), brass);
  handle.position.set(facing * .2, -.12, .66);
  hinge.add(handle);
  for (let i = 0; i < 3; i++) block(group, .7 + i * .22, .11, 1.4 + i * .16, stone, x + facing * (i * .22 + .33), .055 + i * .1, 0);
  return {leaf, hinge};
}

function lanternOnStreet(group: THREE.Group, x: number, y: number, z: number, facing: number) {
  block(group, .62, .08, .08, darkWood, x + facing * .23, y + .28, z);
  block(group, .08, .31, .08, darkWood, x + facing * .52, y + .11, z);
  const body = block(group, .27, .34, .27, windowGlow, x + facing * .52, y - .13, z, false);
  body.material = new THREE.MeshStandardMaterial({ color: 0xffd785, emissive: 0xffa53c, emissiveIntensity: 1.1, roughness: .3 });
  for (const direction of [-1, 1]) {
    block(group, .035, .39, .035, darkWood, x + facing * (.52 + direction * .13), y - .12, z, false);
    block(group, .035, .39, .035, darkWood, x + facing * .52, y - .12, z + direction * .13, false);
  }
  block(group, .33, .07, .33, darkWood, x + facing * .52, y + .08, z);
  block(group, .36, .08, .36, darkWood, x + facing * .52, y - .36, z);
}

function cartographyTower(group: THREE.Group, width: number, depth: number, facing: number, accent: THREE.Material) {
  const mount = new THREE.Group();
  mount.position.set(facing * (width * .3), 0, depth * .32);
  group.add(mount);
  towerLoader.load("/town-models/cartography-tower.glb", ({ scene }) => {
    const towerStone = getTowerStoneMaterial();
    const trimStone = makeTownSurface("old_sandstone_02", 0xc6b9a5);
    scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const name = (object.material as THREE.Material).name;
      if (name === "tower_stone") object.material = towerStone;
      else if (name === "tower_roof") object.material = accent;
      else if (name === "tower_trim") object.material = trimStone;
      else if (name === "tower_metal") object.material = brass;
      object.castShadow = true;
      object.receiveShadow = true;
    });
    mount.add(scene);
  });
}

export function makeVillageBuilding(side: -1 | 1, z: number, index: number, kind: Kind = "cottage") {
  const group = new THREE.Group();
  const facing = -side;
  const grand = kind === "tavern" || kind === "guild" || kind === "cartography" || kind === "blacksmith";
  const width = (grand ? 5.6 : 4.5) + (index % 3) * .26;
  const depth = (grand ? 5.8 : 5.1) + (index % 2) * .27;
  const lower = 2.55 + (index % 2) * .12;
  const upper = grand ? 2.45 : 2.05 + (index % 3) * .1;
  const height = lower + upper;
  const variant = kind === "cartography" ? 1 : kind === "guild" ? 3 : index % roofColors.length;
  const wall = getWallMaterials()[index % wallColors.length];
  group.position.set(side * (width / 2 + 5.15 + (index % 2) * .18), 0, z);

  // UV materials are applied directly to the six faces of the closed 3D body.
  // This keeps the front, rear and side elevations connected at every corner.
  const foundation = makeTownSurface("old_sandstone_02", 0xb5a898);
  block(group, width + .12, .22, depth + .12, foundation, 0, .11, 0);
  const sideWall = getSideMaterial(index);
  const facadeWall = getFacadeMaterial(index, kind);
  const elevations: THREE.Material[] = facing === 1
    ? [facadeWall, sideWall, wall, foundation, sideWall, sideWall]
    : [sideWall, facadeWall, wall, foundation, sideWall, sideWall];
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, height - .22, depth), elevations);
  body.position.y = .22 + (height - .22) / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  const streetFaceX = facing * (width / 2 + .012);

  const portalKey = kind === "shop" ? "market" : kind === "tavern" ? "tavern" : kind === "guild" ? "guild" : kind === "cartography" ? "cartography" : kind === "blacksmith" ? "blacksmith" : null;
  if (portalKey) {
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(depth * .31, 2.18), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide }));
    portal.position.set(streetFaceX + facing * .027, 1.65, 0);
    portal.rotation.y = facing * Math.PI / 2;
    portal.userData.portalKey = portalKey;
    portal.userData.portalFacing = facing;
    group.add(portal);
  }

  const rise = grand ? 2.4 : 2.12;
  slopedRoof(group, width + 1.25, depth + 1.02, height - .02, rise, getRoofMaterials()[variant], roofColors[variant]);
  const chimneyX = -facing * width * .23;
  block(group, .7, 1.45, .7, stone, chimneyX, height + rise * .55, -depth * .22);
  block(group, .88, .14, .88, stone, chimneyX, height + rise * .55 + .77, -depth * .22);

  if (kind === "blacksmith") {
    const forgeGlow = new THREE.PointLight(0xff6827, 8, 6, 2);
    forgeGlow.position.set(streetFaceX + facing * .38, 1.42, depth * .29);
    group.add(forgeGlow);
    const forgeChimney = block(group, .85, 2.1, .87, makeTownSurface("castle_brick_01", 0x71615b), facing * width * .27, height + rise * .63, depth * .23);
    forgeChimney.castShadow = true;
    block(group, 1.05, .17, 1.05, darkWood, facing * width * .27, height + rise * .63 + 1.1, depth * .23);
  }

  if (kind === "cartography") cartographyTower(group, width, depth, facing, getRoofMaterials()[variant]);
  const windowLight = new THREE.PointLight(0xffb565, 7, 7, 2);
  windowLight.position.set(streetFaceX + facing * .85, 2.65, .3);
  group.add(windowLight);
  return group;
}
