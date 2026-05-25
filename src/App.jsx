import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, useProgress } from '@react-three/drei';
import { Interactive } from '@react-three/xr'; 
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';

// --- 1. CONFIGURATION & SCALES ---
const SCALES = {
  PLAYER: 0.25,        
  CRATE: 0.009,        
  ITEMS: {
    "Blue Soda": 0.30,      
    "Green Soda": 0.05,     
    "Plastic Bag": 0.15,
    "Plastic Bottle": 0.02  
  }
};

const MODELS = {
  PLAYER: "/models/man.glb",
  ICE_FLOOR: "/models/ice_texture.glb", 
  CRATE: "/models/crate.glb",
  ITEMS: {
    "Blue Soda": "/models/blue_soda_can.glb",
    "Green Soda": "/models/green_soda_can.glb",
    "Plastic Bag": "/models/plastic_bag.glb",
    "Plastic Bottle": "/models/plastic_bottle.glb" 
  }
};

useGLTF.preload(MODELS.PLAYER);
useGLTF.preload(MODELS.ICE_FLOOR);
useGLTF.preload(MODELS.CRATE);
useGLTF.preload(MODELS.ITEMS["Blue Soda"]);
useGLTF.preload(MODELS.ITEMS["Green Soda"]);
useGLTF.preload(MODELS.ITEMS["Plastic Bag"]);
useGLTF.preload(MODELS.ITEMS["Plastic Bottle"]);

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

// --- 2. MOTION & BEHAVIOUR ENGINE ---
function PlayerCharacter({ footstepsAudio, onPlayerUpdate }) {
  const group = useRef();
  const { scene, animations } = useGLTF(MODELS.PLAYER);
  const clonedScene = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const mixer = useMemo(() => new THREE.AnimationMixer(clonedScene), [clonedScene]);
  const { camera } = useThree();
  
  const prevCamPos = useRef(new THREE.Vector3());
  const actions = useRef({});
  const animStateRef = useRef('idle');

  useEffect(() => {
    if (animations && animations.length > 0) {
      const idleClip = animations.find(a => a.name === 'pose' || a.name.toLowerCase() === 'pose');
      const walkClip = animations.find(a => a.name === 'walking' || a.name.toLowerCase() === 'walking');

      if (idleClip) actions.current.idle = mixer.clipAction(idleClip);
      if (walkClip) actions.current.walk = mixer.clipAction(walkClip);

      if (!idleClip && !walkClip && animations[0]) {
        actions.current.idle = mixer.clipAction(animations[0]);
        if (animations.length > 1) {
          actions.current.walk = mixer.clipAction(animations[1]);
        }
      }

      if (actions.current.idle) actions.current.idle.play();
      else if (actions.current.walk) actions.current.walk.play();
    }
  }, [mixer, animations]);

  useFrame((_, delta) => {
    mixer.update(delta); 
    if (!group.current) return;
    
    const targetPosition = new THREE.Vector3(0, -0.4, -1.5);
    targetPosition.applyMatrix4(camera.matrixWorld);
    targetPosition.y = 0.001; 
    
    group.current.position.lerp(targetPosition, delta * 4.0);
    
    const cameraForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    cameraForward.y = 0; 
    cameraForward.normalize();
    const lookTarget = group.current.position.clone().add(cameraForward);
    group.current.lookAt(lookTarget);

    onPlayerUpdate(group.current.position.clone());

    const camSpeed = camera.position.distanceTo(prevCamPos.current);
    const isMoving = camSpeed > 0.002; 
    const nextAnimState = isMoving ? 'walk' : 'idle';

    if (animStateRef.current !== nextAnimState) {
      animStateRef.current = nextAnimState;
      
      if (nextAnimState === 'walk') {
        if (actions.current.walk && actions.current.idle) {
          actions.current.walk.reset().fadeIn(0.2).play();
          actions.current.walk.setEffectiveTimeScale(0.8); 
          actions.current.idle.fadeOut(0.2);
        } 
        if (footstepsAudio.current && footstepsAudio.current.paused) {
          footstepsAudio.current.play().catch(()=>{});
        }
      } else {
        if (actions.current.idle && actions.current.walk) {
          actions.current.idle.reset().fadeIn(0.2).play();
          actions.current.walk.fadeOut(0.2);
        }
        if (footstepsAudio.current && !footstepsAudio.current.paused) {
          footstepsAudio.current.pause();
        }
      }
    }
    
    prevCamPos.current.copy(camera.position);
  });

  return (
    <group ref={group}>
      <primitive object={clonedScene} scale={SCALES.PLAYER} />
    </group>
  );
}

