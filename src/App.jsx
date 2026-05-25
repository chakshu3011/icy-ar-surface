import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';

// --- CONFIGURATION & SCALES ---
const SCALES = {
  PENGUIN: 0.38,       
  CRATE: 0.009,        
  ITEMS: {
    "Blue Soda": 1.3,   
    "Green Soda": 1.3,  
    "Plastic Bag": 0.15 
  }
};

const MODELS = {
  PENGUIN: "/models/penguin_chick.glb",
  CRATE: "/models/crate.glb",
  ITEMS: {
    "Blue Soda": "/models/blue_soda_can.glb",
    "Green Soda": "/models/green_soda_can.glb",
    "Plastic Bag": "/models/plastic_bag.glb"
  }
};

useGLTF.preload(MODELS.PENGUIN);
useGLTF.preload(MODELS.CRATE);
useGLTF.preload(MODELS.ITEMS["Blue Soda"]);
useGLTF.preload(MODELS.ITEMS["Green Soda"]);
useGLTF.preload(MODELS.ITEMS["Plastic Bag"]);

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

// --- MOTION & BEHAVIOUR ENGINE ---
function PlayerPenguin({ visible, footstepsAudio, onPenguinUpdate }) {
  const group = useRef();
  const { scene, animations } = useGLTF(MODELS.PENGUIN);
  const clonedScene = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const mixer = useMemo(() => new THREE.AnimationMixer(clonedScene), [clonedScene]);
  const { camera } = useThree();
  
  const prevCamPos = useRef(new THREE.Vector3());
  const actions = useRef({});
  const animStateRef = useRef('idle');

  useEffect(() => {
    if (visible && animations && animations.length > 0) {
      const idleClip = animations.find(a => a.name.toLowerCase().includes('idle'));
      const walkClip = animations.find(a => a.name.toLowerCase().includes('walk') || a.name.toLowerCase().includes('run'));

      if (idleClip) actions.current.idle = mixer.clipAction(idleClip);
      if (walkClip) actions.current.walk = mixer.clipAction(walkClip);

      if (!idleClip && !walkClip) {
        actions.current.idle = mixer.clipAction(animations[0]);
        if (animations.length > 1) {
          actions.current.walk = mixer.clipAction(animations[1]);
        }
      }

      if (actions.current.idle) actions.current.idle.play();
      else if (actions.current.walk) actions.current.walk.play();
    }
    return () => mixer.stopAllAction();
  }, [visible, mixer, animations]);

  useFrame((_, delta) => {
    if (!visible || !group.current) return;
    mixer.update(delta); 
    
    // Position 1.5 meters directly ahead of the camera perspective
    const targetPosition = new THREE.Vector3(0, 0, -1.5);
    targetPosition.applyMatrix4(camera.matrixWorld);
    
    // Absolute floor locking
    targetPosition.y = 0.001; 
    group.current.position.lerp(targetPosition, delta * 7.0);
    
    // Safety check orientation framework to stop NaN math freezes
    const cameraForward = new THREE.Vector3();
    camera.getWorldDirection(cameraForward);
    cameraForward.y = 0; 
    
    if (cameraForward.lengthSq() > 0.001) {
      cameraForward.normalize();
      const lookTarget = new THREE.Vector3().copy(group.current.position).add(cameraForward);
      group.current.lookAt(lookTarget);
    }

    onPenguinUpdate(group.current.position.clone());

    // Movement animation tracking
    const camSpeed = camera.position.distanceTo(prevCamPos.current);
    const isMoving = camSpeed > 0.0015; 
    const nextAnimState = isMoving ? 'walk' : 'idle';

    if (animStateRef.current !== nextAnimState) {
      animStateRef.current = nextAnimState;
      
      if (nextAnimState === 'walk') {
        if (actions.current.walk && actions.current.idle) {
          actions.current.walk.reset().fadeIn(0.2).play();
          actions.current.idle.fadeOut(0.2);
        } else if (actions.current.idle) { 
           actions.current.idle.setEffectiveTimeScale(1.5);
        }
        if (footstepsAudio.current && footstepsAudio.current.paused) {
          footstepsAudio.current.play().catch(()=>{});
        }
      } else {
        if (actions.current.idle && actions.current.walk) {
          actions.current.idle.reset().fadeIn(0.2).play();
          actions.current.walk.fadeOut(0.2);
        } else if (actions.current.idle) {
           actions.current.idle.setEffectiveTimeScale(0.5);
        }
        if (footstepsAudio.current && !footstepsAudio.current.paused) {
          footstepsAudio.current.pause();
        }
      }
    }
    
    prevCamPos.current.copy(camera.position);
  });

  return (
    <group ref={group} visible={visible}>
      <primitive object={clonedScene} scale={SCALES.PENGUIN} />
    </group>
  );
}

