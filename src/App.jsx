import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, useAnimations, Interactive } from '@react-three/drei';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';

// --- CONFIGURATION ---
const MODELS = {
  PENGUIN: "/models/penguin_chick.glb",
  CRATE: "/models/crate.glb",
  ITEMS: {
    BOTTLE_BLUE: "/models/blue_soda_can.glb",
    BOTTLE_GREEN: "/models/green_soda_can.glb",
    BAG: "/models/plastic_bag.glb"
  }
};

function PlayerPenguin({ visible }) {
  const group = useRef();
  const { scene, animations } = useGLTF(MODELS.PENGUIN);
  const clonedScene = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const mixer = useMemo(() => new THREE.AnimationMixer(clonedScene), [clonedScene]);
  const { camera } = useThree();

  useEffect(() => {
    if (animations && animations.length > 0) mixer.clipAction(animations[0]).play();
  }, [mixer, animations]);

  useFrame((_, delta) => {
    mixer.update(delta);
    if (!visible || !group.current) return;
    const pos = new THREE.Vector3(0, -0.3, -1.2).applyMatrix4(camera.matrixWorld);
    group.current.position.lerp(pos, 0.1);
    group.current.lookAt(camera.position.x, group.current.position.y, camera.position.z);
  });

  return <primitive ref={group} object={clonedScene} scale={0.15} visible={visible} />;
}

function ConservationCrate({ position, onDrop }) {
  const { scene } = useGLTF(MODELS.CRATE);
  return (
    <Interactive onSelect={onDrop}>
      <primitive object={scene} position={position} scale={0.5} />
    </Interactive>
  );
}

function GarbageItem({ type, position, onPickUp }) {
  const model = useGLTF(MODELS.ITEMS[type]);
  return (
    <Interactive onSelect={() => onPickUp(type)}>
      <primitive object={model.scene.clone()} position={position} scale={0.05} />
    </Interactive>
  );
}

export default function App() {
  const [gameState, setGameState] = useState('MENU');
  const [items, setItems] = useState([]);
  const [carriedItem, setCarriedItem] = useState(null);
  const [score, setScore] = useState(0);

  // Audio refs
  const sounds = {
    ambience: useRef(new Audio("/audios/antarctic_ambience.mp3")),
    collect: useRef(new Audio("/audios/collect.mp3")),
    drop: useRef(new Audio("/audios/drop.mp3")),
    chirp: useRef(new Audio("/audios/penguin_chirp.mp3"))
  };

  const spawnItems = useCallback(() => {
    const newItems = Array.from({ length: 6 }).map((_, i) => ({
      id: i,
      type: Object.keys(MODELS.ITEMS)[Math.floor(Math.random() * 3)],
      pos: [(Math.random() - 0.5) * 4, -0.5, (Math.random() - 0.5) * 4 - 2]
    }));
    setItems(newItems);
  }, []);

  const handlePickUp = (type, id) => {
    if (carriedItem) return;
    setCarriedItem(type);
    setItems(items.filter(item => item.id !== id));
    sounds.collect.current.play();
  };

  const handleDrop = () => {
    if (!carriedItem) return;
    setScore(s => s + 10);
    setCarriedItem(null);
    sounds.drop.current.play();
    // Respawn one item
    setItems(prev => [...prev, { id: Date.now(), type: 'BOTTLE_BLUE', pos: [(Math.random()-0.5)*4, -0.5, -3] }]);
  };

  return (
    <div id="xr-overlay" style={{ width: '100vw', height: '100vh', background: '#0b1d3a' }}>
      {gameState === 'MENU' && (
        <button onClick={() => { setGameState('PLAYING'); spawnItems(); }} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', padding: '20px' }}>
          START CLEANUP
        </button>
      )}

      <Canvas camera={{ position: [0, 1.5, 0] }}>
        <ambientLight intensity={0.5} />
        {gameState === 'PLAYING' && (
          <>
            <PlayerPenguin visible={true} />
            <ConservationCrate position={[0, -0.5, -2]} onDrop={handleDrop} />
            {items.map(item => (
              <GarbageItem key={item.id} {...item} onPickUp={(t) => handlePickUp(t, item.id)} />
            ))}
          </>
        )}
      </Canvas>
    </div>
  );
}