import * as THREE from "three";
import { makeTownSurface } from "./town-architecture";

type Footprint = { x: number; z: number; radius: number };

const iron = new THREE.MeshStandardMaterial({ color: 0x85817a, metalness: .72, roughness: .43, emissive: 0x32251c, emissiveIntensity: .22 });
const blackIron = new THREE.MeshStandardMaterial({ color: 0x242526, metalness: .68, roughness: .58 });
const brass = new THREE.MeshStandardMaterial({ color: 0x9e7546, metalness: .78, roughness: .33 });
const linen = new THREE.MeshStandardMaterial({ color: 0xb6a58d, roughness: 1 });
const parchment = new THREE.MeshStandardMaterial({ color: 0xd3bd91, roughness: .96, side: THREE.DoubleSide });

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z);
  object.castShadow = true;
  object.receiveShadow = true;
  return object;
}

function block(w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number) {
  return mesh(new THREE.BoxGeometry(w, h, d), material, x, y, z);
}

function rod(group: THREE.Group, from: THREE.Vector3, to: THREE.Vector3, radius: number, material: THREE.Material, segments = 10) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const part = mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), segments), material);
  part.position.copy(from).add(to).multiplyScalar(.5);
  part.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  group.add(part);
  return part;
}

function anvil(wood: THREE.Material) {
  const group = new THREE.Group();
  // A shaped extrusion gives the horn, heel, waist and foot a continuous silhouette.
  const outline = new THREE.Shape();
  outline.moveTo(-.78, .85);
  outline.lineTo(-.23, 1.02);
  outline.lineTo(.37, 1.02);
  outline.lineTo(.47, .92);
  outline.lineTo(.8, .92);
  outline.lineTo(.8, .79);
  outline.lineTo(.42, .79);
  outline.lineTo(.21, .73);
  outline.lineTo(.16, .36);
  outline.lineTo(.43, .28);
  outline.lineTo(.48, .18);
  outline.lineTo(-.4, .18);
  outline.lineTo(-.36, .3);
  outline.lineTo(-.13, .37);
  outline.lineTo(-.21, .76);
  outline.lineTo(-.78, .85);
  const body = mesh(new THREE.ExtrudeGeometry(outline, { depth: .38, bevelEnabled: true, bevelSize: .035, bevelThickness: .025, bevelSegments: 2, steps: 1 }), iron);
  body.position.z = -.19;
  group.add(body);
  group.add(block(1.25, .14, .7, wood, 0, .09, 0));
  for (const x of [-.44, .44]) for (const z of [-.26, .26]) group.add(mesh(new THREE.SphereGeometry(.035, 8, 6), blackIron, x, .18, z));
  return group;
}

function forgeTools(group: THREE.Group, wood: THREE.Material) {
  group.add(block(1.35, .09, .18, wood, 0, 1.3, 0));
  for (const x of [-.56, .56]) rod(group, new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, 1.32, 0), .055, wood);
  for (const x of [-.36, .02, .38]) {
    rod(group, new THREE.Vector3(x, .38, .12), new THREE.Vector3(x + .06, 1.35, .12), .025, wood);
    group.add(block(.2, .11, .12, blackIron, x + .075, .48, .12));
  }
  const horseshoe = mesh(new THREE.TorusGeometry(.16, .035, 7, 18, Math.PI * 1.55), iron, -.22, .96, .13);
  horseshoe.rotation.z = .8;
  group.add(horseshoe);
}

function stool(group: THREE.Group, x: number, z: number, wood: THREE.Material) {
  group.add(mesh(new THREE.CylinderGeometry(.27, .29, .08, 12), wood, x, .48, z));
  for (const a of [0, 2.09, 4.19]) {
    const dx = Math.cos(a) * .18, dz = Math.sin(a) * .18;
    rod(group, new THREE.Vector3(x + dx * 1.2, 0, z + dz * 1.2), new THREE.Vector3(x + dx, .45, z + dz), .035, wood);
  }
}

function tankard(group: THREE.Group, x: number, z: number) {
  group.add(mesh(new THREE.CylinderGeometry(.083, .1, .2, 12), brass, x, .85, z));
  group.add(mesh(new THREE.TorusGeometry(.072, .012, 6, 12), brass, x + .095, .86, z));
}

function tavernTable(wood: THREE.Material) {
  const group = new THREE.Group();
  group.add(mesh(new THREE.CylinderGeometry(.62, .62, .085, 16), wood, 0, .77, 0));
  group.add(mesh(new THREE.CylinderGeometry(.085, .11, .7, 10), wood, 0, .39, 0));
  for (const angle of [0, 2.09, 4.19]) {
    const x = Math.cos(angle) * .47, z = Math.sin(angle) * .47;
    rod(group, new THREE.Vector3(0, .13, 0), new THREE.Vector3(x, .06, z), .055, wood);
  }
  stool(group, -.94, -.52, wood);
  stool(group, .94, -.48, wood);
  tankard(group, -.19, -.12);
  tankard(group, .24, .15);
  return group;
}

