import { useState, useMemo, useRef, useEffect, Suspense } from 'react';
import { Canvas, useFrame, extend, useThree } from '@react-three/fiber';
import {
  OrbitControls,
  Environment,
  PerspectiveCamera,
  shaderMaterial,
  Float,
  Stars,
  Sparkles,
  useTexture,
  Text
} from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { MathUtils } from 'three';
import * as random from 'maath/random';
import { GestureRecognizer, FilesetResolver, DrawingUtils } from "@mediapipe/tasks-vision";

// --- 动态生成照片列表 (top.jpg + 1.jpg 到 31.jpg) ---
const TOTAL_NUMBERED_PHOTOS = 24;
// 修改：将 top.jpg 加入到数组开头
const bodyPhotoPaths = [
  '/photos/top.jpg',
  ...Array.from({ length: TOTAL_NUMBERED_PHOTOS }, (_, i) => `/photos/${i + 1}.jpg`)
];

// --- 视觉配置 ---
const CONFIG = {
  colors: {
    emerald: '#004225', // 纯正祖母绿
    gold: '#FFD700',
    silver: '#ECEFF1',
    red: '#D32F2F',
    green: '#2E7D32',
    white: '#FFFFFF',   // 纯白色
    warmLight: '#FFD54F',
    lights: ['#FF0000', '#00FF00', '#0000FF', '#FFFF00'], // 彩灯
    // 拍立得边框颜色池 (复古柔和色系)
    borders: ['#FFFAF0', '#F0E68C', '#E6E6FA', '#FFB6C1', '#98FB98', '#87CEFA', '#FFDAB9'],
    // 圣诞元素颜色
    giftColors: ['#FF1744', '#FFD700', '#448AFF', '#00E676', '#FF4081', '#7C4DFF'],
    candyColors: ['#FF0000', '#FFFFFF']
  },
  counts: {
    foliage: 15000,
    ornaments: 200,   // 拍立得照片数量
    elements: 500,    // 圣诞元素数量
    lights: 800       // 彩灯数量
  },
  tree: { height: 22, radius: 9 }, // 树体尺寸
  photos: {
    // top 属性不再需要，因为已经移入 body
    body: bodyPhotoPaths
  }
};

// --- Shader Material (Foliage) ---
const FoliageMaterial = shaderMaterial(
  { uTime: 0, uColor: new THREE.Color(CONFIG.colors.emerald), uProgress: 0 },
  `uniform float uTime; uniform float uProgress; attribute vec3 aTargetPos; attribute float aRandom;
  varying vec2 vUv; varying float vMix;
  float cubicInOut(float t) { return t < 0.5 ? 4.0 * t * t * t : 0.5 * pow(2.0 * t - 2.0, 3.0) + 1.0; }
  void main() {
    vUv = uv;
    vec3 noise = vec3(sin(uTime * 1.5 + position.x), cos(uTime + position.y), sin(uTime * 1.5 + position.z)) * 0.15;
    float t = cubicInOut(uProgress);
    vec3 finalPos = mix(position, aTargetPos + noise, t);
    vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
    gl_PointSize = (60.0 * (1.0 + aRandom)) / -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
    vMix = t;
  }`,
  `uniform vec3 uColor; varying float vMix;
  void main() {
    float r = distance(gl_PointCoord, vec2(0.5)); if (r > 0.5) discard;
    vec3 finalColor = mix(uColor * 0.3, uColor * 1.2, vMix);
    gl_FragColor = vec4(finalColor, 1.0);
  }`
);
extend({ FoliageMaterial });

// --- Helper: Tree Shape ---
const getTreePosition = () => {
  const h = CONFIG.tree.height; const rBase = CONFIG.tree.radius;
  const y = (Math.random() * h) - (h / 2); const normalizedY = (y + (h/2)) / h;
  const currentRadius = rBase * (1 - normalizedY); const theta = Math.random() * Math.PI * 2;
  const r = Math.random() * currentRadius;
  return [r * Math.cos(theta), y, r * Math.sin(theta)];
};

// --- Component: Foliage ---
const Foliage = ({ state }: { state: 'CHAOS' | 'FORMED' }) => {
  const materialRef = useRef<any>(null);
  const { positions, targetPositions, randoms } = useMemo(() => {
    const count = CONFIG.counts.foliage;
    const positions = new Float32Array(count * 3); const targetPositions = new Float32Array(count * 3); const randoms = new Float32Array(count);
    const spherePoints = random.inSphere(new Float32Array(count * 3), { radius: 25 }) as Float32Array;
    for (let i = 0; i < count; i++) {
      positions[i*3] = spherePoints[i*3]; positions[i*3+1] = spherePoints[i*3+1]; positions[i*3+2] = spherePoints[i*3+2];
      const [tx, ty, tz] = getTreePosition();
      targetPositions[i*3] = tx; targetPositions[i*3+1] = ty; targetPositions[i*3+2] = tz;
      randoms[i] = Math.random();
    }
    return { positions, targetPositions, randoms };
  }, []);
  useFrame((rootState, delta) => {
    if (materialRef.current) {
      materialRef.current.uTime = rootState.clock.elapsedTime;
      const targetProgress = state === 'FORMED' ? 1 : 0;
      materialRef.current.uProgress = MathUtils.damp(materialRef.current.uProgress, targetProgress, 1.5, delta);
    }
  });
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aTargetPos" args={[targetPositions, 3]} />
        <bufferAttribute attach="attributes-aRandom" args={[randoms, 1]} />
      </bufferGeometry>
      {/* @ts-ignore */}
      <foliageMaterial ref={materialRef} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
};

