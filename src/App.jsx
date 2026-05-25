import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, Interactive } from '@react-three/xr'; // Critical AR imports
import { useAnimations } from '@react-three/drei';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';

// --- 1. CONFIGURATION & SCALES ---
// Tweak these numbers if your cans are still too small or the bag is too big!
const SCALES = {
  PENGUIN: 0.15,
  CRATE: 0.0015,     // Your exact fix
  ITEMS: {
    "Blue Soda": 0.5, // Upped from 0.08
    "Green Soda": 0.5, // Upped from 0.08
    "Plastic Bag": 0.08 // Kept the same since it was visible
  }
};

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

// Preload assets to avoid mid-game stuttering
Object.values(MODELS).forEach(path => {
  if (typeof path === "string") useGLTF.preload(path);
  else Object.values(path).forEach(p => useGLTF.preload(p));
});

function XRManager({ session }) {
  const { gl } = useThree();
  useEffect(() => {
    if (session) {
      gl.xr.enabled = true;
      gl.xr.setReferenceSpaceType('local-floor');
      gl.xr.setSession(session).catch((err) => console.error("XR Session Bind Error:", err));
    }
  }, [session, gl]);
  return null;
}

// --- 2. 3RD PERSON PENGUIN LOGIC ---
function PlayerPenguin({ visible, footstepsAudio }) {
  const group = useRef();
  const { scene, animations } = useGLTF(MODELS.PENGUIN);
  const clonedScene = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const mixer = useMemo(() => new THREE.AnimationMixer(clonedScene), [clonedScene]);
  const { camera } = useThree();

  useEffect(() => {
    if (visible && animations && animations.length > 0) {
      mixer.clipAction(animations[0]).reset().play();
    } else {
      mixer.stopAllAction();
    }
  }, [visible, mixer, animations]);

  useFrame((_, delta) => {
    if (!visible) return;
    mixer.update(delta); 
    if (!group.current) return;
    
    // Position the penguin 1.2 meters in front of the phone, and down near the floor
    const targetPosition = new THREE.Vector3(0, -0.4, -1.2).applyMatrix4(camera.matrixWorld);
    
    // Calculate if the penguin is physically moving to trigger footsteps
    const distanceMoved = group.current.position.distanceTo(targetPosition);
    
    // Smoothly drag the penguin to the target
    group.current.position.lerp(targetPosition, delta * 8.0);
    
    // Make the penguin face perfectly forward (away from the user)
    const lookTarget = new THREE.Vector3(0, -0.4, -10).applyMatrix4(camera.matrixWorld);
    group.current.lookAt(lookTarget);

    // Audio Physics: Play footsteps only when actively moving
    if (distanceMoved > 0.01) {
      if (footstepsAudio.current && footstepsAudio.current.paused) {
        footstepsAudio.current.play().catch(() => {});
      }
    } else {
      if (footstepsAudio.current && !footstepsAudio.current.paused) {
        footstepsAudio.current.pause();
      }
    }
  });

  return (
    <group ref={group} visible={visible}>
      {/* Depending on the original model, this rotation might be needed to flip it forward */}
      <group rotation={[0, -Math.PI / 2 + Math.PI, 0]}>
        <primitive object={clonedScene} scale={SCALES.PENGUIN} />
      </group>
    </group>
  );
}

function Environment({ visible }) {
  const { scene } = useGLTF(MODELS.ENVIRONMENT);
  const clonedScene = useMemo(() => SkeletonUtils.clone(scene), [scene]);

  return (
    <group visible={visible}>
      <ambientLight intensity={1.2} color="#ffffff" />
      <directionalLight position={[5, 10, 5]} intensity={1.5} color="#fffcf2" castShadow />
      <primitive object={clonedScene} position={[0, -1.4, -1.5]} scale={[1.2, 1.2, 1.2]} />
    </group>
  );
}