function cartography(wood: THREE.Material) {
  const group = new THREE.Group();
  for (const x of [-.46, .46]) for (const z of [-.35, .35]) rod(group, new THREE.Vector3(x, 0, z), new THREE.Vector3(x, .9, z), .04, wood);
  group.add(block(1.18, .075, .92, wood, 0, .92, 0));
  const chart = mesh(new THREE.PlaneGeometry(.95, .68), parchment, 0, .963, 0);
  chart.rotation.x = -Math.PI / 2;
  group.add(chart);
  for (const x of [-.36, .33]) {
    const scroll = mesh(new THREE.CylinderGeometry(.055, .055, .75, 12), parchment, x, 1.02, .27);
    scroll.rotation.x = Math.PI / 2;
    group.add(scroll);
    for (const z of [-.26, .26]) group.add(mesh(new THREE.TorusGeometry(.057, .009, 5, 12), brass, x, 1.02, z + .27));
  }
  // The survey telescope is a tapered brass tube carried by a three-legged tripod.
  const tripod = new THREE.Vector3(.67, 1.12, -.28);
  for (const angle of [0, 2.09, 4.19]) {
    const foot = new THREE.Vector3(.67 + Math.cos(angle) * .35, 0, -.28 + Math.sin(angle) * .35);
    rod(group, foot, tripod, .025, wood);
  }
  const tube = mesh(new THREE.CylinderGeometry(.09, .13, .78, 16), brass, .67, 1.23, -.28);
  tube.rotation.z = Math.PI / 2 + .14;
  group.add(tube);
  group.add(mesh(new THREE.TorusGeometry(.115, .018, 8, 16), blackIron, 1.03, 1.28, -.28));
  return group;
}

function shield(group: THREE.Group, x: number, y: number, z: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-.26, .4); shape.quadraticCurveTo(0, .5, .26, .4);
  shape.lineTo(.25, -.08); shape.quadraticCurveTo(.15, -.43, 0, -.53);
  shape.quadraticCurveTo(-.15, -.43, -.25, -.08); shape.closePath();
  const face = mesh(new THREE.ExtrudeGeometry(shape, { depth: .045, bevelEnabled: true, bevelThickness: .018, bevelSize: .018, bevelSegments: 2 }), iron, x, y, z);
  group.add(face);
  group.add(mesh(new THREE.SphereGeometry(.065, 10, 8), brass, x, y, z + .075));
}

function guildRack(wood: THREE.Material) {
  const group = new THREE.Group();
  for (const x of [-.65, .65]) rod(group, new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, 1.56, 0), .075, wood);
  for (const y of [.39, 1.35]) group.add(block(1.48, .1, .14, wood, 0, y, 0));
  shield(group, -.32, .86, .12);
  shield(group, .36, .86, .12);
  for (const x of [-.56, .57]) {
    rod(group, new THREE.Vector3(x, .1, -.13), new THREE.Vector3(x, 1.76, -.13), .022, wood);
    const tip = mesh(new THREE.ConeGeometry(.068, .23, 6), iron, x, 1.83, -.13);
    group.add(tip);
  }
  return group;
}

function marketStand(wood: THREE.Material) {
  const group = new THREE.Group();
  for (const x of [-.67, .67]) for (const z of [-.37, .37]) rod(group, new THREE.Vector3(x, 0, z), new THREE.Vector3(x, .8, z), .055, wood);
  group.add(block(1.54, .1, .88, wood, 0, .8, 0));
  for (const [x,z,rotation] of [[-.36,-.12,.2],[.3,.12,-.18],[.03,-.23,.5]] as const) {
    const sack = mesh(new THREE.SphereGeometry(.23, 14, 10), linen, x, .99, z);
    sack.scale.set(1, .57, .7);
    sack.rotation.y = rotation;
    group.add(sack);
    group.add(mesh(new THREE.CylinderGeometry(.07, .11, .08, 9), linen, x, 1.13, z));
  }
  for (const x of [-.58, .58]) group.add(mesh(new THREE.CylinderGeometry(.26, .2, .28, 12), wood, x, .14, -.65));
  return group;
}

function firewood(wood: THREE.Material) {
  const group = new THREE.Group();
  group.add(block(1.33, .08, .55, wood, 0, .07, 0));
  for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - row; i++) {
    const log = mesh(new THREE.CylinderGeometry(.095, .12, .54, 9), wood, -.43 + i * .29 + row * .13, .19 + row * .18, 0);
    log.rotation.x = Math.PI / 2;
    group.add(log);
    group.add(mesh(new THREE.CircleGeometry(.094, 9), parchment, log.position.x, log.position.y, .28));
  }
  return group;
}

export function addTownProps(scene: THREE.Scene): Footprint[] {
  const wood = makeTownSurface("oak_wood_planks", 0x8c6b4a);
  wood.emissive.setHex(0x493523);
  wood.emissiveMap = wood.map;
  wood.emissiveIntensity = .18;
  const spots: Footprint[] = [];
  const place = (object: THREE.Object3D, x: number, z: number, radius: number, rotation = 0) => {
    object.position.set(x, .035, z);
    object.rotation.y = rotation;
    scene.add(object);
    spots.push({ x, z, radius });
  };
  const smith = new THREE.Group();
  const steel = anvil(wood); steel.position.set(0, 0, -.58); smith.add(steel);
  const tools = new THREE.Group(); tools.position.set(0, 0, .65); forgeTools(tools, wood); smith.add(tools);
  place(smith, -5.18, 8, 1.42);
  place(tavernTable(wood), -6.15, 18.15, 1.48, .23);
  place(marketStand(wood), -6.1, -15.15, 1.22, -.22);
  place(guildRack(wood), 6.05, -3.15, 1.08, Math.PI);
  place(cartography(wood), 6.1, -15.15, 1.12, Math.PI - .12);
  for (const [x,z,color,power] of [[-5.18,8,0xffa66b,8],[-6.15,18.15,0xffc48a,7],[-6.1,-15.15,0xffbf82,7],[6.05,-3.15,0xffc49d,6],[6.1,-15.15,0xffc599,6]] as const) {
    const light = new THREE.PointLight(color, power, 4.2, 2);
    light.position.set(x, 1.8, z);
    scene.add(light);
  }
  for (const [x,z,angle] of [[-6.1,28.4,-.2],[6.15,28.4,.2],[-6.12,-39.15,.1],[6.15,-39.15,-.2]] as const) {
    place(firewood(wood), x, z, .83, angle);
  }
  return spots;
}
