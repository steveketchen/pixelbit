(function () {
  "use strict";

  if (typeof THREE === "undefined") {
    document.body.innerHTML += '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#1a1410;color:#e8c9a8;font-family:system-ui;padding:2rem;text-align:center;">Failed to load Three.js. Check your network or try again.</div>';
    return;
  }

  const container = document.getElementById("voxle-container");
  const scoreEl = document.getElementById("voxle-score");

  // Config
  const PLAYER_SIZE = 0.8;
  const BLUE_CUBE_SIZE = 0.18;
  const GREEN_CUBE_SIZE = 0.35;
  const BLUE_COUNT = 1200;
  const VOLUME_RADIUS = 35;
  const MOVE_SPEED = 0.28;
  const GREEN_SPAWN_INTERVAL = 4000;
  const BLUE_FLOAT_AMPLITUDE = 1.2;
  const BLUE_FLOAT_SPEED = 1.4;
  const BLUE_DRIFT_SPEED = 0.5;
  const MOUSE_SENSITIVITY = 0.002;
  const PITCH_LIMIT = Math.PI * 0.4;

  let scene, camera, renderer;
  let player;
  let blueCubes = [];
  let blueBasePositions = [];
  let bluePhases = [];
  let greenCubes = [];
  let greenMeshPool = [];
  let score = 0;
  let keys = {};
  let clock;
  let nextGreenSpawn = 0;
  let yaw = 0;
  let pitch = 0;
  let isPointerLocked = false;
  let lastTouchX = 0;
  let lastTouchY = 0;
  let createGreenCube = null;

  function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d0a08);
    scene.fog = new THREE.FogExp2(0x0d0a08, 0.018);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(0, 12, 18);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);

    clock = new THREE.Clock();

    // Ambient light
    scene.add(new THREE.AmbientLight(0x404060, 0.6));
    const dirLight = new THREE.DirectionalLight(0xe8c9a8, 0.8);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    // Player – orange cube
    const playerGeo = new THREE.BoxGeometry(PLAYER_SIZE, PLAYER_SIZE, PLAYER_SIZE);
    const playerMat = new THREE.MeshBasicMaterial({ color: 0xe87632 });
    player = new THREE.Mesh(playerGeo, playerMat);
    player.position.set(0, 0, 0);
    scene.add(player);

    // Blue cubes – many smaller cubes with fluid motion
    const blueGeo = new THREE.BoxGeometry(BLUE_CUBE_SIZE, BLUE_CUBE_SIZE, BLUE_CUBE_SIZE);
    const blueMat = new THREE.MeshBasicMaterial({ color: 0x2a5a8a });

    for (let i = 0; i < BLUE_COUNT; i++) {
      const x = (Math.random() - 0.5) * 2 * VOLUME_RADIUS;
      const y = (Math.random() - 0.5) * 2 * VOLUME_RADIUS;
      const z = (Math.random() - 0.5) * 2 * VOLUME_RADIUS;
      blueBasePositions.push(new THREE.Vector3(x, y, z));
      bluePhases.push({
        x: Math.random() * Math.PI * 2,
        y: Math.random() * Math.PI * 2,
        z: Math.random() * Math.PI * 2,
        sx: 1 + Math.random() * 1.2,
        sy: 1 + Math.random() * 1.2,
        sz: 1 + Math.random() * 1.2,
        driftX: (Math.random() - 0.5) * BLUE_DRIFT_SPEED,
        driftY: (Math.random() - 0.5) * BLUE_DRIFT_SPEED,
        driftZ: (Math.random() - 0.5) * BLUE_DRIFT_SPEED,
        orbitPhase: Math.random() * Math.PI * 2,
        orbitRadius: 0.3 + Math.random() * 1,
      });

      const mesh = new THREE.Mesh(blueGeo, blueMat.clone());
      mesh.position.copy(blueBasePositions[i]);
      scene.add(mesh);
      blueCubes.push(mesh);
    }

    // Green cube geometry (reused)
    const greenGeo = new THREE.BoxGeometry(GREEN_CUBE_SIZE, GREEN_CUBE_SIZE, GREEN_CUBE_SIZE);
    const greenMat = new THREE.MeshBasicMaterial({ color: 0x3a9d5c });

    createGreenCube = function () {
      const mesh = new THREE.Mesh(greenGeo, greenMat.clone());
      mesh.visible = false;
      scene.add(mesh);
      return { mesh, active: false };
    };

    // Pool of green cubes
    for (let i = 0; i < 5; i++) {
      greenMeshPool.push(createGreenCube());
    }

    // Keyboard
    window.addEventListener("keydown", (e) => {
      keys[e.code] = true;
      if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => {
      keys[e.code] = false;
    });

    // Mouse look (pointer lock)
    container.addEventListener("click", () => {
      if (!isPointerLocked) container.requestPointerLock();
    });
    document.addEventListener("pointerlockchange", () => {
      isPointerLocked = document.pointerLockElement === container;
    });
    document.addEventListener("mousemove", (e) => {
      if (!isPointerLocked) return;
      yaw += e.movementX * MOUSE_SENSITIVITY;
      pitch += e.movementY * MOUSE_SENSITIVITY;
      pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
    });

    // Touch-swipe look
    container.addEventListener("touchstart", (e) => {
      if (e.touches.length === 1) {
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
      }
    }, { passive: true });
    container.addEventListener("touchmove", (e) => {
      if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - lastTouchX;
        const dy = e.touches[0].clientY - lastTouchY;
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
        yaw += dx * MOUSE_SENSITIVITY * 1.5;
        pitch += dy * MOUSE_SENSITIVITY * 1.5;
        pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
        e.preventDefault();
      }
    }, { passive: false });

    window.addEventListener("resize", onResize);
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function randomPosition() {
    return new THREE.Vector3(
      (Math.random() - 0.5) * 2 * (VOLUME_RADIUS - 2),
      (Math.random() - 0.5) * 2 * (VOLUME_RADIUS - 2),
      (Math.random() - 0.5) * 2 * (VOLUME_RADIUS - 2)
    );
  }

  function spawnGreenCube() {
    for (const obj of greenMeshPool) {
      if (!obj.active) {
        obj.active = true;
        obj.mesh.position.copy(randomPosition());
        obj.mesh.visible = true;
        greenCubes.push(obj);
        return;
      }
    }
    if (!createGreenCube) return;
    const obj = createGreenCube();
    greenMeshPool.push(obj);
    obj.active = true;
    obj.mesh.position.copy(randomPosition());
    obj.mesh.visible = true;
    greenCubes.push(obj);
  }

  function playCollectSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(523, now);
      osc1.frequency.exponentialRampToValueAtTime(1047, now + 0.08);
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(659, now);
      osc2.frequency.exponentialRampToValueAtTime(1319, now + 0.08);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.15);
      osc2.stop(now + 0.15);
    } catch (_) {}
  }

  function aabbOverlap(aPos, aSize, bPos, bSize) {
    const ha = aSize / 2;
    const hb = bSize / 2;
    return (
      Math.abs(aPos.x - bPos.x) < ha + hb &&
      Math.abs(aPos.y - bPos.y) < ha + hb &&
      Math.abs(aPos.z - bPos.z) < ha + hb
    );
  }

  function getForwardVector() {
    return new THREE.Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      -Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch)
    ).normalize();
  }

  function getRightVector() {
    return new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw)).normalize();
  }

  function update(dt) {
    // Movement relative to look direction: W/Up forward, S/Down backward, A/Left strafe, D/Right strafe
    const forward = (keys["KeyW"] || keys["ArrowUp"]) ? 1 : 0;
    const backward = (keys["KeyS"] || keys["ArrowDown"]) ? 1 : 0;
    const left = (keys["KeyA"] || keys["ArrowLeft"]) ? 1 : 0;
    const right = (keys["KeyD"] || keys["ArrowRight"]) ? 1 : 0;

    const fwd = getForwardVector();
    const rightDir = getRightVector();
    const move = new THREE.Vector3(0, 0, 0);
    move.addScaledVector(fwd, (forward - backward) * MOVE_SPEED);
    move.addScaledVector(rightDir, (right - left) * MOVE_SPEED);

    player.position.x += move.x;
    player.position.y += move.y;
    player.position.z += move.z;

    // Soft bounds (full 3D)
    const bound = VOLUME_RADIUS - 2;
    player.position.x = Math.max(-bound, Math.min(bound, player.position.x));
    player.position.y = Math.max(-bound, Math.min(bound, player.position.y));
    player.position.z = Math.max(-bound, Math.min(bound, player.position.z));

    // Blue cubes – dense, fluid floating with drift and orbit
    const t = clock.getElapsedTime();
    for (let i = 0; i < blueCubes.length; i++) {
      const base = blueBasePositions[i];
      const phase = bluePhases[i];
      const mesh = blueCubes[i];
      const bobX = Math.sin(t * BLUE_FLOAT_SPEED + phase.x) * BLUE_FLOAT_AMPLITUDE * phase.sx;
      const bobY = Math.sin(t * BLUE_FLOAT_SPEED * 0.9 + phase.y) * BLUE_FLOAT_AMPLITUDE * phase.sy;
      const bobZ = Math.sin(t * BLUE_FLOAT_SPEED * 1.1 + phase.z) * BLUE_FLOAT_AMPLITUDE * phase.sz;
      const orbit = phase.orbitRadius * Math.sin(t * 1.2 + phase.orbitPhase);
      const orbitZ = phase.orbitRadius * Math.cos(t * 1.2 + phase.orbitPhase);
      const drift = 2.5 * Math.sin(t * 0.4 + phase.orbitPhase);
      mesh.position.x = base.x + bobX + orbit + phase.driftX * drift;
      mesh.position.y = base.y + bobY + phase.driftY * drift;
      mesh.position.z = base.z + bobZ + orbitZ + phase.driftZ * drift;
      mesh.rotation.y += 0.015;
      mesh.rotation.x += 0.012;
    }

    // Green cube spawn
    nextGreenSpawn -= dt * 1000;
    if (nextGreenSpawn <= 0) {
      spawnGreenCube();
      nextGreenSpawn = GREEN_SPAWN_INTERVAL;
    }

    // Collision with green cubes
    const playerPos = player.position;
    for (let i = greenCubes.length - 1; i >= 0; i--) {
      const obj = greenCubes[i];
      obj.mesh.rotation.y += 0.02;
      if (aabbOverlap(playerPos, PLAYER_SIZE, obj.mesh.position, GREEN_CUBE_SIZE)) {
        obj.mesh.visible = false;
        obj.active = false;
        greenCubes.splice(i, 1);
        score++;
        scoreEl.textContent = String(score);
        playCollectSound();
      }
    }

    // Camera follow – behind player, looks where player looks
    const lookTarget = new THREE.Vector3(
      player.position.x + fwd.x * 15,
      player.position.y + fwd.y * 15,
      player.position.z + fwd.z * 15
    );
    const camPos = new THREE.Vector3(
      player.position.x - fwd.x * 12,
      player.position.y - fwd.y * 12 + 8,
      player.position.z - fwd.z * 12
    );
    camera.position.lerp(camPos, 0.1);
    camera.lookAt(lookTarget);
  }

  function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    update(dt);
    renderer.render(scene, camera);
  }

  if (!container || !scoreEl) {
    console.error("Voxle: DOM elements not found.");
    return;
  }

  try {
    init();
    nextGreenSpawn = GREEN_SPAWN_INTERVAL * 0.5;
    animate();
  } catch (err) {
    console.error("Voxle init error:", err);
    container.innerHTML = '<div style="padding:2rem;color:#e8c9a8;font-family:system-ui;">Error: ' + (err.message || String(err)) + '</div>';
  }
})();