// --- Component: Photo Ornaments (Double-Sided Polaroid) ---
const PhotoOrnaments = ({ state, selectedIndex, dragging, dragPos, zoomFactor }: { state: 'CHAOS' | 'FORMED', selectedIndex?: number | null, dragging?: boolean, dragPos?: THREE.Vector3 | null, zoomFactor?: number }) => {
  const { camera } = useThree();
  const textures = useSafeTextures(CONFIG.photos.body);
  const count = CONFIG.counts.ornaments;
  const groupRef = useRef<THREE.Group>(null);

  const borderGeometry = useMemo(() => new THREE.PlaneGeometry(1.2, 1.5), []);
  const photoGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);

  const data = useMemo(() => {
    return new Array(count).fill(0).map((_, i) => {
      const chaosPos = new THREE.Vector3((Math.random()-0.5)*70, (Math.random()-0.5)*70, (Math.random()-0.5)*70);
      const h = CONFIG.tree.height; const y = (Math.random() * h) - (h / 2);
      const rBase = CONFIG.tree.radius;
      const currentRadius = (rBase * (1 - (y + (h/2)) / h)) + 0.5;
      const theta = Math.random() * Math.PI * 2;
      const targetPos = new THREE.Vector3(currentRadius * Math.cos(theta), y, currentRadius * Math.sin(theta));

      const isBig = Math.random() < 0.2;
      const baseScale = isBig ? 2.2 : 0.8 + Math.random() * 0.6;
      const weight = 0.8 + Math.random() * 1.2;
      const borderColor = CONFIG.colors.borders[Math.floor(Math.random() * CONFIG.colors.borders.length)];

      const rotationSpeed = {
        x: (Math.random() - 0.5) * 1.0,
        y: (Math.random() - 0.5) * 1.0,
        z: (Math.random() - 0.5) * 1.0
      };
      const chaosRotation = new THREE.Euler(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
      const captionPool = [
        'Merry Moments', 'Holiday Magic', 'Winter Wishes', 'Joy & Peace', 'Season of Love',
        'Warm Hugs', 'Bright Lights', 'Sweet Memories', 'Sparkling Night', 'Happy Times',
        'Festive Cheer', 'Snowy Dreams', 'Love & Light', 'Cheers!', 'Stay Merry'
      ];
      const caption = captionPool[Math.floor(Math.random() * captionPool.length)];

      return {
        chaosPos, targetPos, scale: baseScale, weight,
        textureIndex: i % textures.length,
        borderColor,
        caption,
        currentPos: chaosPos.clone(),
        chaosRotation,
        rotationSpeed,
        wobbleOffset: Math.random() * 10,
        wobbleSpeed: 0.5 + Math.random() * 0.5
      };
    });
  }, [textures, count]);

  useFrame((stateObj, delta) => {
    if (!groupRef.current) return;
    const isFormed = state === 'FORMED';
    const time = stateObj.clock.elapsedTime;

    groupRef.current.children.forEach((group, i) => {
      const objData = data[i];
      const target = isFormed ? objData.targetPos : objData.chaosPos;
      const isSelected = dragging && selectedIndex === i && dragPos;
      if (isSelected && dragPos) {
        group.position.lerp(dragPos, delta * 8);
        group.lookAt(camera.position);
      } else {
        objData.currentPos.lerp(target, delta * (isFormed ? 0.8 * objData.weight : 0.5));
        group.position.copy(objData.currentPos);
      }

      if (isFormed) {
         if (isSelected) return;
         const targetLookPos = new THREE.Vector3(group.position.x * 2, group.position.y + 0.5, group.position.z * 2);
         group.lookAt(targetLookPos);

         const wobbleX = Math.sin(time * objData.wobbleSpeed + objData.wobbleOffset) * 0.05;
         const wobbleZ = Math.cos(time * objData.wobbleSpeed * 0.8 + objData.wobbleOffset) * 0.05;
         group.rotation.x += wobbleX;
         group.rotation.z += wobbleZ;

      } else {
         if (!isSelected) {
           group.rotation.x += delta * objData.rotationSpeed.x;
           group.rotation.y += delta * objData.rotationSpeed.y;
           group.rotation.z += delta * objData.rotationSpeed.z;
         }
      }
    });
  });

  return (
    <group ref={groupRef}>
      {data.map((obj, i) => (
        <group key={i} scale={[obj.scale * (selectedIndex === i && zoomFactor ? zoomFactor : 1), obj.scale * (selectedIndex === i && zoomFactor ? zoomFactor : 1), obj.scale * (selectedIndex === i && zoomFactor ? zoomFactor : 1)]} rotation={state === 'CHAOS' ? obj.chaosRotation : [0,0,0]} userData={{ type: 'photo', index: i }}>
          {/* 正面 */}
          <group position={[0, 0, 0.015]}>
            <mesh geometry={photoGeometry}>
              <meshStandardMaterial
                map={textures[obj.textureIndex]}
                roughness={0.5} metalness={0}
                emissive={CONFIG.colors.white} emissiveMap={textures[obj.textureIndex]} emissiveIntensity={selectedIndex === i ? 1.6 : 1.0}
                side={THREE.FrontSide}
              />
            </mesh>
            <mesh geometry={borderGeometry} position={[0, -0.15, -0.01]}>
              <meshStandardMaterial color={obj.borderColor} roughness={0.9} metalness={0} side={THREE.FrontSide} />
            </mesh>
            <Text position={[0, -0.52, 0.02]} fontSize={0.12} color="#FFFFFF" outlineWidth={0.02} outlineColor="#000000" outlineOffsetX={0.02} outlineOffsetY={-0.02} outlineBlur={0.02} maxWidth={1.05} textAlign="center" anchorX="center" anchorY="top">{obj.caption}</Text>
          </group>
          {/* 背面 */}
          <group position={[0, 0, -0.015]} rotation={[0, Math.PI, 0]}>
            <mesh geometry={photoGeometry}>
              <meshStandardMaterial
                map={textures[obj.textureIndex]}
                roughness={0.5} metalness={0}
                emissive={CONFIG.colors.white} emissiveMap={textures[obj.textureIndex]} emissiveIntensity={selectedIndex === i ? 1.6 : 1.0}
                side={THREE.FrontSide}
              />
            </mesh>
            <mesh geometry={borderGeometry} position={[0, -0.15, -0.01]}>
              <meshStandardMaterial color={obj.borderColor} roughness={0.9} metalness={0} side={THREE.FrontSide} />
            </mesh>
            <Text position={[0, -0.52, 0.02]} fontSize={0.12} color="#FFFFFF" outlineWidth={0.02} outlineColor="#000000" outlineOffsetX={0.02} outlineOffsetY={-0.02} outlineBlur={0.02} maxWidth={1.05} textAlign="center" anchorX="center" anchorY="top">{obj.caption}</Text>
          </group>
        </group>
      ))}
    </group>
  );
};

