import {
  Bone, BufferGeometry, CylinderGeometry, DoubleSide, Float32BufferAttribute,
  Group, MathUtils, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Object3D,
  PointLight, Shape, ExtrudeGeometry, SphereGeometry, Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { FlightState } from './FlightState';

/**
 * AEGIS Mark II: an original hard-surface *replacement shell*, animated by the
 * already-loaded 145-bone Godot skeleton. No download, external textures or
 * new skeletal animation assets are required.
 *
 * The form is deliberately authored in metres around the game's existing
 * 2.15m, +Z-facing character. All components are 3D meshes (never image cards).
 * This is a browser-performance-oriented hard-surface model, not a claim of a
 * sculpted/retopologized AAA production asset.
 */
export interface MarkIIHandle {
  update(state: FlightState, velocity: number, assembled: number): void;
  dispose(): void;
  root: Group;
}

type Mat = MeshStandardMaterial | MeshPhysicalMaterial;
type XY = [number, number];
type XYZ = [number, number, number];
const V = (x: number, y: number, z: number) => new Vector3(x, y, z);
const S = [-1, 1] as const;

export function createAegisMarkII(
  root: Group, bones: Map<string, Bone>, thrusterMounts: Object3D[],
): MarkIIHandle {
  const metals = {
    obsidian: new MeshStandardMaterial({color: '#101923', metalness: .76, roughness: .33}),
    titanium: new MeshStandardMaterial({color: '#263444', metalness: .87, roughness: .27}),
    gunmetal: new MeshStandardMaterial({color: '#3e5265', metalness: .81, roughness: .32}),
    silver: new MeshStandardMaterial({color: '#899eae', metalness: .91, roughness: .26}),
    highlight: new MeshStandardMaterial({color: '#b9c7d2', metalness: .90, roughness: .22}),
    rubber: new MeshStandardMaterial({color: '#080f18', metalness: .12, roughness: .8}),
    carbon: new MeshStandardMaterial({color: '#15202c', metalness: .35, roughness: .65}),
    groove: new MeshStandardMaterial({color: '#030a12', metalness: .25, roughness: .55}),
    visor: new MeshPhysicalMaterial({color: '#0074bd', emissive: '#0068db', emissiveIntensity: 1.35, metalness: .33, roughness: .14, clearcoat: 1, clearcoatRoughness: .10, side: DoubleSide}),
    plasma: new MeshStandardMaterial({color: '#29c7ff', emissive: '#11a9ff', emissiveIntensity: 1.1, metalness: .36, roughness: .22}),
    hot: new MeshStandardMaterial({color: '#c2f2ff', emissive: '#44bdff', emissiveIntensity: 2.0, metalness: .11, roughness: .15}),
  };
  const segments: Mesh[] = [];
  const container = new Group(); container.name = 'AEGIS-MKII / original full-body hard-surface armor';
  root.add(container);
  root.updateMatrixWorld(true);

  function mount(boneName: string, x: number, y: number, z: number): Group {
    const bone = bones.get(boneName);
    if (!bone) throw new Error(`AEGIS Mark II missing required skeleton bone: ${boneName}`);
    const g = new Group(); g.position.set(x,y,z); g.name = `AEGIS / ${boneName}`;
    root.add(g); root.updateMatrixWorld(true); bone.attach(g);
    // Mounts must be children of the rig bone to inherit its animation.
    return g;
  }
  function mesh(parent: Object3D, geometry: BufferGeometry, mat: Mat, x=0,y=0,z=0): Mesh {
    const o = new Mesh(geometry, mat); o.position.set(x,y,z);
    o.castShadow=true; o.receiveShadow=true;
    o.frustumCulled=false;
    parent.add(o);segments.push(o);return o;
  }
  function box(p:Object3D, w:number,h:number,d:number,mat:Mat,x=0,y=0,z=0,r=.012):Mesh {
    return mesh(p,new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/5,h/5,d/5)),mat,x,y,z);
  }
  function sphere(p:Object3D,sx:number,sy:number,sz:number,mat:Mat,x=0,y=0,z=0):Mesh {
    const m=mesh(p,new SphereGeometry(1,18,12),mat,x,y,z);m.scale.set(sx,sy,sz);return m;
  }
  function cyl(p:Object3D,r1:number,r2:number,h:number,mat:Mat,x=0,y=0,z=0,radial=12):Mesh {
    return mesh(p,new CylinderGeometry(r1,r2,h,radial),mat,x,y,z);
  }
  function bar(p:Object3D,a:XY,b:XY,width:number,depth:number,mat:Mat,z=0):Mesh {
    const d=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const m=box(p,d,width,depth,mat,(a[0]+b[0])/2,(a[1]+b[1])/2,z,Math.min(width*.35,.006));
    m.rotation.z=Math.atan2(b[1]-a[1],b[0]-a[0]);return m;
  }
  function prism(p:Object3D,points:XY[],d:number,mat:Mat,z=0,bevel=.006):Mesh {
    const shape=new Shape();shape.moveTo(...points[0]);for(let i=1;i<points.length;i++)shape.lineTo(...points[i]);shape.closePath();
    const geo=new ExtrudeGeometry(shape,{depth:d,steps:1,bevelEnabled:bevel>0,bevelSegments:1,bevelSize:bevel,bevelThickness:Math.min(bevel,d*.35),curveSegments:2});
    return mesh(p,geo,mat,0,0,z);
  }
  function hull(p:Object3D,points:XYZ[],mat:Mat):Mesh {
    return mesh(p,new ConvexGeometry(points.map(q=>V(...q))),mat);
  }
  // Segmented faceted shell. Variable X/Y/Z radii and finite end caps create
  // volume from every angle, unlike the previous 2D armor-panel overlays.
  function contour(p:Object3D,rings: [number,number,number,number][],mat:Mat,facets=12):Mesh {
    const vertices:number[]=[];const index:number[]=[];
    for(const [y,rx,rz,z] of rings){for(let k=0;k<facets;k++){
      const theta=k*Math.PI*2/facets;
      const x=Math.sin(theta)*rx;
      const dz=Math.cos(theta)*rz;
      const frontBoost=dz>0?1.065:1;
      vertices.push(x,y,z+dz*frontBoost);
    }}
    for(let j=0;j<rings.length-1;j++)for(let k=0;k<facets;k++){
      const n=(k+1)%facets,a=j*facets+k,b=j*facets+n,c=(j+1)*facets+n,d=(j+1)*facets+k;
      index.push(a,b,d,b,c,d);
    }
    const last=(rings.length-1)*facets;
    for(let k=1;k<facets-1;k++){index.push(0,k+1,k);index.push(last,last+k,last+k+1)}
    const geo=new BufferGeometry();geo.setAttribute('position',new Float32BufferAttribute(vertices,3));geo.setIndex(index);geo.computeVertexNormals();
    return mesh(p,geo,mat);
  }
  // Small recessed illuminated circular port, never a giant attached orb.
  function port(p:Object3D,x:number,y:number,z:number,r:number,flip=false):void {
    const g=new Group();g.position.set(x,y,z); if(flip)g.rotation.y=Math.PI;p.add(g);
    const shell=cyl(g,r*1.14,r*1.14,.019,metals.groove,0,0,0,16);shell.rotation.x=Math.PI/2;
    const rim=cyl(g,r,r,.025,metals.silver,0,0,.014,16);rim.rotation.x=Math.PI/2;
    const core=cyl(g,r*.66,r*.66,.027,metals.plasma,0,0,.028,16);core.rotation.x=Math.PI/2;
  }

  // Central torso is three distinct articulated armored sections.
  const spine=mount('spine2',0,1.315,.015);
  contour(spine,[[-.22,.202,.145,-.005],[-.13,.228,.169,0],[-.03,.268,.177,.002],[.09,.292,.180,0],[.14,.278,.159,0]],metals.rubber);
  const chest=mount('chest',0,1.51,.015);
  contour(chest,[[-.195,.239,.162,0],[-.12,.285,.195,0],[.04,.365,.216,0],[.145,.342,.189,0],[.213,.272,.144,-.01]],metals.obsidian);
  // Chest cuirass: two substantial left/right wraparound breast plates.
  for(const side of S){
    hull(chest,[
      [side*.025,.150,.186],[side*.155,.177,.202],[side*.337,.104,.082],
      [side*.355,.026,.065],[side*.289,-.098,.148],[side*.093,-.096,.244],
      [side*.040,.055,.267],[side*.240,.094,.272],[side*.274,-.063,.241],
    ],metals.titanium);
    hull(chest,[
      [side*.159,.165,.217],[side*.301,.101,.114],[side*.339,.064,.094],
      [side*.245,.105,.264],[side*.190,.113,.260],
    ],metals.silver);
    prism(chest,[[side*.096,-.103],[side*.285,-.093],[side*.260,-.158],[side*.122,-.161]],.022,metals.gunmetal,.188);
    bar(chest,[side*.095,-.129],[side*.258,-.142],.012,.015,metals.groove,.222);
    bar(chest,[side*.265,.072],[side*.335,.015],.012,.018,metals.silver,.158);
    for(const y of [-.045,.006])box(chest,.018,.007,.015,metals.plasma,side*.301,y,.216,.002);
  }
  // Distinct recessed triangular AEGIS emblem + a structural A-shaped inner core.
  prism(chest,[[0,.119],[-.113,-.084],[.113,-.084]],.024,metals.groove,.267);
  for(const [a,b] of [ [[0,.121],[-.116,-.087]],[[-.116,-.087],[.116,-.087]],[[.116,-.087],[0,.121]]] as [XY,XY][]){
    bar(chest,a,b,.021,.019,metals.silver,.297);
    bar(chest,[a[0]*.81,a[1]*.81],[b[0]*.81,b[1]*.81],.009,.013,metals.hot,.307);
  }
  prism(chest,[[0,.041],[-.037,-.029],[.037,-.029]],.016,metals.obsidian,.324);
  bar(chest,[-.054,-.036],[.054,-.036],.01,.009,metals.hot,.334);
  // Collar and neck. Carefully shadowed recessed gaps keep joints mobile.
  const neck=mount('chest',0,1.735,.015);
  cyl(neck,.135,.155,.11,metals.rubber);
  for(const s of S)hull(neck,[[s*.055,.052,.118],[s*.160,.024,.088],[s*.178,-.037,.045],[s*.067,-.045,.130]],metals.silver);
  // Abdominal articulating plates, each attached to the spine rather than chest.
  const abdomen=mount('spine1',0,1.19,.02);
  contour(abdomen,[[-.11,.195,.123,0],[-.04,.217,.135,0],[.12,.241,.160,0],[.19,.245,.154,0]],metals.carbon);
  for(let row=0;row<4;row++){
    const y=.108-row*.070,w=.212-row*.013;
    hull(abdomen,[[-w,y+.023,.145],[-w*.84,y-.028,.159],[w*.84,y-.028,.159],[w,y+.023,.145],[-w*.70,y+.019,.192],[w*.70,y+.019,.192]],row%2?metals.gunmetal:metals.titanium);
    bar(abdomen,[-w*.62,y-.025],[w*.62,y-.025],.006,.011,metals.groove,.186);
  }
  for(const s of S)for(let n=0;n<3;n++)box(abdomen,.018,.025,.040,metals.plasma,s*(.203-n*.008),.12-n*.080,.081,.004);
  // Pelvis / muscular articulated hip shells.
  const hips=mount('hips',0,.998,.02);
  contour(hips,[[-.11,.220,.125,0],[0,.281,.180,0],[.10,.268,.150,0]],metals.rubber);
  for(const s of S){
    hull(hips,[[s*.026,.075,.169],[s*.253,.077,.112],[s*.310,.015,.012],[s*.271,-.098,.074],[s*.100,-.108,.204],[s*.046,-.030,.208]],metals.titanium);
    hull(hips,[[s*.178,.043,.165],[s*.278,-.004,.084],[s*.257,-.050,.124],[s*.147,-.037,.222]],metals.silver);
    box(hips,.095,.040,.018,metals.gunmetal,s*.162,.108,.133,.006);
    cyl(hips,.055,.055,.040,metals.gunmetal,s*.265,-.07,-.012);
  }
  prism(hips,[[0,.047],[-.10,-.053],[0,-.106],[.10,-.053]],.023,metals.gunmetal,.180);

  // Helmet: continuous faceted shell, recessed eye aperture, protective brows,
  // cheek plates, jaw frame, rear panels and integrated temple machinery.
  const head=mount('head001',0,1.955,.075);
  contour(head,[[-.186,.114,.131,-.006],[-.118,.162,.160,-.004],[-.012,.204,.176,-.009],[.113,.187,.151,-.019],[.195,.106,.090,-.017]],metals.obsidian,14);
  hull(head,[[-.174,.120,-.018],[0,.205,-.007],[.174,.120,-.018],[.156,.078,.142],[0,.148,.195],[-.156,.078,.142]],metals.titanium);
  hull(head,[[-.162,.068,.149],[.162,.068,.149],[.148,-.029,.167],[0,-.049,.201],[-.148,-.029,.167]],metals.groove);
  // Main visor creates a recognizable, continuous blue angular V-shaped eyeline.
  prism(head,[[-.159,.056],[-.027,.039],[0,.005],[.027,.039],[.159,.056],[.142,-.002],[.032,-.035],[0,-.019],[-.032,-.035],[-.142,-.002]],.015,metals.visor,.190,.002);
  prism(head,[[-.145,.055],[-.035,.043],[0,.017],[.035,.043],[.145,.055],[.121,.019],[.020,-.010],[0,.004],[-.020,-.010],[-.121,.019]],.008,metals.hot,.205,.001);
  for(const s of S){
    hull(head,[[s*.022,.146,.189],[s*.160,.098,.145],[s*.167,.051,.146],[s*.035,.094,.221],[s*.023,.130,.214]],metals.silver);
    hull(head,[[s*.166,-.016,.147],[s*.193,-.063,.087],[s*.168,-.150,.039],[s*.069,-.173,.164],[s*.045,-.072,.207],[s*.115,-.080,.201]],metals.titanium);
    hull(head,[[s*.031,-.132,.193],[s*.074,-.178,.157],[s*.132,-.179,.052],[s*.066,-.204,.104],[s*.006,-.178,.179]],metals.silver);
    // Engineered temple; the inset blue ring is a mechanism, not a giant ear cup.
    const ear=sphere(head,.044,.058,.072,metals.gunmetal,s*.178,.009,-.010);
    ear.rotation.z=s*.12;
    port(head,s*.174,.01,.055,.028);
    for(let i=0;i<3;i++)box(head,.022,.013,.043,metals.silver,s*(.102+i*.015),.106-i*.024,-.127,.004);
    hull(head,[[s*.116,.130,-.090],[s*.187,.066,-.053],[s*.167,-.104,-.084],[s*.070,-.137,-.161],[s*.057,.044,-.183]],metals.gunmetal);
    bar(head,[s*.055,-.137],[s*.116,-.167],.008,.014,metals.plasma,-.146);
  }
  hull(head,[[0,.209,.003],[-.057,.133,.213],[.057,.133,.213],[0,.066,.222]],metals.silver);
  box(head,.095,.018,.035,metals.gunmetal,0,-.194,.131,.005);
  for(let j=0;j<3;j++)box(head,.125-j*.024,.014,.026,metals.titanium,0,.12-j*.05,-.177,.005);
  const visorLight = new PointLight('#3c9cff',.7,.75,2);visorLight.position.set(0,.01,.27);head.add(visorLight);

  // Massive but not toy-like shoulders, elbow hinges, panelled biceps and arms.
  for(const s of S){
    const left=s===1,arm=left?'upper_armL':'upper_armR', fore=left?'forearmL':'forearmR', hand=left?'handL':'handR';
    const shin=left?'shinL':'shinR', thigh=left?'thighL':'thighR', knee=left?'kneeL':'kneeR', foot=left?'footL':'footR';
    const shoulder=mount(arm,s*.358,1.575,.010);
    sphere(shoulder,.155,.132,.151,metals.rubber,0,-.035,-.007);
    hull(shoulder,[[s*.01,.121,.023],[s*.203,.060,.062],[s*.242,-.037,.016],[s*.165,-.145,.049],[s*.037,-.109,.130],[s*.016,.055,.128],[s*.139,.095,-.082]],metals.titanium);
    hull(shoulder,[[s*.074,.101,.116],[s*.189,.035,.082],[s*.212,-.005,.040],[s*.103,.011,.156]],metals.silver);
    for(let j=0;j<3;j++)box(shoulder,.015,.033,.019,metals.plasma,s*(.143+j*.012),-.043-j*.027,.088,.004);
    // Upper arm has rigid bicep shells over a darker mobile tendon.
    const upper=mount(arm,s*.40,1.365,.006);
    contour(upper,[[-.155,.104,.103,0],[-.09,.128,.124,0],[.09,.137,.131,0],[.15,.103,.100,0]],metals.rubber,10);
    for(const front of [-1,1]){
      hull(upper,[[-.108,.107,front*.075],[.108,.107,front*.075],[.128,-.035,front*.096],[.083,-.13,front*.114],[-.082,-.13,front*.114],[-.128,-.035,front*.096]],front>0?metals.titanium:metals.gunmetal);
      bar(upper,[-.056,-.113],[.056,-.113],.011,.015,metals.silver,front*.126);
    }
    const elbow=mount(fore,s*.435,1.16,.02);
    sphere(elbow,.108,.11,.105,metals.rubber);
    for(const dx of [-1,1]){const joint=cyl(elbow,.047,.047,.024,metals.gunmetal,dx*.102,0,0);joint.rotation.z=Math.PI/2;}
    hull(elbow,[[-.107,.063,.098],[.108,.063,.098],[.084,-.081,.131],[0,-.119,.138],[-.086,-.081,.131]],metals.silver);
    // Long tapered gauntlet with recessed blue channels and physical palm nozzle.
    const forearm=mount(fore,s*.466,.999,.034);
    contour(forearm,[[-.155,.09,.092,0],[-.063,.141,.133,0],[.110,.159,.129,0],[.166,.130,.115,0]],metals.rubber,12);
    for(const ff of [-1,1])hull(forearm,[[-.094,.146,ff*.103],[.104,.146,ff*.103],[.144,-.063,ff*.083],[.078,-.145,ff*.095],[-.077,-.145,ff*.095],[-.144,-.063,ff*.083]],ff>0?metals.titanium:metals.gunmetal);
    hull(forearm,[[-.055,.122,.142],[.067,.122,.142],[.053,-.115,.131],[-.051,-.115,.131]],metals.silver);
    bar(forearm,[0,.100],[0,-.101],.022,.013,metals.plasma,.154);
    for(let i=0;i<4;i++)box(forearm,.015,.03,.012,metals.silver,s*(.128+i*.002),.057-i*.049,.087,.003);
    const glove=mount(hand,s*.477,.827,.062);
    sphere(glove,.10,.067,.103,metals.carbon);
    box(glove,.191,.055,.166,metals.titanium,0,-.022,.014,.013);
    box(glove,.114,.018,.109,metals.silver,0,.025,.037,.007);
    // Four separate finger modules and opposable thumb, not a mitten.
    for(let f=0;f<4;f++){
      const fx=(f-1.5)*.043;
      box(glove,.035,.069,.037,metals.titanium,fx,-.075,.075,.007);
      box(glove,.032,.047,.033,metals.gunmetal,fx,-.126,.082,.006);
      box(glove,.031,.010,.028,metals.silver,fx,-.15,.082,.002);
    }
    const thumb=box(glove,.043,.077,.055,metals.gunmetal,-s*.105,-.053,.075,.009);thumb.rotation.z=s*.5;
    const nozzle=new Group();nozzle.position.set(0,-.038,.116);glove.add(nozzle);
    const ring=cyl(nozzle,.036,.036,.011,metals.silver,0,0,0,16);ring.rotation.x=Math.PI/2;
    const palmCore=cyl(nozzle,.024,.024,.014,metals.hot,0,0,.010,16);palmCore.rotation.x=Math.PI/2;
    const emitterMount=new Object3D();emitterMount.position.set(0,0,.057);emitterMount.rotation.x=-Math.PI/2;nozzle.add(emitterMount);thrusterMounts.push(emitterMount);
    // Thighs: taper into real knee hinges, layered quadriceps plates.
    const leg=mount(thigh,s*.186,.790,.045);
    contour(leg,[[-.196,.130,.127,0],[-.13,.151,.148,0],[.055,.179,.153,0],[.191,.154,.147,0]],metals.rubber,12);
    for(const ff of [-1,1])hull(leg,[[-.117,.167,ff*.122],[.113,.167,ff*.121],[.155,.058,ff*.108],[.12,-.173,ff*.10],[-.12,-.173,ff*.1],[-.153,.049,ff*.108]],ff>0?metals.titanium:metals.gunmetal);
    hull(leg,[[-.089,.168,.144],[.097,.168,.144],[.075,-.144,.168],[0,-.17,.177],[-.075,-.144,.168]],metals.silver);
    bar(leg,[0,.101],[0,-.092],.012,.015,metals.plasma,.188);
    for(const z of [-.12,.12])for(let i=0;i<3;i++)box(leg,.015,.018,.033,metals.gunmetal,s*.141,(i-1)*.085,z,.004);
    const joint=mount(knee,s*.19,.563,.07);
    sphere(joint,.132,.109,.135,metals.rubber);
    for(const side of [-1,1]){const axle=cyl(joint,.062,.062,.023,metals.gunmetal,side*.135,-.003,0);axle.rotation.z=Math.PI/2;}
    hull(joint,[[-.120,.070,.12],[.12,.070,.12],[.101,-.081,.163],[0,-.112,.181],[-.105,-.081,.163]],metals.titanium);
    hull(joint,[[-.058,.053,.169],[.058,.053,.169],[0,-.074,.192]],metals.silver);
    // Calf and shin with deliberate taper; flex gap at ankle.
    const lower=mount(shin,s*.216,.340,.056);
    contour(lower,[[-.200,.105,.106,0],[-.12,.126,.130,0],[.075,.140,.148,0],[.184,.133,.139,0]],metals.rubber,12);
    hull(lower,[[-.111,.155,.109],[.111,.155,.109],[.135,.014,.122],[.083,-.194,.112],[-.083,-.194,.112],[-.132,.011,.121]],metals.titanium);
    hull(lower,[[-.065,.137,.146],[.066,.137,.146],[.082,-.068,.174],[0,-.166,.162],[-.080,-.068,.174]],metals.silver);
    bar(lower,[0,.093],[0,-.117],.016,.014,metals.plasma,.183);
    for(let j=0;j<2;j++)box(lower,.088,.013,.018,metals.gunmetal,0,.073-j*.155,.190,.003);
    // Deep grounded boot with heel, forefoot, ankle bearing and toe plating.
    const shoe=mount(foot,s*.229,.114,.085);
    sphere(shoe,.117,.085,.123,metals.rubber,0,.014,0);
    box(shoe,.247,.138,.348,metals.obsidian,0,-.035,.105,.022);
    box(shoe,.26,.039,.371,metals.groove,0,-.101,.115,.01);
    hull(shoe,[[-.114,.044,.025],[.114,.044,.025],[.120,.004,.252],[.070,-.029,.301],[-.068,-.029,.301],[-.120,.004,.252]],metals.titanium);
    hull(shoe,[[-.079,.045,.156],[.076,.045,.156],[.071,.002,.296],[-.071,.002,.296]],metals.silver);
    for(let i=0;i<3;i++)box(shoe,.18,.012,.018,metals.gunmetal,0,.071-i*.031,.100+i*.024,.003);
    const sole=new Object3D();sole.position.set(0,-.038,-.09);sole.rotation.x=Math.PI/2;shoe.add(sole);
    const jet=cyl(sole,.051,.057,.026,metals.silver,0,0,0,16);jet.rotation.x=-Math.PI/2;
    const jetCore=cyl(sole,.032,.035,.018,metals.hot,0,0,.022,16);jetCore.rotation.x=-Math.PI/2;
    const footMount=new Object3D();footMount.position.set(0,0,.068);footMount.rotation.x=-Math.PI/2;sole.add(footMount);thrusterMounts.push(footMount);
  }
  // Rear torso is as detailed as the front, with flush twin propulsion banks.
  const back=mount('chest',0,1.48,-.191);
  hull(back,[[-.194,.151,-.022],[.194,.151,-.022],[.266,.032,-.080],[.205,-.171,-.058],[-.205,-.171,-.058],[-.267,.032,-.080],[0,.088,-.155]],metals.titanium);
  hull(back,[[-.058,.155,-.155],[.058,.155,-.155],[.102,-.147,-.119],[-.10,-.147,-.119]],metals.gunmetal);
  for(const s of S){
    const bank=new Group();bank.position.set(s*.17,-.018,-.154);back.add(bank);
    box(bank,.149,.274,.137,metals.obsidian,0,0,0,.023);
    hull(bank,[[-.062,.123,-.073],[.062,.123,-.073],[.074,-.113,-.073],[.022,-.141,-.110],[-.022,-.141,-.110],[-.074,-.113,-.073]],metals.silver);
    box(bank,.043,.171,.012,metals.plasma,0,.006,-.125,.009);
    for(let i=0;i<4;i++)box(bank,.099,.011,.015,metals.gunmetal,0,.070-i*.044,-.139,.003);
    const thrust = new Group();thrust.position.set(0,-.137,-.030);bank.add(thrust);
    const rim=cyl(thrust,.074,.082,.047,metals.silver);rim.rotation.z=Math.PI/2;
    const core=cyl(thrust,.047,.049,.046,metals.hot,0,-.026,0);core.rotation.z=Math.PI/2;
    const mountPoint=new Object3D();mountPoint.position.set(0,-.125,0);thrust.add(mountPoint);thrusterMounts.push(mountPoint);
  }
  for(let i=0;i<5;i++)box(back,.16-i*.012,.016,.035,i%2?metals.gunmetal:metals.silver,0,.069-i*.058,-.178,.006);
  return {
    root:container,
    update(state,speed,assembled){
      const flying=state!==FlightState.Ground&&state!==FlightState.Jump;
      const pulse=flying? MathUtils.clamp(.95+speed/65,.95,1.6):.78;
      const active=MathUtils.smoothstep(assembled,.63,.90);
      metals.plasma.emissiveIntensity = .6 * pulse * active;
      metals.hot.emissiveIntensity = 1.3*pulse*active;
      metals.visor.emissiveIntensity = 1.1*active;
      visorLight.intensity=.45*active;
    },
    dispose(){
      for(const m of segments)m.geometry.dispose();
      for(const mat of Object.values(metals))mat.dispose();
      visorLight.dispose();
      // The armor shells live under animated bones, not the container group.
      for(const m of segments)m.removeFromParent();
      container.removeFromParent();
    },
  };
}
