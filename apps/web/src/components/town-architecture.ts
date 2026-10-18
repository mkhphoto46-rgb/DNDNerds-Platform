import * as THREE from "three";

type Kind = "cottage" | "tavern" | "guild" | "shop" | "cartography";

const material = (color: number, roughness = 1) => new THREE.MeshStandardMaterial({ color, roughness });
const wood = material(0x684b3b);
const paleWood = material(0xa47a54);
const darkWood = material(0x3d352f);
const stone = material(0xb2ac96);
const brass = new THREE.MeshStandardMaterial({ color: 0xe9be72, metalness: .55, roughness: .38 });
const windowGlow = new THREE.MeshStandardMaterial({ color: 0xe6bd85, emissive: 0xe49b51, emissiveIntensity: 1.8, roughness: .42 });
const wallColors = [0xdacbb2, 0xd6c7b1, 0xd5bea5, 0xcbd0c1, 0xdac9b7, 0xd0c9b8];
const roofColors = ["#805447", "#445967", "#9a604a", "#50646a", "#70535a", "#776653"];

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
  wallMaterials ??= wallColors.map(color => {
    const map = createBrickTexture([0x986c52,0x8d6855,0xa47759,0x89705e,0x99765e,0x8e6c59][wallColors.indexOf(color)]);
    return new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: .065, roughness: 1 });
  });
  return wallMaterials;
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
function getRoofMaterials() {
  roofMaterials ??= roofColors.map(color => new THREE.MeshStandardMaterial({ map: roofTexture(color), color: 0xffffff, side: THREE.DoubleSide, roughness: .9 }));
  return roofMaterials;
}

function slopedRoof(group: THREE.Group, width: number, depth: number, eave: number, rise: number, mat: THREE.Material, tileColor: string) {
  const w = width / 2, d = depth / 2;
  // Closed underside overlaps the wall top and seals the roof overhang.
  block(group, width, .14, depth, darkWood, 0, eave - .06, 0);
  for (const side of [-1, 1]) {
    const outerX = side * w;
    const vertices = new Float32Array([
      outerX, eave, d, 0, eave + rise, d, outerX, eave, -d,
      0, eave + rise, d, 0, eave + rise, -d, outerX, eave, -d,
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 0], 2));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    beam(group, new THREE.Vector3(outerX, eave, d + .05), new THREE.Vector3(0, eave + rise, d + .05), .13, paleWood);
    block(group, .17, .18, depth + .18, paleWood, outerX, eave - .04, 0);
  }
  block(group, .2, .17, depth + .16, paleWood, 0, eave + rise, 0);
  for (const z of [-d, d]) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute([-w, eave, z, w, eave, z, 0, eave + rise, z], 3));
    geo.computeVertexNormals();
    const gable = new THREE.Mesh(geo, material(0xf0d9b8));
    gable.material.side = THREE.DoubleSide;
    group.add(gable);
    beam(group, new THREE.Vector3(-w * .55, eave + rise * .45, z + Math.sign(z) * .025), new THREE.Vector3(w * .55, eave + rise * .45, z + Math.sign(z) * .025), .09, wood);
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
  for (let i = 0; i < 4; i++) {
    const flower = new THREE.Mesh(new THREE.IcosahedronGeometry(.085, 1), material([0x89935b, 0x788752, 0x989472, 0x657952][i]));
    flower.position.set(x + facing * .22, y - h / 2 - .13, z + (i - 1.5) * .22);
    group.add(flower);
  }
}

function doorOnStreet(group: THREE.Group, x: number, facing: number, accent: THREE.Material, grand = false) {
  const height = grand ? 2.5 : 2.15;
  block(group, .23, height + .2, 1.25, stone, x, height / 2 + .32, 0);
  block(group, .26, height, 1.02, darkWood, x + facing * .06, height / 2 + .3, 0);
  block(group, .28, height - .12, .86, accent, x + facing * .08, height / 2 + .3, 0);
  for (const z of [-.34, .34]) block(group, .3, height - .24, .05, paleWood, x + facing * .11, height / 2 + .3, z, false);
  for (const y of [.85, 1.5]) block(group, .3, .055, .8, paleWood, x + facing * .12, y, 0, false);
  const handle = new THREE.Mesh(new THREE.SphereGeometry(.07, 8, 6), brass);
  handle.position.set(x + facing * .28, 1.22, .22);
  group.add(handle);
  for (let i = 0; i < 3; i++) block(group, .7 + i * .22, .11, 1.4 + i * .16, stone, x + facing * (i * .22 + .33), .055 + i * .1, 0);
}