// --- Component: Christmas Elements ---
const ChristmasElements = ({ state }: { state: 'CHAOS' | 'FORMED' }) => {
  const count = CONFIG.counts.elements;
  const groupRef = useRef<THREE.Group>(null);

  const boxGeometry = useMemo(() => new THREE.BoxGeometry(0.8, 0.8, 0.8), []);
  const sphereGeometry = useMemo(() => new THREE.SphereGeometry(0.5, 16, 16), []);
  const caneGeometry = useMemo(() => new THREE.CylinderGeometry(0.15, 0.15, 1.2, 8), []);

  const data = useMemo(() => {
    return new Array(count).fill(0).map(() => {
      const chaosPos = new THREE.Vector3((Math.random()-0.5)*60, (Math.random()-0.5)*60, (Math.random()-0.5)*60);
      const h = CONFIG.tree.height;
      const y = (Math.random() * h) - (h / 2);
      const rBase = CONFIG.tree.radius;
      const currentRadius = (rBase * (1 - (y + (h/2)) / h)) * 0.95;
      const theta = Math.random() * Math.PI * 2;

      const targetPos = new THREE.Vector3(currentRadius * Math.cos(theta), y, currentRadius * Math.sin(theta));

      const type = Math.floor(Math.random() * 3);
      let color; let scale = 1;
      if (type === 0) { color = CONFIG.colors.giftColors[Math.floor(Math.random() * CONFIG.colors.giftColors.length)]; scale = 0.8 + Math.random() * 0.4; }
      else if (type === 1) { color = CONFIG.colors.giftColors[Math.floor(Math.random() * CONFIG.colors.giftColors.length)]; scale = 0.6 + Math.random() * 0.4; }
      else { color = Math.random() > 0.5 ? CONFIG.colors.red : CONFIG.colors.white; scale = 0.7 + Math.random() * 0.3; }

      const rotationSpeed = { x: (Math.random()-0.5)*2.0, y: (Math.random()-0.5)*2.0, z: (Math.random()-0.5)*2.0 };
      const glowSpeed = 2 + Math.random() * 3;
      const glowOffset = Math.random() * 100;
      return { type, chaosPos, targetPos, color, scale, currentPos: chaosPos.clone(), chaosRotation: new THREE.Euler(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI), rotationSpeed, glowSpeed, glowOffset };
    });
  }, [boxGeometry, sphereGeometry, caneGeometry]);

  useFrame((stateObj, delta) => {
    if (!groupRef.current) return;
    const isFormed = state === 'FORMED';
    const time = stateObj.clock.elapsedTime;
    groupRef.current.children.forEach((child, i) => {
      const mesh = child as THREE.Mesh;
      const objData = data[i];
      const target = isFormed ? objData.targetPos : objData.chaosPos;
      objData.currentPos.lerp(target, delta * 1.5);
      mesh.position.copy(objData.currentPos);
      mesh.rotation.x += delta * objData.rotationSpeed.x; mesh.rotation.y += delta * objData.rotationSpeed.y; mesh.rotation.z += delta * objData.rotationSpeed.z;
      const base = isFormed ? 2.0 : 1.2;
      const glow = base + (Math.sin(time * objData.glowSpeed + objData.glowOffset) + 1) * 0.6;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat) mat.emissiveIntensity = glow;
    });
  });

  return (
    <group ref={groupRef}>
      {data.map((obj, i) => {
        let geometry; if (obj.type === 0) geometry = boxGeometry; else if (obj.type === 1) geometry = sphereGeometry; else geometry = caneGeometry;
        return ( <mesh key={i} scale={[obj.scale, obj.scale, obj.scale]} geometry={geometry} rotation={obj.chaosRotation}>
          <meshStandardMaterial color={obj.color} emissive={obj.color} emissiveIntensity={2.0} roughness={0.1} metalness={0.8} toneMapped={false} envMapIntensity={1.2} />
        </mesh> )})}
    </group>
  );
};

