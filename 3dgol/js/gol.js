(function () {
  'use strict';

  var N = 64;
  var TOTAL = N * N * N;
  var CELL_SCALE = 4 / N;
  var RADIUS = 0.5 * CELL_SCALE; // spheres touch (no gap between adjacent cells)
  var CENTER = (N - 1) * 0.5;
  var STEP_EVERY_FRAMES = 5; // advance generation every N frames (~12 gen/sec)
  var MAX_STEPS = 80; // freeze simulation after this many generations
  var frameCount = 0;

  function index(x, y, z) {
    if (x < 0 || x >= N || y < 0 || y >= N || z < 0 || z >= N) return -1;
    return x + y * N + z * N * N;
  }

  var container = document.getElementById('gol-container');
  if (!container) return;

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c0c0e);

  var camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  camera.position.set(3.5, 3.5, 3.5);
  camera.lookAt(0, 0, 0);

  var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  var DIM_OPACITY = 0.5; // 0 = dim, 1 = lit (shader uses this for opacity and color)
  var activeAttr = new Float32Array(TOTAL);
  var instancePositionAttr = new Float32Array(TOTAL * 3);
  for (var i = 0; i < TOTAL; i++) activeAttr[i] = DIM_OPACITY;

  var sphereGeo = new THREE.SphereGeometry(RADIUS, 8, 6);
  var geometry = new THREE.InstancedBufferGeometry();
  geometry.copy(sphereGeo);
  geometry.setAttribute('cellLit', new THREE.InstancedBufferAttribute(activeAttr, 1));
  geometry.setAttribute('instancePosition', new THREE.InstancedBufferAttribute(instancePositionAttr, 3));
  sphereGeo.dispose();
  var material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    vertexShader: [
      'attribute float cellLit;',
      'attribute vec3 instancePosition;',
      'varying float vActive;',
      'varying vec3 vNormal;',
      'void main() {',
      '  vActive = cellLit;',
      '  vNormal = normalize(normalMatrix * normal);',
      '  vec3 worldPos = position + instancePosition;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPos, 1.0);',
      '}'
    ].join('\n'),
    fragmentShader: [
      'varying float vActive;',
      'varying vec3 vNormal;',
      'void main() {',
      '  float t = smoothstep(0.5, 0.7, vActive);',
      '  float opacity = mix(0.05, 1.0, t);',
      '  vec3 dimCol = vec3(0.28, 0.30, 0.36);',
      '  vec3 litCol = vec3(1.0, 0.98, 0.96);',
      '  vec3 baseCol = mix(dimCol, litCol, t);',
      '  vec3 n = normalize(vNormal);',
      '  vec3 lightDir = normalize(vec3(0.4, 0.6, 0.7));',
      '  float diff = max(0.0, dot(n, lightDir));',
      '  float lighting = 0.4 + diff * 0.6;',
      '  gl_FragColor = vec4(baseCol * lighting, opacity);',
      '}'
    ].join('\n')
  });

  var mesh = new THREE.InstancedMesh(geometry, material, TOTAL);
  var posVec = new THREE.Vector3();
  for (var z = 0; z < N; z++) {
    for (var y = 0; y < N; y++) {
      for (var x = 0; x < N; x++) {
        var i = index(x, y, z);
        posVec.set((x - CENTER) * CELL_SCALE, (y - CENTER) * CELL_SCALE, (z - CENTER) * CELL_SCALE);
        instancePositionAttr[i * 3] = posVec.x;
        instancePositionAttr[i * 3 + 1] = posVec.y;
        instancePositionAttr[i * 3 + 2] = posVec.z;
      }
    }
  }
  geometry.attributes.instancePosition.needsUpdate = true;
  mesh.frustumCulled = false;
  scene.add(mesh);

  var state = new Uint8Array(TOTAL);
  var nextState = new Uint8Array(TOTAL);
  var history = [];
  var MAX_HISTORY = 80;
  var running = false;
  var animId = null;

  function countNeighbors(x, y, z) {
    var c = 0;
    for (var dz = -1; dz <= 1; dz++) {
      for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0 && dz === 0) continue;
          var i = index(x + dx, y + dy, z + dz);
          if (i >= 0 && state[i]) c++;
        }
      }
    }
    return c;
  }

  function step() {
    for (var z = 0; z < N; z++) {
      for (var y = 0; y < N; y++) {
        for (var x = 0; x < N; x++) {
          var i = index(x, y, z);
          var n = countNeighbors(x, y, z);
          var alive = state[i];
          nextState[i] = alive ? (n >= 3 && n <= 4 ? 1 : 0) : (n === 3 ? 1 : 0);
        }
      }
    }
    for (var j = 0; j < TOTAL; j++) {
      state[j] = nextState[j];
      activeAttr[j] = state[j] ? 1 : DIM_OPACITY;
    }
    mesh.geometry.attributes.cellLit.needsUpdate = true;
  }

  function pushHistory() {
    var copy = new Uint8Array(state);
    history.push(copy);
    if (history.length > MAX_HISTORY) history.shift();
  }

  function reset() {
    running = false;
    if (animId != null) cancelAnimationFrame(animId);
    animId = null;
    history.length = 0;
    for (var j = 0; j < TOTAL; j++) {
      state[j] = 0;
      activeAttr[j] = DIM_OPACITY;
    }
    var s = getSeed();
    var cluster = getCluster(s);
    lastCluster = cluster.slice();
    for (var k = 0; k < cluster.length; k++) {
      var c = cluster[k];
      setCell(c.x, c.y, c.z, 1);
    }
    if (mesh.geometry.attributes.cellLit) mesh.geometry.attributes.cellLit.needsUpdate = true;
    updateControlsState();
    updateStatus('Reset. Set seed and press Go.');
  }

  function setCell(x, y, z, on) {
    var i = index(x, y, z);
    if (i < 0) return;
    state[i] = on ? 1 : 0;
    activeAttr[i] = on ? 1 : DIM_OPACITY;
    mesh.geometry.attributes.cellLit.needsUpdate = true;
  }

  /** UI shows 1–64; returns internal indices 0–63 (1 = origin). */
  function getSeed() {
    var raw = function (id) {
      var v = parseInt(document.getElementById(id).value, 10);
      return Math.max(1, Math.min(64, isNaN(v) ? 32 : v));
    };
    return {
      x: raw('gol-x-num') - 1,
      y: raw('gol-y-num') - 1,
      z: raw('gol-z-num') - 1
    };
  }

  function getClusterSize() {
    var numEl = document.getElementById('gol-cluster-size-num');
    var sliderEl = document.getElementById('gol-cluster-size');
    var n = numEl ? parseInt(numEl.value, 10) : NaN;
    if (isNaN(n) && sliderEl) n = parseInt(sliderEl.value, 10);
    return Math.max(4, Math.min(10, isNaN(n) ? 6 : n));
  }

  var NEIGHBOR_OFFSETS = (function () {
    var out = [];
    for (var dz = -1; dz <= 1; dz++) {
      for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0 && dz === 0) continue;
          out.push({ dx: dx, dy: dy, dz: dz });
        }
      }
    }
    return out;
  })();

  function shuffleArray(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  /** Returns a cluster of cells around seed: exactly getClusterSize() cells, all adjacent. Grows by randomly choosing frontier cells and randomly ordered neighbor directions so the shape is irregular and 3D. */
  function getCluster(seed) {
    var target = getClusterSize();
    var list = [{ x: seed.x, y: seed.y, z: seed.z }];
    var key = function (c) { return c.x + ',' + c.y + ',' + c.z; };
    var inSet = {};
    inSet[key(seed)] = true;
    var frontier = list.slice();
    while (list.length < target && frontier.length > 0) {
      var idx = Math.floor(Math.random() * frontier.length);
      var c = frontier[idx];
      frontier[idx] = frontier[frontier.length - 1];
      frontier.pop();
      var dirs = shuffleArray(NEIGHBOR_OFFSETS.slice());
      for (var d = 0; d < dirs.length && list.length < target; d++) {
        var o = dirs[d];
        var nx = c.x + o.dx, ny = c.y + o.dy, nz = c.z + o.dz;
        if (index(nx, ny, nz) < 0) continue;
        var k = nx + ',' + ny + ',' + nz;
        if (inSet[k]) continue;
        inSet[k] = true;
        var cell = { x: nx, y: ny, z: nz };
        list.push(cell);
        frontier.push(cell);
      }
    }
    return list;
  }

  /** Set seed inputs from internal indices 0–63 (display as 1–64). */
  function setSeedUI(x, y, z) {
    var v = function (i) { return Math.max(0, Math.min(N - 1, i)) + 1; };
    document.getElementById('gol-x').value = v(x);
    document.getElementById('gol-x-num').value = v(x);
    document.getElementById('gol-y').value = v(y);
    document.getElementById('gol-y-num').value = v(y);
    document.getElementById('gol-z').value = v(z);
    document.getElementById('gol-z-num').value = v(z);
  }

  function updateControlsState() {
    var goBtn = document.getElementById('gol-go');
    var pauseBtn = document.getElementById('gol-pause');
    var stepFwdBtn = document.getElementById('gol-step-fwd');
    var resetBtn = document.getElementById('gol-reset');
    if (goBtn) goBtn.disabled = running;
    if (pauseBtn) pauseBtn.disabled = !running;
    if (stepFwdBtn) stepFwdBtn.disabled = running;
    if (resetBtn) resetBtn.disabled = !running && history.length === 0;
  }

  function updateStatus(text) {
    var el = document.getElementById('gol-status');
    if (el) el.textContent = text;
  }

  function tick() {
    if (!running) return;
    frameCount++;
    if (frameCount >= STEP_EVERY_FRAMES) {
      frameCount = 0;
      pushHistory();
      step();
      if (history.length >= MAX_STEPS) {
        onPause();
        updateStatus('Frozen at generation ' + MAX_STEPS + '.');
        return;
      }
      updateControlsState();
      updateStatus('Running (generation ' + history.length + ')');
    }
    animId = requestAnimationFrame(tick);
  }

  function loop() {
    requestAnimationFrame(loop);
    renderer.render(scene, camera);
  }

  function onGo() {
    if (running) return;
    if (history.length >= MAX_STEPS) {
      for (var j = 0; j < TOTAL; j++) {
        state[j] = 0;
        activeAttr[j] = DIM_OPACITY;
      }
      history.length = 0;
      lastCluster = [];
      if (mesh.geometry.attributes.cellLit) mesh.geometry.attributes.cellLit.needsUpdate = true;
    }
    var s = getSeed();
    var cluster = getCluster(s);
    for (var k = 0; k < cluster.length; k++) {
      var c = cluster[k];
      setCell(c.x, c.y, c.z, 1);
    }
    history.length = 0;
    running = true;
    updateControlsState();
    updateStatus('Running (cluster of ' + cluster.length + ' cells)…');
    tick();
  }

  function onPause() {
    running = false;
    if (animId != null) cancelAnimationFrame(animId);
    animId = null;
    updateControlsState();
    updateStatus('Paused.');
  }

  function onStepFwd() {
    if (running) return;
    pushHistory();
    step();
    updateControlsState();
    updateStatus('Stepped forward.');
  }

  function syncFromSlider(axis) {
    var sliderId = 'gol-' + axis;
    var numId = 'gol-' + axis + '-num';
    var sliderEl = document.getElementById(sliderId);
    var numEl = document.getElementById(numId);
    if (!sliderEl || !numEl) return getSeed();
    var val = Math.max(1, Math.min(64, parseInt(sliderEl.value, 10) || 32));
    sliderEl.value = val;
    numEl.value = val;
    return getSeed();
  }

  function syncFromInput(axis) {
    var sliderId = 'gol-' + axis;
    var numId = 'gol-' + axis + '-num';
    var sliderEl = document.getElementById(sliderId);
    var numEl = document.getElementById(numId);
    if (!sliderEl || !numEl) return getSeed();
    var val = Math.max(1, Math.min(64, parseInt(numEl.value, 10) || 32));
    sliderEl.value = val;
    numEl.value = val;
    return getSeed();
  }

  var lastCluster = [];

  function updateSeedVisual() {
    var s = getSeed();
    var cluster = getCluster(s);
    if (!running) {
      for (var k = 0; k < lastCluster.length; k++) {
        var c = lastCluster[k];
        setCell(c.x, c.y, c.z, 0);
      }
      lastCluster = cluster.slice();
    }
    for (var k = 0; k < cluster.length; k++) {
      var c = cluster[k];
      setCell(c.x, c.y, c.z, 1);
    }
  }

  function syncClusterSizeFromSlider() {
    var s = document.getElementById('gol-cluster-size');
    var n = document.getElementById('gol-cluster-size-num');
    if (!s || !n) return;
    var val = Math.max(4, Math.min(10, parseInt(s.value, 10) || 6));
    s.value = val;
    n.value = val;
  }
  function syncClusterSizeFromInput() {
    var s = document.getElementById('gol-cluster-size');
    var n = document.getElementById('gol-cluster-size-num');
    if (!s || !n) return;
    var val = Math.max(4, Math.min(10, parseInt(n.value, 10) || 6));
    s.value = val;
    n.value = val;
  }

  function bindSliderPair(sliderId, numId, syncFromSliderFn, syncFromInputFn, updateFn) {
    var slider = document.getElementById(sliderId);
    var num = document.getElementById(numId);
    if (!slider || !num) return;
    slider.addEventListener('input', function () { syncFromSliderFn(); updateFn(); });
    slider.addEventListener('change', function () { syncFromSliderFn(); updateFn(); });
    num.addEventListener('input', function () { syncFromInputFn(); updateFn(); });
    num.addEventListener('change', function () { syncFromInputFn(); updateFn(); });
  }
  bindSliderPair('gol-cluster-size', 'gol-cluster-size-num', syncClusterSizeFromSlider, syncClusterSizeFromInput, updateSeedVisual);
  bindSliderPair('gol-x', 'gol-x-num', function () { syncFromSlider('x'); }, function () { syncFromInput('x'); }, updateSeedVisual);
  bindSliderPair('gol-y', 'gol-y-num', function () { syncFromSlider('y'); }, function () { syncFromInput('y'); }, updateSeedVisual);
  bindSliderPair('gol-z', 'gol-z-num', function () { syncFromSlider('z'); }, function () { syncFromInput('z'); }, updateSeedVisual);

  document.getElementById('gol-go').addEventListener('click', onGo);
  document.getElementById('gol-pause').addEventListener('click', onPause);
  document.getElementById('gol-step-fwd').addEventListener('click', onStepFwd);
  document.getElementById('gol-reset').addEventListener('click', reset);

  function onResize() {
    var w = container.offsetWidth || window.innerWidth;
    var h = container.offsetHeight || window.innerHeight;
    if (w <= 0 || h <= 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  window.addEventListener('resize', onResize);

  setSeedUI(31, 31, 31);
  var initSeed = getSeed();
  lastCluster = getCluster(initSeed);
  updateControlsState();
  for (var k = 0; k < lastCluster.length; k++) {
    var c = lastCluster[k];
    setCell(c.x, c.y, c.z, 1);
  }
  if (mesh.geometry.attributes.cellLit) mesh.geometry.attributes.cellLit.needsUpdate = true;

  var target = new THREE.Vector3(0, 0, 0);
  var camRadius = camera.position.distanceTo(target);
  var camTheta = Math.atan2(camera.position.x, camera.position.z);
  var camPhi = Math.acos(Math.max(-1, Math.min(1, camera.position.y / camRadius)));
  var dragging = false;
  var prevClientX = 0, prevClientY = 0;
  var MIN_RADIUS = 1.5;
  var MAX_RADIUS = 20;

  function updateCameraPosition() {
    camera.position.x = camRadius * Math.sin(camPhi) * Math.sin(camTheta);
    camera.position.y = camRadius * Math.cos(camPhi);
    camera.position.z = camRadius * Math.sin(camPhi) * Math.cos(camTheta);
    camera.lookAt(target);
  }

  container.addEventListener('wheel', function (e) {
    e.preventDefault();
    camRadius *= (1 - e.deltaY * 0.002);
    camRadius = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, camRadius));
    updateCameraPosition();
  }, { passive: false });

  container.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    dragging = true;
    prevClientX = e.clientX;
    prevClientY = e.clientY;
  });
  window.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    var dx = e.clientX - prevClientX;
    var dy = e.clientY - prevClientY;
    prevClientX = e.clientX;
    prevClientY = e.clientY;
    camTheta -= dx * 0.005;
    camPhi += dy * 0.005;
    camPhi = Math.max(0.05, Math.min(Math.PI - 0.05, camPhi));
    updateCameraPosition();
  });
  window.addEventListener('mouseup', function (e) {
    if (e.button === 0) dragging = false;
  });

  onResize();
  requestAnimationFrame(onResize);
  loop();
})();