function hangingSign(group: THREE.Group, x: number, facing: number, y: number, kind: Kind) {
  block(group, .1, .11, 1.65, darkWood, x + facing * .26, y + .63, .9);
  for (const z of [.45, 1.36]) block(group, .07, .42, .07, brass, x + facing * .26, y + .36, z, false);
  const plaque = block(group, .15, .95, 1.26, wood, x + facing * .28, y - .15, .9);
  plaque.rotation.x = -.03;
  block(group, .17, .76, 1.07, kind === "cartography" ? brass : material(0xdfbd80), x + facing * .29, y - .15, .9, false);
  const symbol = kind === "tavern" ? "✦" : kind === "cartography" ? "✧" : kind === "guild" ? "✺" : "◆";
  const canvas = document.createElement("canvas");
  canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = "#4c392d"; ctx.font = "82px Georgia"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(symbol, 64, 64);
  const icon = new THREE.Mesh(new THREE.PlaneGeometry(.68, .68), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, side: THREE.DoubleSide }));
  icon.rotation.y = Math.PI / 2;
  icon.position.set(x + facing * .39, y - .15, .9);
  group.add(icon);
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

function streetDressing(group: THREE.Group, x: number, depth: number, facing: number, index: number) {
  const barrelWood = material(0x99633d);
  const hoops = material(0x544b43);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.35, .33, .8, 12), barrelWood);
  barrel.position.set(x + facing * .47, .4, depth * .38);
  barrel.castShadow = true; barrel.receiveShadow = true; group.add(barrel);
  for (const y of [.16, .64]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(.35, .035, 5, 16), hoops);
    hoop.rotation.x = Math.PI / 2;
    hoop.position.set(barrel.position.x, y, barrel.position.z);
    group.add(hoop);
  }
  const crateX = x + facing * .54;
  const crateZ = -depth * .38;
  block(group, .7, .58, .72, material(0xae7546), crateX, .29, crateZ);
  for (const side of [-1, 1]) {
    block(group, .09, .63, .78, wood, crateX + side * .32, .32, crateZ);
    block(group, .77, .63, .09, wood, crateX, .32, crateZ + side * .33);
  }
  if (index % 2 === 0) {
    const planter = block(group, .7, .32, .55, material(0x955a36), crateX, .73, crateZ);
    planter.castShadow = true;
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(.16, 7, 6), material(i % 2 ? 0x568451 : 0x739554));
      leaf.position.set(crateX + (i % 3 - 1) * .2, .96 + (i % 2) * .08, crateZ + (i > 2 ? .13 : -.12));
      group.add(leaf);
    }
  }
}

function cartographyTower(group: THREE.Group, width: number, depth: number, facing: number, accent: THREE.Material) {
  const tower = new THREE.Group();
  tower.position.set(facing * (width * .38), 0, depth * .28);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.17, 1.35, 6.5, 10), stone);
  body.position.y = 3.25; body.castShadow = true; body.receiveShadow = true; tower.add(body);
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(1.33, 1.31, 1.45, 10), material(0xd8cdb2));
  upper.position.y = 6.6; upper.castShadow = true; tower.add(upper);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.8, 2.6, 10), accent);
  roof.position.y = 8.55; roof.castShadow = true; tower.add(roof);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(.18, 10, 8), brass);
  tip.position.y = 10.01; tower.add(tip);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.55, .08, 7, 28), brass);
  ring.rotation.y = Math.PI / 2; ring.position.set(facing * 1.35, 6.55, .1); tower.add(ring);
  for (const dir of [-1, 1]) {
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(.16, .38, 4), brass);
    arrow.rotation.z = dir * Math.PI / 2;
    arrow.position.set(facing * 1.42, 6.55 + dir * .42, .1);
    tower.add(arrow);
  }
  group.add(tower);
}