// --- Component: Fairy Lights ---
const FairyLights = ({ state }: { state: 'CHAOS' | 'FORMED' }) => {
  const count = CONFIG.counts.lights;
  const groupRef = useRef<THREE.Group>(null);
  const geometry = useMemo(() => new THREE.SphereGeometry(0.8, 8, 8), []);

  const data = useMemo(() => {
    return new Array(count).fill(0).map(() => {
      const chaosPos = new THREE.Vector3((Math.random()-0.5)*60, (Math.random()-0.5)*60, (Math.random()-0.5)*60);
      const h = CONFIG.tree.height; const y = (Math.random() * h) - (h / 2); const rBase = CONFIG.tree.radius;
      const currentRadius = (rBase * (1 - (y + (h/2)) / h)) + 0.3; const theta = Math.random() * Math.PI * 2;
      const targetPos = new THREE.Vector3(currentRadius * Math.cos(theta), y, currentRadius * Math.sin(theta));
      const color = CONFIG.colors.lights[Math.floor(Math.random() * CONFIG.colors.lights.length)];
      const speed = 2 + Math.random() * 3;
      return { chaosPos, targetPos, color, speed, currentPos: chaosPos.clone(), timeOffset: Math.random() * 100 };
    });
  }, []);

  useFrame((stateObj, delta) => {
    if (!groupRef.current) return;
    const isFormed = state === 'FORMED';
    const time = stateObj.clock.elapsedTime;
    groupRef.current.children.forEach((child, i) => {
      const objData = data[i];
      const target = isFormed ? objData.targetPos : objData.chaosPos;
      objData.currentPos.lerp(target, delta * 2.0);
      const mesh = child as THREE.Mesh;
      mesh.position.copy(objData.currentPos);
      const intensity = (Math.sin(time * objData.speed + objData.timeOffset) + 1) / 2;
      if (mesh.material) { (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = isFormed ? 3 + intensity * 4 : 0; }
    });
  });

  return (
    <group ref={groupRef}>
      {data.map((obj, i) => ( <mesh key={i} scale={[0.15, 0.15, 0.15]} geometry={geometry}>
          <meshStandardMaterial color={obj.color} emissive={obj.color} emissiveIntensity={0} toneMapped={false} />
        </mesh> ))}
    </group>
  );
};

const TreeRoot = ({ state }: { state: 'CHAOS' | 'FORMED' }) => {
  const groupRef = useRef<THREE.Group>(null);
  const rootDownLength = 60;
  const rootCurve = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, -rootDownLength, 0),
  ], false, 'catmullrom', 0.5), []);
  const rootGeometry = useMemo(() => new THREE.TubeGeometry(rootCurve, 90, 0.7, 24, false), [rootCurve]);

  const makeRibbonCurve = (angleOffset: number) => {
    const points: THREE.Vector3[] = [];
    const turns = 20;
    const radius = 0.95;
    const segments = 600;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = turns * 2 * Math.PI * t + angleOffset;
      const y = -rootDownLength * t;
      points.push(new THREE.Vector3(radius * Math.cos(angle), y, radius * Math.sin(angle)));
    }
    return new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
  };
  const ribbonCurveA = useMemo(() => makeRibbonCurve(0), []);
  const ribbonCurveB = useMemo(() => makeRibbonCurve(Math.PI), []);
  const ribbonGeometryA = useMemo(() => new THREE.TubeGeometry(ribbonCurveA, 600, 0.06, 16, false), [ribbonCurveA]);
  const ribbonGeometryB = useMemo(() => new THREE.TubeGeometry(ribbonCurveB, 600, 0.06, 16, false), [ribbonCurveB]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const t = state === 'FORMED' ? 1 : 1;
    groupRef.current.scale.lerp(new THREE.Vector3(t, t, t), delta * 3);
  });
  return (
    <group ref={groupRef} position={[0, -CONFIG.tree.height / 2 - 1.5, 0]}>
      <mesh geometry={rootGeometry}>
        <meshStandardMaterial color={CONFIG.colors.red} emissive={CONFIG.colors.red} emissiveIntensity={0.5} roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh geometry={ribbonGeometryA}>
        <meshStandardMaterial color={CONFIG.colors.white} emissive={CONFIG.colors.white} emissiveIntensity={1.3} roughness={0.35} metalness={0.1} toneMapped={false} />
      </mesh>
      <mesh geometry={ribbonGeometryB}>
        <meshStandardMaterial color={CONFIG.colors.white} emissive={CONFIG.colors.white} emissiveIntensity={1.3} roughness={0.35} metalness={0.1} toneMapped={false} />
      </mesh>
    </group>
  );
};

