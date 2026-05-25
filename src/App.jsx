import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, useAnimations, Interactive } from '@react-three/drei';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';

const MODELS = {
  PENGUIN: "/models/penguin_chick.glb",
  ENVIRONMENT: "/models/ice_world.glb",
  CRATE: "/models/crate.glb",
  ITEMS: {
    "Blue Soda": "/models/blue_soda_can.glb",
    "Green Soda": "/models/green_soda_can.glb",
    "Plastic Bag": "/models/plastic_bag.glb"
  }
};

// FIXED SCALE DICTIONARY
const SCALES = {
  PENGUIN: 0.25,      // Slightly larger
  CRATE: 0.15,        // Much larger now
  ITEMS: {
    "Blue Soda": 0.3,
    "Green Soda": 0.3,
    "Plastic Bag": 0.15 
  }
};

function PlayerPenguin({ visible, footstepsAudio }) {
  const group = useRef();
  const { scene, animations } = useGLTF(MODELS.PENGUIN);
  const clonedScene = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const mixer = useMemo(() => new THREE.AnimationMixer(clonedScene), [clonedScene]);
  const { camera } = useThree();

  useEffect(() => {
    // Perpetual Motion: Always play, just toggle visibility
    if (animations && animations.length > 0) {
      mixer.clipAction(animations[0]).play();
    }
  }, [mixer, animations]);

  useFrame((_, delta) => {
    mixer.update(delta);
    if (!visible || !group.current) return;
    
    // Positioned 1m in front, 0.5m down (Eye level view)
    const target = new THREE.Vector3(0, -0.5, -1.0).applyMatrix4(camera.matrixWorld);
    group.current.position.lerp(target, 0.1);
    group.current.lookAt(camera.position.x, group.current.position.y, camera.position.z);
  });

  return <primitive ref={group} object={clonedScene} scale={SCALES.PENGUIN} visible={visible} />;
}

function ConservationCrate({ visible, position, onDrop }) {
  const { scene } = useGLTF(MODELS.CRATE);
  const clonedScene = useMemo(() => scene.clone(), [scene]);
  
  // Force color to RED regardless of model color
  useEffect(() => {
    clonedScene.traverse(child => {
      if (child.isMesh) child.material.color.set("#ef4444");
    });
  }, [clonedScene]);

  return (
    <group visible={visible}>
      <Interactive onSelect={onDrop}>
        <primitive object={clonedScene} position={position} scale={SCALES.CRATE} />
      </Interactive>
    </group>
  );
}

function GarbageItem({ type, position, onPickUp }) {
  const { scene } = useGLTF(MODELS.ITEMS[type]);
  const clonedScene = useMemo(() => scene.clone(), [scene]);
  
  return (
    <Interactive onSelect={() => onPickUp(type)}>
      <primitive object={clonedScene} position={position} scale={SCALES.ITEMS[type]} />
    </Interactive>
  );
}

export default function App() {
  const [gameState, setGameState] = useState('MENU');
  const [items, setItems] = useState([]);
  const [carriedItem, setCarriedItem] = useState(null);
  const [score, setScore] = useState(0);

  const sounds = {
    ambience: useRef(new Audio("/audios/antarctic_ambience.mp3")),
    collect: useRef(new Audio("/audios/collect.mp3")),
    drop: useRef(new Audio("/audios/drop.mp3")),
    footsteps: useRef(new Audio("/audios/snow_footsteps.mp3"))
  };

  const spawnItems = useCallback(() => {
    const itemTypes = Object.keys(MODELS.ITEMS);
    setItems(Array.from({ length: 6 }).map((_, i) => ({
      id: i,
      type: itemTypes[Math.floor(Math.random() * itemTypes.length)],
      pos: [(Math.random() - 0.5) * 4, -0.6, (Math.random() - 0.5) * 4 - 2]
    })));
  }, []);

  const handlePickUp = (type, id) => {
    if (carriedItem) return;
    setCarriedItem(type);
    setItems(items.filter(item => item.id !== id));
    sounds.collect.current.play();
  };

  const handleDrop = () => {
    if (!carriedItem) return;
    setScore(s => s + 20);
    setCarriedItem(null);
    sounds.drop.current.play();
    spawnItems();
  };

  return (
    <div id="xr-overlay" style={{ width: '100vw', height: '100vh', background: gameState === 'PLAYING' ? 'transparent' : '#0b1d3a' }}>
      <Canvas camera={{ position: [0, 1.5, 0] }}>
        <ambientLight intensity={1.5} />
        {gameState === 'PLAYING' && (
          <>
            <PlayerPenguin visible={true} />
            <ConservationCrate visible={true} position={[0, -0.6, -2.5]} onDrop={handleDrop} />
            {items.map(item => <GarbageItem key={item.id} {...item} onPickUp={(t) => handlePickUp(t, item.id)} />)}
          </>
        )}
      </Canvas>
    </div>
  );
}