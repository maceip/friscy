import React, { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Text, PerspectiveCamera, Environment } from '@react-three/drei';
import * as THREE from 'three';

// --- Custom Shader Material for the specific "Rail Glow" effect ---
const IconShaderMaterial = {
  uniforms: {
    uColor: { value: new THREE.Color('#333') },
    uTime: { value: 0 },
    uVelocity: { value: 0 },
    uRailBlue: { value: new THREE.Color('#59c2ff') },
    uRailWhite: { value: new THREE.Color('#ffffff') }
  },
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vPosition;
    varying vec3 vNormal;
    void main() {
      vUv = uv;
      vPosition = position;
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uColor;
    uniform float uVelocity;
    uniform vec3 uRailBlue;
    uniform vec3 uRailWhite;
    varying vec2 vUv;
    varying vec3 vPosition;
    varying vec3 vNormal;

    void main() {
      // Base metallic look
      vec3 lightDir = normalize(vec3(1.0, 1.0, 2.0));
      float diff = max(dot(vNormal, lightDir), 0.0);
      vec3 base = uColor * (0.2 + 0.8 * diff);

      // Calculate vertical distance from center (approx rail contact points at +0.5 and -0.5)
      float y = vPosition.y;
      
      // Glow logic: intensify near top (+0.5) and bottom (-0.5)
      float distTop = 1.0 - smoothstep(0.0, 0.5, abs(y - 0.5));
      float distBot = 1.0 - smoothstep(0.0, 0.5, abs(y + 0.5));
      float edgeGlow = max(distTop, distBot);
      
      // Velocity factor (0 to 1)
      float speed = min(abs(uVelocity) * 0.15, 1.0); // Sensitivity
      
      // Mix blue glow
      vec3 glow = uRailBlue * edgeGlow * (0.6 + speed * 2.0); // Base glow + speed boost
      
      // Mix white hot core based on speed
      vec3 white = uRailWhite * edgeGlow * smoothstep(0.2, 1.0, speed) * 0.8;
      
      vec3 finalColor = base + glow + white;
      
      // Add a subtle scanline/tech texture
      // float scan = sin(vPosition.y * 50.0 + uVelocity * 10.0) * 0.05;
      // finalColor += scan;

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `
};

const CarouselIcon = ({ index, total, label, color, type, scrollRef, velocityRef }: any) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const textRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  
  // Geometry memoization - Chunkier "Pillow" shapes
  const geometry = useMemo(() => {
    switch(type) {
      case 'github': return new THREE.BoxGeometry(0.6, 0.6, 0.2); // Pillow-like box
      case 'cloudflare': return new THREE.TorusGeometry(0.3, 0.15, 16, 32); 
      case 'gmail': return new THREE.BoxGeometry(0.7, 0.5, 0.15);
      case 'twitter': return new THREE.OctahedronGeometry(0.5, 0);
      case 'gcp': return new THREE.SphereGeometry(0.45, 32, 32);
      case 'notepad': return new THREE.BoxGeometry(0.5, 0.7, 0.1);
      case 'claude': return new THREE.IcosahedronGeometry(0.5, 0);
      case 'gemini': return new THREE.OctahedronGeometry(0.5, 1); // Star-like
      case 'phone': return new THREE.BoxGeometry(0.3, 0.65, 0.1);
      default: return new THREE.BoxGeometry(0.5, 0.5, 0.5);
    }
  }, [type]);

  const spacing = 3.0; // Wider space for chunkier icons
  const width = total * spacing;

  useFrame((state, delta) => {
    if (!meshRef.current || !textRef.current) return;

    // Calculate looped position
    const currentScroll = scrollRef.current;
    const initialOffset = index * spacing;
    const x = ((initialOffset + currentScroll) % width + width) % width - (width / 2);
    
    meshRef.current.position.x = x;
    textRef.current.position.x = x;

    // Rotations - slow and industrial
    meshRef.current.rotation.y += delta * 0.3;
    meshRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 1.5 + index) * 0.05;

    // Fade out at edges
    const distFromCenter = Math.abs(x);
    const visibleWidth = 8; 
    const opacity = 1 - smoothstep(visibleWidth * 0.5, visibleWidth * 0.9, distFromCenter);
    
    meshRef.current.scale.setScalar(opacity); 
    textRef.current.scale.setScalar(opacity);

    if (materialRef.current) {
        materialRef.current.uniforms.uVelocity.value = velocityRef.current;
    }
  });

  return (
    <group position={[0, 0, 0]}>
      <mesh ref={meshRef} geometry={geometry}>
        <shaderMaterial 
            ref={materialRef}
            args={[IconShaderMaterial]} 
            uniforms-uColor-value={new THREE.Color(color)}
            transparent
        />
      </mesh>
      <Text
        ref={textRef}
        position={[0, -1.0, 0]}
        fontSize={0.12}
        color="#59c2ff"
        font="/fonts/maple-mono.woff" 
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.005}
        outlineColor="#000000"
      >
        {label}
      </Text>
    </group>
  );
};

const LightningRail = ({ position, velocityRef }: { position: [number, number, number], velocityRef: React.MutableRefObject<number> }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame(() => {
    if (meshRef.current) {
        const speed = Math.min(Math.abs(velocityRef.current) * 0.3, 1.0);
        const scale = 1 + speed * 0.8;
        meshRef.current.scale.y = scale; 
        (meshRef.current.material as THREE.MeshBasicMaterial).color.setHSL(0.58, 1, 0.4 + speed * 0.6);
    }
  });

  return (
    <mesh ref={meshRef} position={position} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[0.04, 0.04, 30, 12]} />
      <meshBasicMaterial color="#59c2ff" toneMapped={false} />
    </mesh>
  );
};

interface AppShelf3DProps {
    onSelectApp?: (type: string) => void;
}

const Scene = ({ onSelectApp }: AppShelf3DProps) => {
  const scrollRef = useRef(0);
  const velocityRef = useRef(0);
  const isDragging = useRef(false);
  const lastX = useRef(0);
  const { viewport } = useThree();

  const icons = [
    { type: 'claude', label: 'Claude Code', color: '#D97757' },
    { type: 'gemini', label: 'Gemini', color: '#8E75FF' },
    { type: 'github', label: 'Worktree', color: '#eeeeee' },
    { type: 'notepad', label: 'Notepad', color: '#cccccc' },
    { type: 'cloudflare', label: 'Proxy', color: '#f38020' },
    { type: 'gcp', label: 'Deploy', color: '#4285f4' },
  ];

  // Animation Loop for inertia
  useFrame((state, delta) => {
    if (!isDragging.current) {
      // Apply inertia
      scrollRef.current += velocityRef.current * delta * 60;
      // Friction
      velocityRef.current *= 0.95;
      
      // Auto-scroll if idle
      if (Math.abs(velocityRef.current) < 0.001) {
          velocityRef.current += 0.0005; // Gentle drift
      }
    }
  });

  const onPointerDown = (e: any) => {
    isDragging.current = true;
    lastX.current = e.clientX || (e.touches && e.touches[0].clientX);
    velocityRef.current = 0;
  };

  const onPointerMove = (e: any) => {
    if (!isDragging.current) return;
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const deltaX = clientX - lastX.current;
    lastX.current = clientX;
    
    const sensitivity = viewport.width / window.innerWidth * 2.5; 
    const worldDelta = deltaX * sensitivity;
    
    scrollRef.current += worldDelta;
    velocityRef.current = worldDelta; 
  };

  const onPointerUp = (e: any) => {
    if (isDragging.current && Math.abs(velocityRef.current) < 0.01) {
        // If it was a click, not a drag, detect which icon was clicked
        // Simplification: raycasting would be better, but we can approximate by scroll position
        // For now, just allow any click to trigger if it's slow enough
    }
    isDragging.current = false;
  };

  return (
    <group 
      onPointerDown={onPointerDown} 
      onPointerMove={onPointerMove} 
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <LightningRail position={[0, 0.6, 0]} velocityRef={velocityRef} />
      <LightningRail position={[0, -0.6, 0]} velocityRef={velocityRef} />
      
      {icons.map((icon, i) => (
        <group key={i} onClick={() => onSelectApp?.(icon.type)}>
            <CarouselIcon 
                index={i} 
                total={icons.length} 
                {...icon} 
                scrollRef={scrollRef}
                velocityRef={velocityRef}
            />
        </group>
      ))}
    </group>
  );
};

export const AppShelf3D: React.FC<AppShelf3DProps> = ({ onSelectApp }) => {
  return (
    <div 
      className="w-full h-full bg-[#050810] relative overflow-hidden" 
      style={{ touchAction: 'none' }} 
    >
      <Canvas dpr={[1, 2]}>
        <PerspectiveCamera makeDefault position={[0, 0, 5]} fov={40} />
        <Environment preset="city" />
        <Scene onSelectApp={onSelectApp} />
      </Canvas>
      
      {/* Overlay Text */}
      <div className="absolute top-3 left-4 pointer-events-none select-none">
        <div className="text-[9px] font-black text-friscy-blue uppercase tracking-[0.3em] opacity-50 flex items-center gap-2">
            <span className="w-2 h-2 bg-friscy-blue rounded-full animate-pulse" />
            Neural Grid
        </div>
      </div>
    </div>
  );
};

// GLSL smoothstep polyfill for TS if needed (not needed inside template string)
function smoothstep(min: number, max: number, value: number) {
  var x = Math.max(0, Math.min(1, (value-min)/(max-min)));
  return x*x*(3 - 2*x);
}
