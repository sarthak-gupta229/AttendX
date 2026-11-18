"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import toast from "react-hot-toast";
import { SessionDTO } from "@/lib/sessions/snapshot";
import { ConnectionState } from "./ConnectionStatus";
import styles from "@/styles/console3d.module.css";

interface Console3DProps {
  selectedSession: SessionDTO | null;
  sessions: SessionDTO[];
  canEdit: boolean;
  isConnected: boolean;
  connectionStatus: ConnectionState;
  maxSessions: number;
  onIn: (id: string) => void;
  onOut: (id: string) => void;
  onSelectSession: (id: string) => void;
  onReact: (id: string, emoji: "😂" | "😢") => void;
  onRename: (id: string, newName: string) => void;
  onRemove: (id: string) => void;
  onAdd: (name: string) => void;
  onLogout: () => void;
}

type ScreenTab = "room" | "directory" | "add";

export default function Console3D({
  selectedSession,
  sessions,
  canEdit,
  isConnected,
  connectionStatus,
  maxSessions,
  onIn,
  onOut,
  onSelectSession,
  onReact,
  onRename,
  onRemove,
  onAdd,
  onLogout,
}: Console3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<ScreenTab>("room");
  const [focusedDirectoryIndex, setFocusedDirectoryIndex] = useState(0);
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState("");
  const [newRoomName, setNewRoomName] = useState("");

  // Refs for 3D interactive objects
  const btnARef = useRef<THREE.Object3D | null>(null);
  const btnBRef = useRef<THREE.Object3D | null>(null);
  const dpadRef = useRef<THREE.Object3D | null>(null);
  const btnStartRef = useRef<THREE.Object3D | null>(null);
  const consoleGroupRef = useRef<THREE.Group | null>(null);

  // Animation state for 3D button depression
  const pressAnimations = useRef<{
    btnA: number;
    btnB: number;
    dpadX: number;
    dpadY: number;
    dpadTimer: number;
    btnStart: number;
  }>({
    btnA: 0,
    btnB: 0,
    dpadX: 0,
    dpadY: 0,
    dpadTimer: 0,
    btnStart: 0,
  });

  const currentIndex = selectedSession
    ? sessions.findIndex((s) => s.id === selectedSession.id)
    : 0;

  // Navigate rooms
  const handlePrevRoom = useCallback(() => {
    if (sessions.length <= 1) return;
    const prevIdx = (currentIndex - 1 + sessions.length) % sessions.length;
    onSelectSession(sessions[prevIdx].id);
  }, [currentIndex, sessions, onSelectSession]);

  const handleNextRoom = useCallback(() => {
    if (sessions.length <= 1) return;
    const nextIdx = (currentIndex + 1) % sessions.length;
    onSelectSession(sessions[nextIdx].id);
  }, [currentIndex, sessions, onSelectSession]);

  // Action Button A
  const handleActionA = useCallback(() => {
    pressAnimations.current.btnA = 8;
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(10);
    }

    if (activeTab === "room") {
      if (!selectedSession || !isConnected || !canEdit) return;
      onIn(selectedSession.id);
    } else if (activeTab === "directory") {
      if (sessions[focusedDirectoryIndex]) {
        onSelectSession(sessions[focusedDirectoryIndex].id);
        setActiveTab("room");
      }
    }
  }, [activeTab, selectedSession, isConnected, canEdit, onIn, sessions, focusedDirectoryIndex, onSelectSession]);

  // Action Button B
  const handleActionB = useCallback(() => {
    pressAnimations.current.btnB = 8;
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(10);
    }

    if (activeTab === "room") {
      if (!selectedSession || !isConnected || !canEdit || selectedSession.count <= 0) return;
      onOut(selectedSession.id);
    } else {
      // In directory or add, B acts as Back to room
      setActiveTab("room");
    }
  }, [activeTab, selectedSession, isConnected, canEdit, onOut]);

  // D-Pad Direction Handlers
  const handleDpadUp = useCallback(() => {
    pressAnimations.current.dpadY = 1;
    pressAnimations.current.dpadX = 0;
    pressAnimations.current.dpadTimer = 8;
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(8);
    }

    if (activeTab === "directory") {
      setFocusedDirectoryIndex((prev) => Math.max(0, prev - 1));
    } else {
      handlePrevRoom();
    }
  }, [activeTab, handlePrevRoom]);

  const handleDpadDown = useCallback(() => {
    pressAnimations.current.dpadY = -1;
    pressAnimations.current.dpadX = 0;
    pressAnimations.current.dpadTimer = 8;
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(8);
    }

    if (activeTab === "directory") {
      setFocusedDirectoryIndex((prev) => Math.min(sessions.length - 1, prev + 1));
    } else {
      handleNextRoom();
    }
  }, [activeTab, sessions.length, handleNextRoom]);

  const handleDpadLeft = useCallback(() => {
    pressAnimations.current.dpadX = -1;
    pressAnimations.current.dpadY = 0;
    pressAnimations.current.dpadTimer = 8;
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(8);
    }

    if (activeTab === "room") {
      handlePrevRoom();
    } else if (activeTab === "directory") {
      setActiveTab("room");
    } else if (activeTab === "add") {
      setActiveTab("directory");
    }
  }, [activeTab, handlePrevRoom]);

  const handleDpadRight = useCallback(() => {
    pressAnimations.current.dpadX = 1;
    pressAnimations.current.dpadY = 0;
    pressAnimations.current.dpadTimer = 8;
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(8);
    }

    if (activeTab === "room") {
      handleNextRoom();
    } else if (activeTab === "directory") {
      if (canEdit) {
        setActiveTab("add");
      }
    }
  }, [activeTab, handleNextRoom, canEdit]);

  // Send Reaction (available to all viewers & operators)
  const handleSendReact = useCallback(
    (emoji: "😂" | "😢") => {
      if (!selectedSession || !isConnected) return;
      pressAnimations.current.btnStart = 8;
      onReact(selectedSession.id, emoji);
    },
    [selectedSession, isConnected, onReact]
  );

  // Toggle Start button
  const handleActionStart = useCallback(() => {
    pressAnimations.current.btnStart = 8;
    setActiveTab((prev) => (prev === "room" ? "directory" : "room"));
  }, []);

  // Stable ref for event listeners in Three.js scene
  const handlersRef = useRef({
    handleActionA,
    handleActionB,
    handleDpadUp,
    handleDpadDown,
    handleDpadLeft,
    handleDpadRight,
    handleActionStart,
  });
  handlersRef.current = {
    handleActionA,
    handleActionB,
    handleDpadUp,
    handleDpadDown,
    handleDpadLeft,
    handleDpadRight,
    handleActionStart,
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      if (e.key === "a" || e.key === "A" || e.key === "+") {
        e.preventDefault();
        handleActionA();
      } else if (e.key === "b" || e.key === "B" || e.key === "-") {
        e.preventDefault();
        handleActionB();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        handleDpadUp();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        handleDpadDown();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handleDpadLeft();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleDpadRight();
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        handleActionStart();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    handleActionA,
    handleActionB,
    handleDpadUp,
    handleDpadDown,
    handleDpadLeft,
    handleDpadRight,
    handleActionStart,
  ]);

  // Three.js 3D Scene Initialization
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let animationFrameId: number;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 0, 3.4);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    const consoleGroup = new THREE.Group();
    scene.add(consoleGroup);
    consoleGroupRef.current = consoleGroup;

    // Soft Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(2, 4, 3);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x92c0c0, 0.5);
    fillLight.position.set(-2, -2, 2);
    scene.add(fillLight);

    // Glowing Power LED (Red)
    const powerLedLight = new THREE.PointLight(0xff3333, 1.2, 0.6);
    powerLedLight.position.set(-0.46, 0.72, 0.22);
    consoleGroup.add(powerLedLight);

    // High quality console materials
    const tealBodyMat = new THREE.MeshStandardMaterial({
      color: 0x246363,
      roughness: 0.38,
      metalness: 0.12,
    });

    const darkAccentMat = new THREE.MeshStandardMaterial({
      color: 0x184747,
      roughness: 0.45,
      metalness: 0.1,
    });

    const blackPlasticMat = new THREE.MeshStandardMaterial({
      color: 0x141816,
      roughness: 0.6,
      metalness: 0.05,
    });

    const cartridgeMat = new THREE.MeshStandardMaterial({
      color: 0x2b3330,
      roughness: 0.5,
      metalness: 0.08,
    });

    const screenBezelMat = new THREE.MeshStandardMaterial({
      color: 0x090b0a,
      roughness: 0.18,
      metalness: 0.2,
    });

    const btnAMat = new THREE.MeshStandardMaterial({
      color: 0x2e8b8b,
      roughness: 0.3,
      metalness: 0.15,
    });

    const btnBMat = new THREE.MeshStandardMaterial({
      color: 0x9fbf8e,
      roughness: 0.3,
      metalness: 0.15,
    });

    const objLoader = new OBJLoader();

    const loadSubModel = (
      url: string,
      mat: THREE.Material,
      scale: number | [number, number, number],
      position: [number, number, number],
      rotationZ = 0
    ): Promise<THREE.Group> => {
      return new Promise((resolve, reject) => {
        objLoader.load(
          url,
          (obj) => {
            obj.traverse((child) => {
              if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;
                mesh.material = mat;
                mesh.castShadow = true;
                mesh.receiveShadow = true;
              }
            });

            if (typeof scale === "number") {
              obj.scale.set(scale, scale, scale);
            } else {
              obj.scale.set(scale[0], scale[1], scale[2]);
            }

            obj.position.set(position[0], position[1], position[2]);
            if (rotationZ !== 0) {
              obj.rotation.z = rotationZ;
            }

            consoleGroup.add(obj);
            resolve(obj);
          },
          undefined,
          reject
        );
      });
    };

    // Load 3D Meshes in Parallel
    Promise.all([
      loadSubModel("/models/Shell_2_1794936383174_2.obj", tealBodyMat, 1, [0, 0, 0]),
      loadSubModel("/models/Shell_1_1794936383165_1.obj", darkAccentMat, 1, [0, 0, 0]),
      loadSubModel("/models/Shell_3_1794936383184_3.obj", blackPlasticMat, 1, [0, 0, 0]),
      loadSubModel("/models/Cartridge_geo_1794936383184_4.obj", cartridgeMat, 0.48, [0, 0.85, -0.06]),
      loadSubModel("/models/ScreenGlass_geo_1794936383189_5.obj", screenBezelMat, 0.38, [0, 0.35, 0.18]),
      loadSubModel("/models/DPad_geo_1794936383199_6.obj", blackPlasticMat, 0.165, [-0.352, -0.384, 0.20]).then(
        (obj) => {
          dpadRef.current = obj;
          return obj;
        }
      ),
      loadSubModel("/models/BtnA_geo_1794936383199_7.obj", btnAMat, 0.072, [0.455, -0.303, 0.20]).then(
        (obj) => {
          btnARef.current = obj;
          return obj;
        }
      ),
      loadSubModel("/models/BtnB_geo_1794936383201_8.obj", btnBMat, 0.072, [0.219, -0.383, 0.20]).then(
        (obj) => {
          btnBRef.current = obj;
          return obj;
        }
      ),
      loadSubModel(
        "/models/BtnStart_geo_1794936383202_9.obj",
        blackPlasticMat,
        0.065,
        [0.085, -0.672, 0.196],
        -0.45
      ).then((obj) => {
        btnStartRef.current = obj;
        return obj;
      }),
      loadSubModel(
        "/models/BtnStart_geo_1794936383202_9.obj",
        blackPlasticMat,
        0.065,
        [-0.085, -0.672, 0.196],
        -0.45
      ),
    ]).catch((err) => console.warn("3D model load notice:", err));

    // Interactive Raycaster for 3D buttons
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const getIntersectedButton = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);

      raycaster.setFromCamera(mouse, camera);

      const targets: THREE.Object3D[] = [];
      if (btnARef.current) targets.push(btnARef.current);
      if (btnBRef.current) targets.push(btnBRef.current);
      if (dpadRef.current) targets.push(dpadRef.current);
      if (btnStartRef.current) targets.push(btnStartRef.current);

      return raycaster.intersectObjects(targets, true);
    };

    const onPointerDown = (event: MouseEvent) => {
      const intersects = getIntersectedButton(event);
      if (intersects.length === 0) return;

      let hitObj: THREE.Object3D | null = intersects[0].object;
      while (hitObj && hitObj.parent !== consoleGroup) {
        if (
          hitObj === btnARef.current ||
          hitObj === btnBRef.current ||
          hitObj === dpadRef.current ||
          hitObj === btnStartRef.current
        ) {
          break;
        }
        hitObj = hitObj.parent;
      }

      const handlers = handlersRef.current;

      if (hitObj === btnARef.current) {
        handlers.handleActionA();
      } else if (hitObj === btnBRef.current) {
        handlers.handleActionB();
      } else if (hitObj === dpadRef.current && dpadRef.current) {
        // Convert intersection to local D-Pad coordinates for accurate 4-way direction
        const localPoint = dpadRef.current.worldToLocal(intersects[0].point.clone());
        const absX = Math.abs(localPoint.x);
        const absY = Math.abs(localPoint.y);

        if (absY > absX) {
          if (localPoint.y > 0) {
            handlers.handleDpadUp();
          } else {
            handlers.handleDpadDown();
          }
        } else {
          if (localPoint.x < 0) {
            handlers.handleDpadLeft();
          } else {
            handlers.handleDpadRight();
          }
        }
      } else if (hitObj === btnStartRef.current) {
        handlers.handleActionStart();
      }
    };

    const onPointerMove = (event: MouseEvent) => {
      const intersects = getIntersectedButton(event);
      renderer.domElement.style.cursor = intersects.length > 0 ? "pointer" : "default";

      // Subtle parallax tilt
      const rect = renderer.domElement.getBoundingClientRect();
      const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1;
      targetRotationY = nx * 0.12;
      targetRotationX = -ny * 0.12;
    };

    let targetRotationX = 0;
    let targetRotationY = 0;

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener("resize", onResize);

    const animateLoop = () => {
      animationFrameId = requestAnimationFrame(animateLoop);

      consoleGroup.rotation.x += (targetRotationX - consoleGroup.rotation.x) * 0.05;
      consoleGroup.rotation.y += (targetRotationY - consoleGroup.rotation.y) * 0.05;

      // Button press z-offsets
      if (btnARef.current) {
        const p = pressAnimations.current.btnA;
        btnARef.current.position.z = 0.20 - (p > 0 ? 0.025 : 0);
        if (p > 0) pressAnimations.current.btnA--;
      }

      if (btnBRef.current) {
        const p = pressAnimations.current.btnB;
        btnBRef.current.position.z = 0.20 - (p > 0 ? 0.025 : 0);
        if (p > 0) pressAnimations.current.btnB--;
      }

      if (btnStartRef.current) {
        const p = pressAnimations.current.btnStart;
        btnStartRef.current.position.z = 0.196 - (p > 0 ? 0.02 : 0);
        if (p > 0) pressAnimations.current.btnStart--;
      }

      // D-pad physical tilt and depression animation
      if (dpadRef.current) {
        if (pressAnimations.current.dpadTimer > 0) {
          pressAnimations.current.dpadTimer--;
          dpadRef.current.rotation.x = -pressAnimations.current.dpadY * 0.12;
          dpadRef.current.rotation.y = pressAnimations.current.dpadX * 0.12;
          dpadRef.current.position.z = 0.20 - 0.015;
        } else {
          dpadRef.current.rotation.x *= 0.6;
          dpadRef.current.rotation.y *= 0.6;
          dpadRef.current.position.z = 0.20;
        }
      }

      renderer.render(scene, camera);
    };

    animateLoop();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  const handleFinishRename = () => {
    if (selectedSession && tempName.trim() && tempName.trim() !== selectedSession.name) {
      onRename(selectedSession.id, tempName.trim());
      toast.success(`Renamed to "${tempName.trim()}"`);
    }
    setIsEditingName(false);
  };

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newRoomName.trim();
    if (!trimmed || sessions.length >= maxSessions) return;
    onAdd(trimmed);
    setNewRoomName("");
    setActiveTab("room");
    toast.success(`Created "${trimmed}"`);
  };

  return (
    <div className={styles.consoleRoot}>
      <div className={styles.viewportContainer} ref={mountRef}>
        {/* The Entire UI on the LCD Screen Aperture */}
        <div className={styles.lcdScreen} role="region" aria-label="AttendX Game Boy Screen">
          {/* LCD Top Header */}
          <div className={styles.screenHeader}>
            <div className={styles.brandLive}>
              <span className={styles.liveDot} aria-hidden="true" />
              <h1 className={styles.screenTitle}>AttendX \Live</h1>
            </div>

            <div className={styles.headerAuth}>
              <span className={styles.userStatusText}>
                {canEdit ? "Signed in as operator" : "You are viewer"}
              </span>
              {canEdit ? (
                <button
                  onClick={onLogout}
                  className={styles.authLink}
                  style={{ background: "none", border: "none" }}
                  aria-label="Log out"
                >
                  Log Out
                </button>
              ) : (
                <>
                  <Link href="/login" className={styles.authLink} aria-label="Log in">
                    Log In
                  </Link>
                  <span>|</span>
                  <Link href="/signup" className={styles.authLink} aria-label="Sign up">
                    Sign Up
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* LCD Screen Mode Navigation Tabs */}
          <div className={styles.screenTabs}>
            <button
              type="button"
              className={`${styles.screenTab} ${activeTab === "room" ? styles.screenTabActive : ""}`}
              onClick={() => setActiveTab("room")}
              aria-label="Room Counter tab"
            >
              {selectedSession ? selectedSession.name.slice(0, 10) : "ROOM"}
            </button>
            <button
              type="button"
              className={`${styles.screenTab} ${activeTab === "directory" ? styles.screenTabActive : ""}`}
              onClick={() => setActiveTab("directory")}
              aria-label="All Rooms Directory tab"
            >
              ROOMS ({sessions.length})
            </button>
            {canEdit && (
              <button
                type="button"
                className={`${styles.screenTab} ${activeTab === "add" ? styles.screenTabActive : ""}`}
                onClick={() => setActiveTab("add")}
                aria-label="Create Room tab"
              >
                + ADD
              </button>
            )}
          </div>

          {/* TAB 1: ACTIVE ROOM COUNTER */}
          {activeTab === "room" && (
            <div
              className={styles.roomViewContent}
              data-session-id={selectedSession ? selectedSession.id : undefined}
            >
              <div className={styles.roomTitleRow}>
                <button
                  type="button"
                  className={styles.arrowBtn}
                  onClick={handlePrevRoom}
                  disabled={sessions.length <= 1}
                  aria-label="Previous room"
                  title="Previous Room (D-Pad ▲/◀)"
                >
                  ◀
                </button>

                {isEditingName && canEdit && selectedSession ? (
                  <input
                    type="text"
                    value={tempName}
                    maxLength={40}
                    autoFocus
                    className={styles.roomNameInput}
                    onChange={(e) => setTempName(e.target.value)}
                    onBlur={handleFinishRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleFinishRename();
                      if (e.key === "Escape") setIsEditingName(false);
                    }}
                  />
                ) : (
                  <span
                    className={styles.roomName}
                    onClick={() => {
                      if (canEdit && selectedSession) {
                        setTempName(selectedSession.name);
                        setIsEditingName(true);
                      }
                    }}
                    title={canEdit ? "Click to rename room" : selectedSession?.name}
                    style={{ cursor: canEdit ? "pointer" : "default" }}
                  >
                    {selectedSession ? selectedSession.name : "NO ACTIVE ROOM"}
                    {canEdit && " ✎"}
                  </span>
                )}

                <button
                  type="button"
                  className={styles.arrowBtn}
                  onClick={handleNextRoom}
                  disabled={sessions.length <= 1}
                  aria-label="Next room"
                  title="Next Room (D-Pad ▼/▶)"
                >
                  ▶
                </button>
              </div>

              {/* Huge Headcount Number */}
              <div className={styles.counterDisplay}>
                <div
                  className={styles.counterNumber}
                  aria-live="polite"
                  aria-atomic="true"
                  aria-label={`${selectedSession ? selectedSession.count : 0} present`}
                >
                  {selectedSession ? selectedSession.count : 0}
                </div>
                <div className={styles.counterLabel}>STUDENTS PRESENT</div>
              </div>

              {/* On-Screen Action Buttons */}
              <div className={styles.controlsRow}>
                {canEdit ? (
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.btnOut}`}
                    disabled={!isConnected || !selectedSession || selectedSession.count <= 0}
                    onClick={handleActionB}
                    aria-label={`Student out for ${selectedSession?.name || "room"}`}
                    title="Student Out (Button B or -)"
                  >
                    − OUT [B]
                  </button>
                ) : null}

                {/* Emojis available to ANY viewer and operator */}
                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.btnEmoji}`}
                  disabled={!isConnected || !selectedSession}
                  onClick={() => handleSendReact("😂")}
                  aria-label="React with laugh"
                  title="Send Laugh"
                >
                  😂
                </button>

                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.btnEmoji}`}
                  disabled={!isConnected || !selectedSession}
                  onClick={() => handleSendReact("😢")}
                  aria-label="React with cry"
                  title="Send Cry"
                >
                  😢
                </button>

                {canEdit ? (
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.btnIn}`}
                    disabled={!isConnected || !selectedSession}
                    onClick={handleActionA}
                    aria-label={`Student in for ${selectedSession?.name || "room"}`}
                    title="Student In (Button A or +)"
                  >
                    + IN [A]
                  </button>
                ) : null}
              </div>
            </div>
          )}

          {/* TAB 2: ALL ROOMS DIRECTORY */}
          {activeTab === "directory" && (
            <div className={styles.directoryList} role="list" aria-label="All Rooms List">
              {sessions.length === 0 ? (
                <div style={{ textAlign: "center", padding: "16px", color: "var(--bone-dim)", fontSize: "9px" }}>
                  No rooms created yet.
                </div>
              ) : (
                sessions.map((session, idx) => (
                  <div
                    key={session.id}
                    data-session-id={session.id}
                    className={`${styles.directoryItem} ${focusedDirectoryIndex === idx ? styles.directoryItemActive : ""}`}
                    onClick={() => {
                      setFocusedDirectoryIndex(idx);
                      onSelectSession(session.id);
                      setActiveTab("room");
                    }}
                    role="listitem"
                  >
                    <div className={styles.directoryItemLeft}>
                      {focusedDirectoryIndex === idx ? (
                        <span className={styles.directoryCursor}>▶</span>
                      ) : (
                        <span style={{ width: "8px" }} />
                      )}
                      <span className={styles.directoryName} title={session.name}>
                        {session.name}
                      </span>
                    </div>

                    <div className={styles.directoryActions}>
                      <span className={styles.directoryCount}>{session.count}</span>
                      <button
                        type="button"
                        className={styles.miniBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectSession(session.id);
                          setActiveTab("room");
                        }}
                        aria-label={`Open room ${session.name}`}
                      >
                        OPEN
                      </button>
                      {canEdit && (
                        <button
                          type="button"
                          className={styles.miniBtn}
                          style={{ color: "var(--led)" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemove(session.id);
                            toast.success(`Removed room`);
                          }}
                          aria-label="Delete session"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 3: CREATE ROOM FORM */}
          {activeTab === "add" && canEdit && (
            <form className={styles.addFormContent} onSubmit={handleCreateRoom}>
              <div style={{ fontSize: "9px", color: "var(--sage)" }}>NEW ROOM NAME:</div>
              <input
                type="text"
                className={styles.addInput}
                placeholder="New session name (e.g. Room 101, Math 1)"
                value={newRoomName}
                maxLength={40}
                required
                autoFocus
                onChange={(e) => setNewRoomName(e.target.value)}
                aria-label="New session name"
              />
              <button
                type="submit"
                className={styles.submitAddBtn}
                disabled={!newRoomName.trim() || sessions.length >= maxSessions}
              >
                + Add Session [ENTER]
              </button>
              <button
                type="button"
                className={styles.miniBtn}
                onClick={() => setActiveTab("room")}
                style={{ alignSelf: "center", marginTop: "4px" }}
              >
                ← CANCEL [B]
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Control Legend Bar under the 3D Console */}
      <div className={styles.legendPill}>
        <div>
          <span className={styles.keyCap}>A / Enter</span>
          <span>+ IN / OPEN</span>
        </div>
        <div>
          <span className={styles.keyCap}>B / Bksp</span>
          <span>− OUT / BACK</span>
        </div>
        <div>
          <span className={styles.keyCap}>D-PAD ▲ ▼</span>
          <span>SWITCH ROOM</span>
        </div>
        <div>
          <span className={styles.keyCap}>START</span>
          <span>ROOMS DIRECTORY</span>
        </div>
        <div>
          <span className={styles.keyCap}>😂 😢</span>
          <span>ANYONE CAN REACT</span>
        </div>
      </div>
    </div>
  );
}