export function makeVillageBuilding(side: -1 | 1, z: number, index: number, kind: Kind = "cottage") {
  const group = new THREE.Group();
  const facing = -side;
  const grand = kind === "tavern" || kind === "guild" || kind === "cartography";
  const width = (grand ? 5.6 : 4.5) + (index % 3) * .26;
  const depth = (grand ? 5.8 : 5.1) + (index % 2) * .27;
  const lower = 2.55 + (index % 2) * .12;
  const upper = grand ? 2.45 : 2.05 + (index % 3) * .1;
  const height = lower + upper;
  const variant = kind === "cartography" ? 1 : kind === "guild" ? 3 : index % roofColors.length;
  const wall = getWallMaterials()[index % wallColors.length];
  const accent = material([0x8d5748, 0x56847a, 0x866553, 0x6c7f70, 0x73596c, 0x9a714b][variant]);
  group.position.set(side * (width / 2 + 5.15 + (index % 2) * .18), 0, z);

  block(group, width + .3, .66, depth + .3, stone, 0, .33, 0);
  block(group, width, lower - .48, depth, wall, 0, lower / 2 + .24, 0);
  block(group, width + .62, upper, depth + .45, wall, 0, lower + upper / 2, 0);
  block(group, width + .82, .21, depth + .65, wood, 0, lower - .03, 0);
  block(group, width + .84, .18, depth + .67, paleWood, 0, height - .07, 0);

  const streetX = facing * (width / 2 + .35);
  const lowerX = facing * (width / 2 + .015);
  for (const x of [-width / 2 - .36, width / 2 + .36]) {
    for (const zz of [-depth / 2 - .2, depth / 2 + .2]) block(group, .17, upper, .17, wood, x, lower + upper / 2, zz);
  }
  for (const zz of [-depth * .33, depth * .33]) {
    block(group, .16, upper, .15, wood, streetX + facing * .035, lower + upper / 2, zz);
    beam(group, new THREE.Vector3(streetX + facing * .06, lower + .12, zz), new THREE.Vector3(streetX + facing * .06, lower + upper * .72, zz + .58), .11, paleWood);
  }
  for (const zz of [-depth * .48, depth * .48]) {
    block(group, .13, lower - .42, .14, wood, lowerX + facing * .08, lower / 2 + .22, zz);
    lanternOnStreet(group, streetX + facing * .02, lower + .08, zz, facing);
  }
  for (const zz of [-depth * .23, depth * .23]) {
    beam(group, new THREE.Vector3(streetX + facing * .07, lower + .14, zz - .65), new THREE.Vector3(streetX + facing * .07, height - .2, zz + .65), .11, wood);
    beam(group, new THREE.Vector3(streetX + facing * .09, lower + .14, zz + .65), new THREE.Vector3(streetX + facing * .09, height - .2, zz - .65), .09, paleWood);
  }
  for (const zz of [-depth * .42, 0, depth * .42]) {
    beam(group, new THREE.Vector3(lowerX, lower - .72, zz), new THREE.Vector3(streetX + facing * .16, lower + .02, zz), .13, wood);
  }
  for (const x of [-width * .25, width * .25]) {
    for (const zz of [-depth / 2 - .245, depth / 2 + .245]) {
      block(group, .14, upper, .13, wood, x, lower + upper / 2, zz);
      beam(group, new THREE.Vector3(x - .55, lower + .13, zz), new THREE.Vector3(x + .2, lower + upper * .8, zz), .09, paleWood);
    }
  }
  for (const zz of [-depth * .34, depth * .34]) block(group, .16, lower - .4, .17, wood, lowerX, lower / 2 + .2, zz);

  doorOnStreet(group, lowerX + facing * .08, facing, accent, grand);
  for (const zz of [-depth * .33, depth * .33]) {
    windowOnStreet(group, lowerX + facing * .09, 1.56, zz, facing, accent, true);
    windowOnStreet(group, streetX + facing * .08, lower + upper * .51, zz, facing, accent, !grand);
  }
  block(group, .22, .26, depth + .36, stone, lowerX + facing * .03, .58, 0);
  for (const zz of [-depth / 2 - .25, depth / 2 + .25]) {
    for (const x of [-width * .27, width * .27]) {
      block(group, .83, .96, .15, darkWood, x, lower + upper * .5, zz);
      block(group, .65, .78, .17, windowGlow, x, lower + upper * .5, zz + Math.sign(zz) * .025, false);
      block(group, .09, .94, .2, paleWood, x, lower + upper * .5, zz + Math.sign(zz) * .08, false);
      block(group, .9, .12, .35, stone, x, lower + upper * .5 - .55, zz + Math.sign(zz) * .1);
    }
  }
  for (const zz of [-depth * .24, depth * .24]) {
    block(group, .14, .11, depth * .21, paleWood, streetX + facing * .09, lower + .07, zz);
    block(group, .16, .11, depth * .21, paleWood, streetX + facing * .09, height - .18, zz);
  }

  const rise = grand ? 2.55 : 2.2;
  slopedRoof(group, width + 1.43, depth + 1.25, height - .035, rise, getRoofMaterials()[variant], roofColors[variant]);
  if (kind !== "cartography" && index % 3 !== 0) {
    const dormer = new THREE.Group();
    dormer.position.set(facing * (width * .31), height + rise * .39, -depth * .18);
    block(dormer, .88, 1.13, 1.1, wall, 0, .25, 0);
    const windowX = facing * .49;
    block(dormer, .1, .69, .59, darkWood, windowX, .3, 0);
    block(dormer, .13, .53, .45, windowGlow, windowX + facing * .02, .3, 0, false);
    block(dormer, .15, .59, .07, paleWood, windowX + facing * .09, .3, 0, false);
    slopedRoof(dormer, 1.35, 1.45, .81, .76, getRoofMaterials()[variant], roofColors[variant]);
    group.add(dormer);
  }
  const chimneyX = -facing * width * .24;
  const chimney = block(group, .78, 2.1, .85, stone, chimneyX, height + 1.1, -depth * .23);
  chimney.rotation.z = .035;
  block(group, 1.03, .18, 1.1, stone, chimneyX, height + 2.2, -depth * .23);
  block(group, .55, .04, .6, darkWood, chimneyX, height + 2.31, -depth * .23, false);


  if (kind === "tavern") {
    block(group, .95, .12, depth + .3, darkWood, streetX + facing * .8, lower + .08, 0);
    for (const zz of [-depth * .38, depth * .38]) block(group, .12, .87, .12, paleWood, streetX + facing * .85, lower + .51, zz);
    block(group, .14, .11, depth + .3, paleWood, streetX + facing * .85, lower + 1, 0);
    for (const zz of [-1, 1]) {
      const lantern = new THREE.Mesh(new THREE.SphereGeometry(.14, 8, 6), windowGlow);
      lantern.position.set(streetX + facing * .78, lower + .83, zz);
      group.add(lantern);
    }
  }
  if (kind === "shop") {
    const awning = block(group, 1.25, .1, 2.5, accent, streetX + facing * .75, 2.35, 0);
    awning.rotation.z = facing * .13;
    block(group, 1.45, .16, 2.65, paleWood, streetX + facing * .75, 2.39, 0);
  }
  if (kind === "guild") {
    for (const zz of [-depth * .46, depth * .46]) {
      const banner = block(group, .13, 1.6, .62, accent, streetX + facing * .2, lower + .83, zz, false);
      banner.rotation.x = zz > 0 ? -.08 : .08;
      block(group, .16, .09, .8, brass, streetX + facing * .24, lower + 1.62, zz, false);
    }
  }
  if (kind === "cartography") {
    cartographyTower(group, width, depth, facing, accent);
    const compass = new THREE.Mesh(new THREE.TorusGeometry(.46, .055, 6, 32), brass);
    compass.rotation.y = Math.PI / 2;
    compass.position.set(streetX + facing * .2, lower + 1.2, 0);
    group.add(compass);
  }
  const windowLight = new THREE.PointLight(0xffb565, 10, 8, 2);
  windowLight.position.set(streetX + facing * .65, 2.9, .4);
  group.add(windowLight);
  streetDressing(group, streetX, depth, facing, index);
  return group;
}