// --- Component: Top Star (No Photo, Pure Gold 3D Star) ---
const TopStar = ({ state }: { state: 'CHAOS' | 'FORMED' }) => {
  const groupRef = useRef<THREE.Group>(null);

  const starShape = useMemo(() => {
    const shape = new THREE.Shape();
    const outerRadius = 1.3; const innerRadius = 0.7; const points = 5;
    for (let i = 0; i < points * 2; i++) {
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      i === 0 ? shape.moveTo(radius*Math.cos(angle), radius*Math.sin(angle)) : shape.lineTo(radius*Math.cos(angle), radius*Math.sin(angle));
    }
    shape.closePath();
    return shape;
  }, []);

  const starGeometry = useMemo(() => {
    return new THREE.ExtrudeGeometry(starShape, {
      depth: 0.4, // 增加一点厚度
      bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 3,
    });
  }, [starShape]);

  // 纯金材质
  const goldMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: CONFIG.colors.gold,
    emissive: CONFIG.colors.gold,
    emissiveIntensity: 1.5, // 适中亮度，既发光又有质感
    roughness: 0.1,
    metalness: 1.0,
  }), []);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.5;
      const targetScale = state === 'FORMED' ? 1 : 0;
      groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), delta * 3);
    }
  });

  return (
    <group ref={groupRef} position={[0, CONFIG.tree.height / 2 + 1.8, 0]}>
      <Float speed={2} rotationIntensity={0.2} floatIntensity={0.2}>
        <mesh geometry={starGeometry} material={goldMaterial} />
      </Float>
    </group>
  );
};