function ConservationCrate({ visible, position, onDrop }) {
  const { scene } = useGLTF(MODELS.CRATE);
  const clonedScene = useMemo(() => SkeletonUtils.clone(scene), [scene]);

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
  const clonedScene = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  
  // Pulls the precise scale from our dictionary at the top
  const itemScale = SCALES.ITEMS[type] || 0.1;

  return (
    <Interactive onSelect={() => onPickUp(type)}>
      <primitive object={clonedScene} position={position} scale={itemScale} />
    </Interactive>
  );
}

export default function App() {
  const [gameState, setGameState] = useState('MENU'); 
  const [items, setItems] = useState([]);
  const [carriedItem, setCarriedItem] = useState(null);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60); 
  const [xrSession, setXrSession] = useState(null);

  const ambienceAudio = useRef(null);
  const chirpAudio = useRef(null);
  const collectAudio = useRef(null);
  const dropAudio = useRef(null);
  const footstepsAudio = useRef(null);

  useEffect(() => {
    ambienceAudio.current = new Audio("/audios/antarctic_ambience.mp3");
    ambienceAudio.current.loop = true;
    ambienceAudio.current.volume = 0.4;

    chirpAudio.current = new Audio("/audios/penguin_chirp.mp3");
    chirpAudio.current.volume = 1.0;

    collectAudio.current = new Audio("/audios/collect.mp3");
    collectAudio.current.volume = 0.8;

    dropAudio.current = new Audio("/audios/drop.mp3");
    dropAudio.current.volume = 0.8;

    footstepsAudio.current = new Audio("/audios/snow_footsteps.mp3");
    footstepsAudio.current.loop = true;
    footstepsAudio.current.volume = 0.6;

    return () => {
      if (ambienceAudio.current) ambienceAudio.current.pause();
      if (chirpAudio.current) chirpAudio.current.pause();
      if (footstepsAudio.current) footstepsAudio.current.pause();
    };
  }, []);

  useEffect(() => {
    let timer;
    if (gameState === 'PLAYING' && timeLeft > 0) {
      timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    } else if (timeLeft === 0 && gameState === 'PLAYING') {
      setGameState('GAMEOVER');
      
      if (ambienceAudio.current) ambienceAudio.current.pause();
      if (footstepsAudio.current) footstepsAudio.current.pause();
      
      if (chirpAudio.current) {
        chirpAudio.current.currentTime = 0;
        chirpAudio.current.play().catch(e => console.log("Audio play blocked:", e));
      }

      if (xrSession) xrSession.end(); 
    }
    return () => clearInterval(timer);
  }, [gameState, timeLeft, xrSession]);

  const initiateXRSession = async () => {
    if (!navigator.xr) {
      setGameState('PLAYING');
      return;
    }

    // Audio Warmup (Critical for Safari/iOS)
    const warmUp = (audioRef) => {
      if (audioRef.current) {
        audioRef.current.play().then(() => {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        }).catch(e => console.log("Warmup blocked:", e));
      }
    };

    warmUp(collectAudio);
    warmUp(dropAudio);
    warmUp(footstepsAudio);

    try {
      const session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['local-floor', 'dom-overlay'],
        domOverlay: { root: document.getElementById('xr-overlay') || document.body }
      });
      
      setXrSession(session);
      setScore(0);
      setCarriedItem(null);
      setTimeLeft(60); 
      
      const itemTypes = Object.keys(MODELS.ITEMS);
      const initialItems = Array.from({ length: 5 }).map((_, i) => ({
        id: Date.now() + i,
        type: itemTypes[Math.floor(Math.random() * itemTypes.length)],
        // Spawns items randomly around the floor
        pos: [(Math.random() - 0.5) * 6, -1.0, (Math.random() - 0.5) * 6 - 2]
      }));
      setItems(initialItems);

      setGameState('PLAYING');

      if (ambienceAudio.current) {
        ambienceAudio.current.currentTime = 0;
        ambienceAudio.current.play().catch(e => console.log("Audio blocked:", e));
      }

      session.addEventListener('end', () => {
        setXrSession(null);
        if (ambienceAudio.current) ambienceAudio.current.pause();
        if (footstepsAudio.current) footstepsAudio.current.pause();
        setGameState(prev => prev === 'PLAYING' ? 'MENU' : prev);
      });
    } catch (e) {
      console.error("Failed to start AR Session:", e);
      setGameState('PLAYING');
    }
  };

  const handlePickUp = useCallback((type, id) => {
    if (carriedItem) return; // Prevent dual-wielding garbage

    setTimeout(() => {
      setCarriedItem(type);
      setItems((prev) => prev.filter(item => item.id !== id));

      if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(40);
      }
      if (collectAudio.current) {
        collectAudio.current.currentTime = 0;
        collectAudio.current.play().catch(e => console.log("Audio blocked:", e));
      }
    }, 0);
  }, [carriedItem]);

  const handleDrop = useCallback(() => {
    if (!carriedItem) return;

    setTimeout(() => {
      setScore((s) => s + 20); 
      setCarriedItem(null);

      if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate([30, 50, 30]); 
      }
      if (dropAudio.current) {
        dropAudio.current.currentTime = 0;
        dropAudio.current.play().catch(e => console.log("Audio blocked:", e));
      }

      // Respawn a new item to keep the hunt going
      const itemTypes = Object.keys(MODELS.ITEMS);
      setItems(prev => [...prev, { 
        id: Date.now(), 
        type: itemTypes[Math.floor(Math.random() * itemTypes.length)], 
        pos: [(Math.random() - 0.5) * 6, -1.0, (Math.random() - 0.5) * 6 - 2] 
      }]);
    }, 0);
  }, [carriedItem]);

  const handlePlayAgain = () => {
    window.location.reload();
  };

  return (
    <div id="xr-overlay" style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden', background: gameState === 'PLAYING' ? 'transparent' : '#f8fafc' }}>
      
      {gameState === 'PLAYING' && (
        <>
          <div style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 10, background: 'rgba(15, 23, 42, 0.85)', padding: '15px', borderRadius: '12px', color: '#fff', fontFamily: 'sans-serif', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ fontWeight: 'bold', fontSize: '12px', color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase' }}>CLEANUP PROGRESS</div>
            <div style={{ color: '#38bdf8', fontSize: '24px', fontWeight: 'bold' }}>{score} XP</div>
          </div>

          <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 10, background: 'rgba(15, 23, 42, 0.85)', padding: '12px 24px', borderRadius: '12px', textAlign: 'center', fontFamily: 'sans-serif', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ color: timeLeft <= 10 ? '#ef4444' : '#fff', fontSize: '28px', fontWeight: 'bold' }}>
              0:{timeLeft.toString().padStart(2, '0')}
            </div>
          </div>

          <div style={{ position: 'absolute', bottom: '40px', left: '50%', transform: 'translateX(-50%)', zIndex: 10, background: carriedItem ? 'rgba(16, 185, 129, 0.9)' : 'rgba(15, 23, 42, 0.85)', padding: '15px 30px', borderRadius: '30px', color: '#fff', fontFamily: 'sans-serif', textAlign: 'center', transition: 'background 0.3s ease', border: '2px solid rgba(255,255,255,0.2)', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
            <div style={{ fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>
              {carriedItem ? `Carrying: ${carriedItem}` : "Hands Empty"}
            </div>
            <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '4px' }}>
              {carriedItem ? "Tap the Red Sled to drop off!" : "Walk to the garbage and tap to pick it up!"}
            </div>
          </div>
        </>
      )}

      {gameState === 'MENU' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', zIndex: 20, background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', color: '#fff', fontFamily: 'sans-serif', padding: '20px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '42px', marginBottom: '8px', letterSpacing: '2px', fontWeight: '900', textShadow: '0 2px 10px rgba(0,0,0,0.2)' }}>ICY SURFACE</h1>
          <p style={{ color: '#e0f2fe', marginBottom: '25px', fontSize: '18px' }}>Antarctic Habitat Cleanup</p>
          
          <div style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '20px 30px', borderRadius: '12px', marginBottom: '35px', fontSize: '15px', color: '#f8fafc', maxWidth: '320px', lineHeight: '1.6', border: '1px solid rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)' }}>
            <strong>Your Mission:</strong><br />
            Walk ICY around the ice floe. Tap plastic waste to pick it up, then tap the Red Sled to secure the trash. Clean up as much as possible in 60 seconds!
          </div>

          <button onClick={initiateXRSession} style={{ background: '#fff', border: 'none', color: '#0284c7', padding: '16px 40px', fontSize: '18px', fontWeight: '900', borderRadius: '30px', cursor: 'pointer', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', textTransform: 'uppercase' }}>
            Enter AR
          </button>
        </div>
      )}

      {gameState === 'GAMEOVER' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', zIndex: 20, background: 'linear-gradient(135deg, #0f172a, #1e293b)', color: '#fff', fontFamily: 'sans-serif', padding: '20px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '48px', marginBottom: '10px', color: '#38bdf8', textShadow: '0 2px 10px rgba(56, 189, 248, 0.4)' }}>TIME'S UP!</h1>
          
          <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '30px 50px', borderRadius: '16px', margin: '20px 0 35px 0', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>Total Cleanup XP</div>
            <div style={{ fontSize: '56px', fontWeight: '900', color: '#4ade80' }}>{score}</div>
          </div>

          <div style={{ display: 'flex', gap: '15px' }}>
            <button onClick={handlePlayAgain} style={{ background: '#38bdf8', border: 'none', color: '#0f172a', padding: '16px 35px', fontSize: '16px', fontWeight: 'bold', borderRadius: '30px', cursor: 'pointer', boxShadow: '0 8px 20px rgba(56, 189, 248, 0.3)' }}>
              PLAY AGAIN
            </button>
            <button onClick={() => setGameState('THANKYOU')} style={{ background: 'transparent', border: '2px solid #64748b', color: '#f8fafc', padding: '16px 35px', fontSize: '16px', fontWeight: 'bold', borderRadius: '30px', cursor: 'pointer' }}>
              EXIT GAME
            </button>
          </div>
        </div>
      )}

      {gameState === 'THANKYOU' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', zIndex: 30, background: '#0f172a', color: '#fff', fontFamily: 'sans-serif', padding: '30px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '42px', marginBottom: '20px', color: '#4ade80' }}>Habitat Secured!</h1>
          <p style={{ fontSize: '18px', color: '#cbd5e1', maxWidth: '450px', lineHeight: '1.6', marginBottom: '40px' }}>
            Emperor penguins rely on clean, stable sea ice to raise their chicks. By removing plastic debris from the floe, you helped keep ICY's home pristine and safe. Thank you for playing!
          </p>
          <div style={{ width: '60px', height: '4px', background: '#4ade80', borderRadius: '2px', opacity: 0.5 }}></div>
        </div>
      )}

      <Canvas camera={{ position: [0, 1.5, 0], fov: 70 }} gl={{ alpha: true }}>
        <XRManager session={xrSession} />
        
        {gameState === 'PLAYING' && (
          <>
            <Environment visible={true} />
            <PlayerPenguin visible={true} footstepsAudio={footstepsAudio} />
            
            <ConservationCrate visible={true} position={[-1.5, -1.0, -2.5]} onDrop={handleDrop} />
            
            {items.map((item) => (
              <GarbageItem 
                key={item.id} 
                type={item.type} 
                position={item.pos} 
                onPickUp={(type) => handlePickUp(type, item.id)} 
              />
            ))}
          </>
        )}
      </Canvas>
    </div>
  );
}