function Environment() {
  const { scene } = useGLTF(MODELS.ICE_FLOOR);
  
  const clonedFloor = useMemo(() => {
    const clone = scene.clone();
    // CRITICAL FIX: Make the floor invisible to the raycaster so it doesn't eat your taps!
    clone.traverse(child => {
      if (child.isMesh) child.raycast = () => null; 
    });
    return clone;
  }, [scene]);

  return (
    <group>
      <ambientLight intensity={1.4} color="#ffffff" />
      <directionalLight position={[5, 10, 5]} intensity={1.2} color="#fffcf2" />
      <primitive object={clonedFloor} position={[0, -1.4, 0]} scale={[1, 1, 1]} />
    </group>
  );
}

function ConservationCrate({ position, onDrop }) {
  const { scene } = useGLTF(MODELS.CRATE);
  const clonedScene = useMemo(() => SkeletonUtils.clone(scene), [scene]);

  return (
    <group position={position}>
      <Interactive onSelect={onDrop}>
        <mesh position={[0, 0.4, 0]}>
          <boxGeometry args={[1.5, 1.5, 1.5]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <primitive object={clonedScene} scale={SCALES.CRATE} position={[0, 0, 0]} />
      </Interactive>
    </group>
  );
}

function GarbageItem({ type, position, onPickUp }) {
  const { scene } = useGLTF(MODELS.ITEMS[type]);
  const clonedScene = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const itemScale = SCALES.ITEMS[type] || 0.1;

  return (
    <group position={position}>
      <Interactive onSelect={onPickUp}>
        <mesh position={[0, 0.2, 0]}>
          <boxGeometry args={[0.8, 0.8, 0.8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <primitive object={clonedScene} scale={itemScale} position={[0, 0, 0]} />
      </Interactive>
    </group>
  );
}

// --- 3. MAIN APP ---
export default function App() {
  const [gameState, setGameState] = useState('MENU'); 
  const [items, setItems] = useState([]);
  const [carriedItem, setCarriedItem] = useState(null);
  const [itemsCleaned, setItemsCleaned] = useState(0); 
  const [timeLeft, setTimeLeft] = useState(60); 
  const [xrSession, setXrSession] = useState(null);

  const { active: assetsAreLoading, progress: assetProgress } = useProgress();
  const playerPosRef = useRef(new THREE.Vector3(0, 0, -1.5));
  
  const ambienceAudio = useRef(null);
  const winAudio = useRef(null);
  const collectAudio = useRef(null);
  const dropAudio = useRef(null);
  const footstepsAudio = useRef(null);

  useEffect(() => {
    ambienceAudio.current = new Audio("/audios/antarctic_ambience.mp3");
    ambienceAudio.current.loop = true;
    ambienceAudio.current.volume = 0.4;

    winAudio.current = new Audio("/audios/win.mp3");
    winAudio.current.volume = 1.0;

    collectAudio.current = new Audio("/audios/collect.mp3");
    collectAudio.current.volume = 0.8;

    dropAudio.current = new Audio("/audios/drop.m4a");
    dropAudio.current.volume = 0.8;

    footstepsAudio.current = new Audio("/audios/snow_footsteps.mp3");
    footstepsAudio.current.loop = true;
    footstepsAudio.current.volume = 0.6;

    return () => {
      if (ambienceAudio.current) ambienceAudio.current.pause();
      if (winAudio.current) winAudio.current.pause();
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
      
      if (winAudio.current) {
        winAudio.current.currentTime = 0;
        winAudio.current.play().catch(() => {});
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
          0.02, 
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
      
      playerPosRef.current.set(0, 0, -1.5);
      setXrSession(session);
      setItemsCleaned(0); 
      setCarriedItem(null);
      setTimeLeft(60); 
      
      generateLocalItems(playerPosRef.current);
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

  const handleDrop = useCallback(() => {
    if (!carriedItem) return;

    setTimeout(() => {
      setItemsCleaned((count) => count + 1); 
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
          playerPosRef.current.x + Math.cos(angle) * radius,
          0.02,
          playerPosRef.current.z + Math.sin(angle) * radius
        ]
      }]);
    }, 0);
  }, [carriedItem]);

  const updatePlayerPosition = useCallback((newPos) => {
    playerPosRef.current.copy(newPos);
  }, []);

  const handlePlayAgain = () => {
    window.location.reload();
  };

  return (
    <div id="xr-overlay" style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
        
        {assetsAreLoading && gameState === 'PLAYING' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: '#0f172a', color: '#fff', fontFamily: 'sans-serif', pointerEvents: 'auto' }}>
            <div style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '12px', letterSpacing: '1px' }}>LOADING ICE ENVIRONMENTS</div>
            <div style={{ width: '200px', height: '6px', background: '#334155', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${assetProgress}%`, height: '100%', background: '#38bdf8', transition: 'width 0.2s ease-out' }} />
            </div>
            <div style={{ marginTop: '8px', color: '#94a3b8', fontSize: '13px' }}>{Math.round(assetProgress)}% Complete</div>
          </div>
        )}

        {gameState === 'PLAYING' && !assetsAreLoading && (
          <>
            <div style={{ position: 'absolute', top: 'max(20px, env(safe-area-inset-top))', left: '20px', background: 'rgba(15, 23, 42, 0.85)', padding: '12px 16px', borderRadius: '12px', color: '#fff', fontFamily: 'sans-serif', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ fontWeight: 'bold', fontSize: '11px', color: '#94a3b8', marginBottom: '4px', letterSpacing: '0.5px' }}>PLASTIC REMOVED</div>
              <div style={{ color: '#38bdf8', fontSize: '22px', fontWeight: 'bold' }}>{itemsCleaned} ITEMS</div>
            </div>

            <div style={{ position: 'absolute', top: 'max(20px, env(safe-area-inset-top))', right: '20px', background: 'rgba(15, 23, 42, 0.85)', padding: '12px 24px', borderRadius: '12px', textAlign: 'center', fontFamily: 'sans-serif', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ color: timeLeft <= 10 ? '#ef4444' : '#fff', fontSize: '24px', fontWeight: 'bold' }}>
                0:{timeLeft.toString().padStart(2, '0')}
              </div>
            </div>

            <div style={{ position: 'absolute', bottom: 'calc(40px + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)', background: carriedItem ? 'rgba(16, 185, 129, 0.95)' : 'rgba(15, 23, 42, 0.85)', padding: '15px 30px', borderRadius: '30px', color: '#fff', fontFamily: 'sans-serif', textAlign: 'center', border: '2px solid rgba(255,255,255,0.2)', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', width: '280px' }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>
                {carriedItem ? `Carrying: ${carriedItem}` : "Hands Empty"}
              </div>
              <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '4px' }}>
                {carriedItem ? "Tap the Crate to drop off!" : "Look around and tap garbage items!"}
              </div>
            </div>
          </>
        )}

        {gameState === 'MENU' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', color: '#fff', fontFamily: 'sans-serif', padding: '20px', textAlign: 'center', pointerEvents: 'auto' }}>
            <h1 style={{ fontSize: '42px', marginBottom: '8px', letterSpacing: '2px', fontWeight: '900', textShadow: '0 2px 10px rgba(0,0,0,0.2)' }}>ICY SURFACE</h1>
            <p style={{ color: '#e0f2fe', marginBottom: '25px', fontSize: '18px' }}>Habitat Cleanup Mission</p>
            
            <div style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '20px 30px', borderRadius: '12px', marginBottom: '35px', fontSize: '14px', color: '#f8fafc', maxWidth: '320px', lineHeight: '1.6', border: '1px solid rgba(255, 255, 255, 0.2)', backdropFilter: 'blur(10px)' }}>
              <strong>Your Mission:</strong><br />
              1. Scan the floor with your camera for 3-5 seconds.<br/>
              2. Walk around your room to guide your character.<br/>
              3. Tap plastic waste to collect it, then drop it inside the Crate!
            </div>

            <button onClick={initiateXRSession} style={{ background: '#fff', border: 'none', color: '#0284c7', padding: '16px 40px', fontSize: '18px', fontWeight: '900', borderRadius: '30px', cursor: 'pointer', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', textTransform: 'uppercase' }}>
              Enter AR
            </button>
          </div>
        )}

        {gameState === 'GAMEOVER' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: 'linear-gradient(135deg, #0f172a, #1e293b)', color: '#fff', fontFamily: 'sans-serif', padding: '20px', textAlign: 'center', pointerEvents: 'auto' }}>
            <h1 style={{ fontSize: '36px', lineHeight: '1.1', marginBottom: '15px', color: '#38bdf8', textShadow: '0 2px 10px rgba(56, 189, 248, 0.4)' }}>
              MISSION<br/>COMPLETE!
            </h1>
            
            <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '25px 40px', borderRadius: '16px', margin: '15px 0 30px 0', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase' }}>Total Cleaned</div>
              <div style={{ fontSize: '50px', fontWeight: '900', color: '#4ade80', marginBottom: '8px' }}>{itemsCleaned}</div>
              <div style={{ fontSize: '14px', color: '#cbd5e1' }}>Pieces of Plastic Secured</div>
            </div>

            <div style={{ display: 'flex', gap: '15px', flexDirection: 'column', width: '100%', maxWidth: '250px' }}>
              <button onClick={handlePlayAgain} style={{ background: '#38bdf8', border: 'none', color: '#0f172a', padding: '14px 20px', fontSize: '16px', fontWeight: 'bold', borderRadius: '30px', cursor: 'pointer' }}>
                PLAY AGAIN
              </button>
              <button onClick={() => setGameState('THANKYOU')} style={{ background: 'transparent', border: '2px solid #64748b', color: '#f8fafc', padding: '14px 20px', fontSize: '16px', fontWeight: 'bold', borderRadius: '30px', cursor: 'pointer' }}>
                FINISH
              </button>
            </div>
          </div>
        )}

        {gameState === 'THANKYOU' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: '#0f172a', color: '#fff', fontFamily: 'sans-serif', padding: '30px', textAlign: 'center', pointerEvents: 'auto' }}>
            <h1 style={{ fontSize: '38px', marginBottom: '20px', color: '#4ade80' }}>Habitat Secured!</h1>
            <p style={{ fontSize: '18px', color: '#cbd5e1', maxWidth: '450px', lineHeight: '1.6', marginBottom: '40px' }}>
              Emperor penguins rely on clean, stable sea ice to raise their chicks. By removing plastic debris from the floe, you helped keep ICY's home pristine and safe. Thank you for playing!
            </p>
            <div style={{ width: '60px', height: '4px', background: '#4ade80', borderRadius: '2px', opacity: 0.5, marginBottom: '40px' }}></div>
            
            <button onClick={handlePlayAgain} style={{ background: 'transparent', border: '2px solid #4ade80', color: '#fff', padding: '12px 35px', fontSize: '16px', fontWeight: 'bold', borderRadius: '30px', cursor: 'pointer' }}>
              MAIN MENU
            </button>
          </div>
        )}
      </div>

      <Canvas style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: gameState === 'PLAYING' ? 'auto' : 'none' }} camera={{ position: [0, 1.5, 0], fov: 70 }} gl={{ alpha: true }}>
        <XRManager session={xrSession} />
        <React.Suspense fallback={null}>
          <group visible={gameState === 'PLAYING'}>
            <Environment />
            <PlayerCharacter footstepsAudio={footstepsAudio} onPlayerUpdate={updatePlayerPosition} />
            <ConservationCrate position={[0, -0.4, -2.0]} onDrop={handleDrop} />
            
            {items.map((item) => (
              <GarbageItem 
                key={item.id} 
                type={item.type} 
                position={item.pos} 
                onPickUp={() => handlePickUp(item.type, item.id)} 
              />
            ))}
          </group>
        </React.Suspense>
      </Canvas>
    </div>
  );
}