// --- Main Scene Experience ---
const Experience = ({ sceneState, rotationSpeed, pitchY, rotationLocked, selectNdc, pinchActive, pinchNdc, palmAway, zoomFactor }: { sceneState: 'CHAOS' | 'FORMED', rotationSpeed: number, pitchY: number, rotationLocked: boolean, selectNdc?: { x: number, y: number } | null, pinchActive?: boolean, pinchNdc?: { x: number, y: number } | null, palmAway?: boolean, zoomFactor?: number }) => {
  const controlsRef = useRef<any>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const dragPlaneRef = useRef(new THREE.Plane());
  const selectedIndexRef = useRef<number | null>(null);
  const dragPosRef = useRef(new THREE.Vector3());
  const { camera, scene } = useThree();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [dragPos, setDragPos] = useState<THREE.Vector3 | null>(null);
  const prevPinchActiveRef = useRef<boolean>(false);
  useFrame((_, delta) => {
    if (controlsRef.current) {
      const minPhi = 0.4;
      const maxPhi = Math.PI / 1.7;
      const currentPhi = controlsRef.current.getPolarAngle();
      const targetPhi = Math.min(maxPhi, Math.max(minPhi, minPhi + pitchY * (maxPhi - minPhi)));
      const smoothPhi = MathUtils.damp(currentPhi, targetPhi, 3, delta);
      if (!rotationLocked) {
        controlsRef.current.setAzimuthalAngle(controlsRef.current.getAzimuthalAngle() + rotationSpeed);
        controlsRef.current.setPolarAngle(smoothPhi);
      }
      controlsRef.current.update();
    }
    if (pinchActive && pinchNdc && selectedIndexRef.current !== null) {
      const raycaster = raycasterRef.current;
      raycaster.setFromCamera(new THREE.Vector2(pinchNdc.x, pinchNdc.y), camera);
      let plane = dragPlaneRef.current;
      if (palmAway) {
        const f = camera.getWorldDirection(new THREE.Vector3());
        const p = camera.position.clone().add(f.multiplyScalar(10));
        plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), p);
      }
      const hit = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(plane, hit)) {
        dragPosRef.current.copy(hit);
        setDragPos(hit.clone());
      }
    }
  });

  useEffect(() => {
    if (selectNdc) {
      const raycaster = raycasterRef.current;
      const ndc = new THREE.Vector2(selectNdc.x, selectNdc.y);
      raycaster.setFromCamera(ndc, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);
      let idx: number | null = null;
      for (const it of intersects) {
        let obj: THREE.Object3D | null = it.object;
        while (obj && !obj.userData?.type) obj = obj.parent as THREE.Object3D | null;
        if (obj && obj.userData?.type === 'photo') { idx = obj.userData.index as number; break; }
      }
      if (idx === null) {
        let nearestIdx: number | null = null;
        let nearestDist = Infinity;
        scene.traverse(o => {
          if (o.userData?.type === 'photo') {
            const p = new THREE.Vector3();
            (o as THREE.Object3D).getWorldPosition(p);
            const pndc = p.clone().project(camera);
            const d = Math.hypot(pndc.x - ndc.x, pndc.y - ndc.y);
            if (d < 0.15 && d < nearestDist) { nearestDist = d; nearestIdx = o.userData.index as number; }
          }
        });
        idx = nearestIdx;
      }
      if (idx !== null) {
        selectedIndexRef.current = idx;
        setSelectedIndex(idx);
        const planeNormal = camera.getWorldDirection(new THREE.Vector3()).clone();
        const planePoint = itToWorldOfPhoto(idx, scene);
        dragPlaneRef.current.setFromNormalAndCoplanarPoint(planeNormal, planePoint);
      }
    }
  }, [selectNdc, camera, scene]);

  useEffect(() => {
    const prev = prevPinchActiveRef.current;
    if (!prev && pinchActive && pinchNdc && selectedIndexRef.current === null) {
      const raycaster = raycasterRef.current;
      const ndc = new THREE.Vector2(pinchNdc.x, pinchNdc.y);
      raycaster.setFromCamera(ndc, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);
      for (const it of intersects) {
        let obj: THREE.Object3D | null = it.object;
        while (obj && !obj.userData?.type) obj = obj.parent as THREE.Object3D | null;
        if (obj && obj.userData?.type === 'photo') {
          const idx = obj.userData.index as number;
          selectedIndexRef.current = idx;
          setSelectedIndex(idx);
          const planeNormal = camera.getWorldDirection(new THREE.Vector3()).clone();
          const planePoint = itToWorldOfPhoto(idx, scene);
          dragPlaneRef.current.setFromNormalAndCoplanarPoint(planeNormal, planePoint);
          break;
        }
      }
    }
    prevPinchActiveRef.current = !!pinchActive;
  }, [pinchActive, pinchNdc, camera, scene]);

  useEffect(() => {
    if (sceneState === 'FORMED') {
      selectedIndexRef.current = null;
      setSelectedIndex(null);
      setDragPos(null);
    }
  }, [sceneState]);

  const itToWorldOfPhoto = (idx: number, scn: THREE.Scene) => {
    const objs: THREE.Object3D[] = [];
    scn.traverse(o => { if (o.userData?.type === 'photo' && o.userData.index === idx) objs.push(o); });
    const target = objs[0] as THREE.Object3D;
    const p = new THREE.Vector3();
    return target ? target.getWorldPosition(p) : new THREE.Vector3();
  };

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 8, 60]} fov={45} />
      <OrbitControls ref={controlsRef} enablePan={false} enableZoom={true} minDistance={30} maxDistance={120} autoRotate={!rotationLocked && rotationSpeed === 0 && sceneState === 'FORMED'} autoRotateSpeed={0.3} minPolarAngle={0.4} maxPolarAngle={Math.PI / 1.7} />

      <color attach="background" args={['#000300']} />
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      <Environment preset="night" background={false} />

      <ambientLight intensity={0.4} color="#003311" />
      <pointLight position={[30, 30, 30]} intensity={100} color={CONFIG.colors.warmLight} />
      <pointLight position={[-30, 10, -30]} intensity={50} color={CONFIG.colors.gold} />
      <pointLight position={[0, -20, 10]} intensity={30} color="#ffffff" />

      <group position={[0, -3, 0]}>
        <Foliage state={sceneState} />
        <Suspense fallback={null}>
           <PhotoOrnaments state={sceneState} selectedIndex={selectedIndex ?? undefined} dragging={pinchActive} dragPos={dragPos ?? undefined} zoomFactor={zoomFactor} />
           <ChristmasElements state={sceneState} />
           <FairyLights state={sceneState} />
           <TopStar state={sceneState} />
        </Suspense>
        {/* <TreeRoot state={sceneState} /> */}
        <Sparkles count={600} scale={50} size={8} speed={0.4} opacity={0.4} color={CONFIG.colors.silver} />
      </group>

      <EffectComposer>
        <Bloom luminanceThreshold={0.8} luminanceSmoothing={0.1} intensity={1.5} radius={0.5} mipmapBlur />
        <Vignette eskil={false} offset={0.1} darkness={1.2} />
      </EffectComposer>
    </>
  );
};