// GUARANTEED 100% FLAT ENVIRONMENT SURFACE
function Environment() {
  return (
    <group>
      <ambientLight intensity={1.4} color="#ffffff" />
      <directionalLight position={[5, 10, 5]} intensity={1.2} color="#fffcf2" />
      
      {/* Dynamic programmatic perfectly flat ice floor disk */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}>
        <circleGeometry args={[30, 32]} />
        <meshStandardMaterial 
          color="#e0f2fe" 
          roughness={0.1} 
          metalness={0.05} 
          transparent
          opacity={0.5}
        />
      </mesh>
      
      {/* Navigation grid helper to show spatial progression */}
      <gridHelper args={[60, 60, '#38bdf8', '#bae6fd']} position={[0, 0, 0]} />
    </group>
  );
}

// LARGE INVISIBLE TARGET BOX FOR EASY TAPPING
function ConservationCrate({ position, onDrop }) {
  const { scene } = useGLTF(MODELS.CRATE);
  const clonedScene = useMemo(() => SkeletonUtils.clone(scene), [scene]);

  return (
    <group position={position}>
      {/* Clear tap hitbox - 0.8 meter volume cube */}
      <mesh 
        onPointerDown={(e) => {
          e.stopPropagation(); 
          onDrop();
        }}
      >
        <boxGeometry args={[0.8, 0.8, 0.8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <primitive object={clonedScene} scale={SCALES.CRATE} position={[0, 0, 0]} />
    </group>
  );
}

// LARGE INVISIBLE TARGET BOX FOR EASY TAPPING
function GarbageItem({ type, position, onPickUp }) {
  const { scene } = useGLTF(MODELS.ITEMS[type]);
  const clonedScene = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const itemScale = SCALES.ITEMS[type] || 0.1;

  return (
    <group position={position}>
      {/* Expanded target hitbox - 0.5 meter tap cushion */}
      <mesh 
        onPointerDown={(e) => {
          e.stopPropagation(); 
          onPickUp();
        }}
      >
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <primitive object={clonedScene} scale={itemScale} position={[0, 0, 0]} />
    </group>
  );
}

export default function App() {
  const [gameState, setGameState] = useState('MENU'); 
  const [items, setItems] = useState([]);
  const [carriedItem, setCarriedItem] = useState(null);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60); 
  const [xrSession, setXrSession] = useState(null);

  const penguinPosRef = useRef(new THREE.Vector3(0, 0, -1.5));
  
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
      if (xrSession) {
        xrSession.end().catch(() => {});
      }
      setGameState('GAMEOVER');
      if (ambienceAudio.current) ambienceAudio.current.pause();
      if (footstepsAudio.current) footstepsAudio.current.pause();
      if (chirpAudio.current) {
        chirpAudio.current.currentTime = 0;
        chirpAudio.current.play().catch(() => {});
      }
    }
    return () => clearInterval(timer);
  }, [gameState, timeLeft, xrSession]);

  const generateLocalItems = useCallback((centerPos) => {
    const itemTypes = Object.keys(MODELS.ITEMS);
    const generated = Array.from({ length: 5 }).map((_, i) => {
      const angle = Math.random() * Math.PI * 2;
      const radius = 1.2 + Math.random() * 1.8; 
      return {
        id: Date.now() + i,
        type: itemTypes[Math.floor(Math.random() * itemTypes.length)],
        pos: [
          centerPos.x + Math.cos(angle) * radius,
          0.02, // Sitting cleanly on flat layout
          centerPos.z + Math.sin(angle) * radius
        ]
      };
    });
    setItems(generated);
  }, []);

  const initiateXRSession = async () => {
    if (!navigator.xr) {
      setGameState('PLAYING');
      return;
    }

    const warmUp = (audioRef) => {
      if (audioRef.current) {
        audioRef.current.play().then(() => {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        }).catch(() => {});
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
      
      // Complete state purification for restart tracking consistency
      penguinPosRef.current.set(0, 0, -1.5);
      setXrSession(session);
      setScore(0);
      setCarriedItem(null);
      setTimeLeft(60); 
      
      generateLocalItems(penguinPosRef.current);
      setGameState('PLAYING');

      if (ambienceAudio.current) {
        ambienceAudio.current.currentTime = 0;
        ambienceAudio.current.play().catch(() => {});
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
    if (carriedItem) return; 

    setTimeout(() => {
      setCarriedItem(type);
      setItems((prev) => prev.filter(item => item.id !== id));
      if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(40);
      }
      if (collectAudio.current) {
        collectAudio.current.currentTime = 0;
        collectAudio.current.play().catch(() => {});
      }
    }, 0);
  }, [carriedItem]);

  const handleDrop = () => {
    if (!carriedItem) return;

    setTimeout(() => {
      setScore((s) => s + 20); 
      setCarriedItem(null);
      
      if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate([30, 50, 30]); 
      }
      if (dropAudio.current) {
        dropAudio.current.currentTime = 0;
        dropAudio.current.play().catch(() => {});
      }

      const itemTypes = Object.keys(MODELS.ITEMS);
      const angle = Math.random() * Math.PI * 2;
      const radius = 1.2 + Math.random() * 1.8;
      setItems(prev => [...prev, { 
        id: Date.now(), 
        type: itemTypes[Math.floor(Math.random() * itemTypes.length)], 
        pos: [
          penguinPosRef.current.x + Math.cos(angle) * radius,
          0.02,
          penguinPosRef.current.z + Math.sin(angle) * radius
        ]
      }]);
    }, 0);
  };

  const updatePenguinPosition = useCallback((newPos) => {
    penguinPosRef.current.copy(newPos);
  }, []);

  const handlePlayAgain = () => {
    setGameState('MENU');
    setScore(0);
    setTimeLeft(60);
  };

  return (
    <div id="xr-overlay" style={{ 
      width: '100vw', 
      height: '100vh', 
      position: 'absolute', 
      inset: 0,
      overflow: 'hidden', 
      background: gameState === 'PLAYING' ? 'transparent' : '#f8fafc',
      pointerEvents: gameState === 'PLAYING' ? 'none' : 'auto' 
    }}>
      
      {gameState === 'PLAYING' && (
        <>
          <div style={{ position: 'absolute', top: 'max(20px, env(safe-area-inset-top))', left: '20px', zIndex: 10, background: 'rgba(15, 23, 42, 0.85)', padding: '12px 16px', borderRadius: '12px', color: '#fff', fontFamily: 'sans-serif', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ fontWeight: 'bold', fontSize: '11px', color: '#94a3b8', marginBottom: '4px', letterSpacing: '0.5px' }}>CLEANUP PROGRESS</div>
            <div style={{ color: '#38bdf8', fontSize: '22px', fontWeight: 'bold' }}>{score} XP</div>
          </div>

          <div style={{ position: 'absolute', top: 'max(20px, env(safe-area-inset-top))', right: '20px', zIndex: 10, background: 'rgba(15, 23, 42, 0.85)', padding: '12px 24px', borderRadius: '12px', textAlign: 'center', fontFamily: 'sans-serif', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ color: timeLeft <= 10 ? '#ef4444' : '#fff', fontSize: '24px', fontWeight: 'bold' }}>
              0:{timeLeft.toString().padStart(2, '0')}
            </div>
          </div>

          <div style={{ position: 'absolute', bottom: 'calc(40px + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)', zIndex: 10, background: carriedItem ? 'rgba(16, 185, 129, 0.95)' : 'rgba(15, 23, 42, 0.85)', padding: '15px 30px', borderRadius: '30px', color: '#fff', fontFamily: 'sans-serif', textAlign: 'center', border: '2px solid rgba(255,255,255,0.2)', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', width: '280px' }}>
            <div style={{ fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>
              {carriedItem ? `Carrying: ${carriedItem}` : "Hands Empty"}
            </div>
            <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '4px' }}>
              {carriedItem ? "Tap the Blue Crate to drop off!" : "Look around and tap garbage items!"}
            </div>
          </div>
        </>
      )}

      {gameState === 'MENU' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', zIndex: 20, background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', color: '#fff', fontFamily: 'sans-serif', padding: '20px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '42px', marginBottom: '8px', letterSpacing: '2px', fontWeight: '900', textShadow: '0 2px 10px rgba(0,0,0,0.2)' }}>ICY SURFACE</h1>
          <p style={{ color: '#e0f2fe', marginBottom: '25px', fontSize: '18px' }}>Antarctic Habitat Cleanup</p>
          
          <div style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '20px 30px', borderRadius: '12px', marginBottom: '35px', fontSize: '14px', color: '#f8fafc', maxWidth: '320px', lineHeight: '1.6', border: '1px solid rgba(255, 255, 255, 0.2)', backdropFilter: 'blur(10px)' }}>
            <strong>Your Mission:</strong><br />
            1. Scan the floor with your camera for 3-5 seconds to calibrate floor heights.<br/>
            2. Walk around your room to guide the penguin.<br/>
            3. Tap plastic waste to collect it, then drop it inside the Blue Crate! Clean up the surface in 60 seconds.
          </div>

          <button onClick={initiateXRSession} style={{ background: '#fff', border: 'none', color: '#0284c7', padding: '16px 40px', fontSize: '18px', fontWeight: '900', borderRadius: '30px', cursor: 'pointer', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', textTransform: 'uppercase' }}>
            Enter AR
          </button>
        </div>
      )}

      {gameState === 'GAMEOVER' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', zIndex: 20, background: 'linear-gradient(135deg, #0f172a, #1e293b)', color: '#fff', fontFamily: 'sans-serif', padding: '20px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '48px', marginBottom: '10px', color: '#38bdf8' }}>TIME'S UP!</h1>
          <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '30px 50px', borderRadius: '16px', margin: '20px 0 35px 0', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase' }}>Total Cleanup XP</div>
            <div style={{ fontSize: '56px', fontWeight: '900', color: '#4ade80' }}>{score}</div>
          </div>
          <button onClick={handlePlayAgain} style={{ background: '#38bdf8', border: 'none', color: '#0f172a', padding: '16px 45px', fontSize: '16px', fontWeight: 'bold', borderRadius: '30px', cursor: 'pointer' }}>
            PLAY AGAIN
          </button>
        </div>
      )}

      {/* DYNAMIC KEY SEPARATION GUARANTEES UNMOUNT/REMOUNT CYCLE PREVENTING MEMORY FREEZES */}
      {gameState === 'PLAYING' && (
        <Canvas key={xrSession ? xrSession.id : 'fresh-canvas'} camera={{ position: [0, 1.5, 0], fov: 70 }} gl={{ alpha: true }}>
          <XRManager session={xrSession} />
          <React.Suspense fallback={null}>
            <Environment />
            <PlayerPenguin visible={true} footstepsAudio={footstepsAudio} onPenguinUpdate={updatePenguinPosition} />
            <ConservationCrate position={[0, 0, -2.0]} onDrop={handleDrop} />
            
            {items.map((item) => (
              <GarbageItem 
                key={item.id} 
                type={item.type} 
                position={item.pos} 
                onPickUp={() => handlePickUp(item.type, item.id)} 
              />
            ))}
          </React.Suspense>
        </Canvas>
      )}
    </div>
  );
}