// --- Gesture Controller ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const GestureController = ({ onGesture, onMove, onPitch, onSelectThumb, onPinchChange, onLockRotation, onStatus, onZoom, debugMode }: any) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let gestureRecognizer: GestureRecognizer;
    let requestRef: number;
    let prevY = 0.5;

    const setup = async () => {
      onStatus("DOWNLOADING AI...");
      try {
        const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm");
        gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 2
        });
        onStatus("REQUESTING CAMERA...");
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play();
            onStatus("AI READY: SHOW HAND");
            predictWebcam();
          }
        } else {
            onStatus("ERROR: CAMERA PERMISSION DENIED");
        }
      } catch (err: any) {
        onStatus(`ERROR: ${err.message || 'MODEL FAILED'}`);
      }
    };

    const predictWebcam = () => {
      if (gestureRecognizer && videoRef.current && canvasRef.current) {
        if (videoRef.current.videoWidth > 0) {
            const results = gestureRecognizer.recognizeForVideo(videoRef.current, Date.now());
            const ctx = canvasRef.current.getContext("2d");
            if (ctx && debugMode) {
                ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                canvasRef.current.width = videoRef.current.videoWidth; canvasRef.current.height = videoRef.current.videoHeight;
                if (results.landmarks) for (const landmarks of results.landmarks) {
                        const drawingUtils = new DrawingUtils(ctx);
                        drawingUtils.drawConnectors(landmarks, GestureRecognizer.HAND_CONNECTIONS, { color: "#FFD700", lineWidth: 2 });
                        drawingUtils.drawLandmarks(landmarks, { color: "#FF0000", lineWidth: 1 });
                }
            } else if (ctx && !debugMode) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

            if (results.gestures.length > 0) {
              const name = results.gestures[0][0].categoryName; const score = results.gestures[0][0].score;
              if (score > 0.5) {
                 if (name === "Open_Palm") { onGesture("CHAOS"); onLockRotation(false); }
                 if (name === "Closed_Fist") onGesture("FORMED");
                 if (debugMode) onStatus(`DETECTED: ${name}`);
                 if (name === "Pointing_Up" && score > 0.5 && results.landmarks.length > 0) {
                   const lm = results.landmarks[0];
                   const index = lm[8];
                   const ndcX = (1 - index.x) * 2 - 1;
                   const ndcY = -(index.y * 2 - 1);
                   onSelectThumb({ x: ndcX, y: ndcY });
                 } else {
                   onSelectThumb(null);
                 }
                 if (name === "Pointing_Up" && score > 0.6) {
                   onLockRotation(true);
                 }
                 if (name === "Victory" && score > 0.6) {
                   onLockRotation(true);
                 }
              }
              if (results.landmarks.length > 0) {
                const speed = (0.5 - results.landmarks[0][0].x) * 0.15;
                onMove(Math.abs(speed) > 0.01 ? speed : 0);
                const y = results.landmarks[0][0].y;
                if (Math.abs(y - prevY) > 0.02) {
                  prevY = Math.min(1, Math.max(0, y));
                  onPitch(prevY);
                }
                const lm = results.landmarks[0];
                const thumb = lm[4];
                const index = lm[8];
                const dx = thumb.x - index.x; const dy = thumb.y - index.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                const active = dist < 0.05;
                const ndcX = (1 - index.x) * 2 - 1; const ndcY = -(index.y * 2 - 1);
                let palmAway = true;
                // try world landmarks if available
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const wlm: any = (results as any).worldLandmarks?.[0];
                if (wlm) {
                  const wrist = wlm[0];
                  const indexMcp = wlm[5];
                  const pinkyMcp = wlm[17];
                  const centerZ = (indexMcp.z + pinkyMcp.z) / 2;
                  palmAway = centerZ > wrist.z + 0.01;
                }
                onPinchChange({ active, ndc: { x: ndcX, y: ndcY }, palmAway });
                if (results.landmarks.length > 1) {
                  const lm1 = results.landmarks[0];
                  const lm2 = results.landmarks[1];
                  const t2 = lm2[4]; const i2 = lm2[8];
                  const pinch2 = Math.hypot(t2.x - i2.x, t2.y - i2.y) < 0.05;
                  if (pinch2) {
                    const i1 = lm1[8];
                    const dx = i1.x - i2.x; const dy = i1.y - i2.y;
                    const d = Math.sqrt(dx*dx + dy*dy);
                    const zoom = Math.max(1, Math.min(3, d * 6));
                    onZoom(zoom);
                  } else {
                    onZoom(1);
                  }
                } else {
                  onZoom(1);
                }
              }
            } else { onMove(0); onSelectThumb(null); onZoom(1); if (debugMode) onStatus("AI READY: NO HAND"); }
        }
        requestRef = requestAnimationFrame(predictWebcam);
      }
    };
    setup();
    return () => cancelAnimationFrame(requestRef);
  }, [onGesture, onMove, onStatus, debugMode]);

  return (
    <>
      <video ref={videoRef} style={{ opacity: debugMode ? 0.6 : 0, position: 'fixed', top: 0, right: 0, width: debugMode ? '320px' : '1px', zIndex: debugMode ? 100 : -1, pointerEvents: 'none', transform: 'scaleX(-1)' }} playsInline muted autoPlay />
      <canvas ref={canvasRef} style={{ position: 'fixed', top: 0, right: 0, width: debugMode ? '320px' : '1px', height: debugMode ? 'auto' : '1px', zIndex: debugMode ? 101 : -1, pointerEvents: 'none', transform: 'scaleX(-1)' }} />
    </>
  );
};

// --- App Entry ---
export default function GrandTreeApp() {
  const [sceneState, setSceneState] = useState<'CHAOS' | 'FORMED'>('CHAOS');
  const [rotationSpeed, setRotationSpeed] = useState(0);
  const [aiStatus, setAiStatus] = useState("INITIALIZING...");
  const [debugMode, setDebugMode] = useState(false);
  const [pitchY, setPitchY] = useState(0.5);
  const [selectNdc, setSelectNdc] = useState<{ x: number, y: number } | null>(null);
  const [pinchActive, setPinchActive] = useState<boolean>(false);
  const [pinchNdc, setPinchNdc] = useState<{ x: number, y: number } | null>(null);
  const [palmAway, setPalmAway] = useState<boolean>(false);
  const [rotationLocked, setRotationLocked] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(1);

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#000', position: 'relative', overflow: 'hidden' }}>
      <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, zIndex: 1 }}>
        <Canvas dpr={[1, 2]} gl={{ toneMapping: THREE.ReinhardToneMapping }} shadows>
            <Experience sceneState={sceneState} rotationSpeed={rotationSpeed} pitchY={pitchY} rotationLocked={rotationLocked} selectNdc={selectNdc} pinchActive={pinchActive} pinchNdc={pinchNdc} palmAway={palmAway} zoomFactor={zoom} />
        </Canvas>
      </div>
      <GestureController onGesture={setSceneState} onMove={setRotationSpeed} onPitch={setPitchY} onSelectThumb={setSelectNdc} onPinchChange={({ active, ndc, palmAway }: any) => { setPinchActive(active); setPinchNdc(ndc); setPalmAway(!!palmAway); }} onLockRotation={setRotationLocked} onStatus={setAiStatus} onZoom={(z: number) => setZoom(z ?? 1)} debugMode={debugMode} />

      

      {/* UI - Buttons */}
      <div style={{ position: 'absolute', bottom: '30px', right: '40px', zIndex: 10, display: 'flex', gap: '10px' }}>
        <button onClick={() => setDebugMode(!debugMode)} style={{ padding: '12px 15px', backgroundColor: debugMode ? '#FFD700' : 'rgba(0,0,0,0.5)', border: '1px solid #FFD700', color: debugMode ? '#000' : '#FFD700', fontFamily: 'sans-serif', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', backdropFilter: 'blur(4px)' }}>
           {debugMode ? 'HIDE DEBUG' : '🛠 DEBUG'}
        </button>
        <button onClick={() => setSceneState(s => s === 'CHAOS' ? 'FORMED' : 'CHAOS')} style={{ padding: '12px 30px', backgroundColor: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255, 215, 0, 0.5)', color: '#FFD700', fontFamily: 'serif', fontSize: '14px', fontWeight: 'bold', letterSpacing: '3px', textTransform: 'uppercase', cursor: 'pointer', backdropFilter: 'blur(4px)' }}>
           {sceneState === 'CHAOS' ? 'Assemble Tree' : 'Disperse'}
        </button>
      </div>

      {/* UI - AI Status */}
      <div style={{ position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)', color: aiStatus.includes('ERROR') ? '#FF0000' : 'rgba(255, 215, 0, 0.4)', fontSize: '10px', letterSpacing: '2px', zIndex: 10, background: 'rgba(0,0,0,0.5)', padding: '4px 8px', borderRadius: '4px' }}>
        {aiStatus}
      </div>
    </div>
  );
}
// --- Safe Texture Loader ---
const WHITE_PNG_1x1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAoMBgXfYQnEAAAAASUVORK5CYII=';
const useSafeTextures = (paths: string[]) => {
  const [textures, setTextures] = useState<THREE.Texture[]>(() => paths.map(() => new THREE.TextureLoader().load(WHITE_PNG_1x1)));
  useEffect(() => {
    let mounted = true;
    const loader = new THREE.TextureLoader();
    paths.forEach((p, i) => {
      loader.load(
        p,
        tex => { if (mounted) setTextures(prev => { const next = [...prev]; next[i] = tex; return next; }); },
        undefined,
        () => { /* keep placeholder on error */ }
      );
    });
    return () => { mounted = false; };
  }, [paths]);
  return textures;
};