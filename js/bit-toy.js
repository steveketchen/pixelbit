(function () {
  'use strict';

  var container = document.getElementById('bit-toy');
  if (!container) return;

  var scene = new THREE.Scene();
  scene.background = null;
  scene.fog = new THREE.FogExp2(0x0a0a0f, 0.04);

  var camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  camera.position.set(0, 0, 8);
  camera.lookAt(0, 0, 0);

  var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  var plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  var raycaster = new THREE.Raycaster();
  var mouse = new THREE.Vector2(-2, -2);
  var planeIntersect = new THREE.Vector3();

  var BLUE_WHITE = 0xbbddff;
  var YES_COLOR = 0xffaa33;
  var NO_COLOR = 0xee2244;

  function makeNeutralMaterial() {
    return new THREE.MeshBasicMaterial({
      color: BLUE_WHITE,
      wireframe: false,
      transparent: true,
      opacity: 0.9
    });
  }

  function makeWireMaterial(color) {
    return new THREE.MeshBasicMaterial({ color: color, wireframe: true });
  }

  var compoundDodeca = new THREE.DodecahedronGeometry(0.32, 0);
  var compoundIcosa = new THREE.IcosahedronGeometry(0.32, 0);
  var formBGeo = new THREE.IcosahedronGeometry(0.38, 1);

  var neutralFormA = new THREE.Group();
  var matA1 = makeNeutralMaterial();
  var matA2 = makeNeutralMaterial();
  var dodecaMesh = new THREE.Mesh(compoundDodeca, matA1);
  var icosaMesh = new THREE.Mesh(compoundIcosa, matA2);
  icosaMesh.rotation.y = Math.PI / 6;
  neutralFormA.add(dodecaMesh);
  neutralFormA.add(icosaMesh);

  var neutralFormB = new THREE.Group();
  var matB = makeNeutralMaterial();
  var formBMesh = new THREE.Mesh(formBGeo, matB);
  var formBWire = new THREE.Mesh(formBGeo, makeWireMaterial(BLUE_WHITE));
  neutralFormB.add(formBMesh);
  neutralFormB.add(formBWire);

  var yesGeo = new THREE.OctahedronGeometry(0.5, 0);
  var yesMat = new THREE.MeshBasicMaterial({ color: YES_COLOR, transparent: true, opacity: 0.9 });
  var yesWire = makeWireMaterial(YES_COLOR);
  var yesMesh = new THREE.Mesh(yesGeo, yesMat);
  var yesWireMesh = new THREE.Mesh(yesGeo, yesWire);
  var yesGroup = new THREE.Group();
  yesGroup.add(yesMesh);
  yesGroup.add(yesWireMesh);
  yesGroup.visible = false;

  var noGeo = new THREE.IcosahedronGeometry(0.5, 0);
  var noMat = new THREE.MeshBasicMaterial({ color: NO_COLOR, transparent: true, opacity: 0.9 });
  var noWire = makeWireMaterial(NO_COLOR);
  var noMesh = new THREE.Mesh(noGeo, noMat);
  var noWireMesh = new THREE.Mesh(noGeo.clone(), noWire);
  noWireMesh.scale.setScalar(1.15);
  var noGroup = new THREE.Group();
  noGroup.add(noMesh);
  noGroup.add(noWireMesh);
  noGroup.visible = false;

  var bit = new THREE.Group();
  bit.add(neutralFormA);
  bit.add(neutralFormB);
  bit.add(yesGroup);
  bit.add(noGroup);
  bit.position.set(2.3, -2.3, 0);
  bit.scale.setScalar(0.95);
  scene.add(bit);

  var isYesMode = false;
  var mode = 'neutral';
  var morphT = 0;
  var MORPH_SPEED = 0.00055;
  var REVERT_DELAY_MS = 500;
  var revertTimeout = null;

  var audioYes = new Audio('audio/tron-bit-yes.mp3');
  var audioNo = new Audio('audio/tron-bit-no.mp3');

  function speakWord(yes) {
    audioYes.pause();
    audioYes.currentTime = 0;
    audioNo.pause();
    audioNo.currentTime = 0;
    if (yes) {
      audioYes.play();
    } else {
      audioNo.play();
    }
  }

  function setBitMode(yes) {
    if (revertTimeout) {
      clearTimeout(revertTimeout);
      revertTimeout = null;
    }
    isYesMode = yes;
    mode = yes ? 'yes' : 'no';
    neutralFormA.visible = false;
    neutralFormB.visible = false;
    yesGroup.visible = yes;
    noGroup.visible = !yes;
    flashBitText(yes ? 'YES' : 'NO', yes);
    speakWord(yes);
    revertTimeout = setTimeout(function () {
      revertTimeout = null;
      setNeutralMode();
    }, REVERT_DELAY_MS);
  }

  function setNeutralMode() {
    if (revertTimeout) {
      clearTimeout(revertTimeout);
      revertTimeout = null;
    }
    mode = 'neutral';
    yesGroup.visible = false;
    noGroup.visible = false;
    neutralFormA.visible = true;
    neutralFormB.visible = true;
  }

  function flashBitText(text, isYes) {
    var existing = container.querySelector('.bit-flash');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    var projected = bit.position.clone().project(camera);
    var rect = container.getBoundingClientRect();
    var x = (projected.x + 1) / 2 * rect.width;
    var y = (1 - projected.y) / 2 * rect.height;
    var el = document.createElement('div');
    el.className = 'bit-flash ' + (isYes ? 'yes' : 'no');
    el.textContent = text;
    el.style.left = (x + 24) + 'px';
    el.style.top = (y - 40) + 'px';
    container.appendChild(el);
    requestAnimationFrame(function () {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });
    setTimeout(function () {
      el.style.opacity = '0';
      el.style.transform = 'translateY(-12px)';
    }, 375);
    setTimeout(function () {
      if (el.parentNode === container) container.removeChild(el);
    }, 975);
  }

  var bitTarget = new THREE.Vector3(2.3, -2.3, 0);
  var REST_X = 2.3;
  var REST_Y = -2.3;
  var targetRotationY = 0;
  var targetRotationX = 0;
  var ROTATION_LERP = 0.12;
  var TILT_STRENGTH = 0.15;
  var AVOID_RADIUS = 1.8;
  var AVOID_STRENGTH = 0.6;
  var LERP = 0.08;
  var EDGE = 2.8;

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function updateBitTarget() {
    raycaster.setFromCamera(mouse, camera);
    raycaster.ray.intersectPlane(plane, planeIntersect);
    var dx = planeIntersect.x - bit.position.x;
    var dy = planeIntersect.y - bit.position.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < AVOID_RADIUS && dist > 0.001) {
      var push = AVOID_STRENGTH * (1 - dist / AVOID_RADIUS);
      bitTarget.x -= (dx / dist) * push;
      bitTarget.y -= (dy / dist) * push;
    } else {
      bitTarget.x += (REST_X - bitTarget.x) * 0.02;
      bitTarget.y += (REST_Y - bitTarget.y) * 0.02;
    }
    bitTarget.x = clamp(bitTarget.x, -EDGE, EDGE);
    bitTarget.y = clamp(bitTarget.y, -EDGE, EDGE);
    if (dist > 0.001) {
      targetRotationY = Math.atan2(dx, dy);
      targetRotationX = -dy * TILT_STRENGTH;
    }
    targetRotationX = clamp(targetRotationX, -0.4, 0.4);
  }

  function lerpAngle(current, target, t) {
    var diff = target - current;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return current + diff * t;
  }

  function animate() {
    requestAnimationFrame(animate);
    if (mode === 'neutral') {
      morphT += MORPH_SPEED;
      if (morphT >= 1) morphT = 0;
      var scaleA = morphT < 0.5 ? 1 - morphT * 2 : (morphT - 0.5) * 2;
      var scaleB = morphT < 0.5 ? morphT * 2 : 1 - (morphT - 0.5) * 2;
      neutralFormA.scale.setScalar(scaleA);
      neutralFormB.scale.setScalar(scaleB);
      neutralFormA.rotation.y = morphT * Math.PI * 2 * 0.3;
      neutralFormB.rotation.y = morphT * Math.PI * 2 * 0.3;
    }
    updateBitTarget();
    bit.position.x += (bitTarget.x - bit.position.x) * LERP;
    bit.position.y += (bitTarget.y - bit.position.y) * LERP;
    bit.rotation.y = lerpAngle(bit.rotation.y, targetRotationY, ROTATION_LERP);
    bit.rotation.x += (targetRotationX - bit.rotation.x) * ROTATION_LERP;
    renderer.render(scene, camera);
  }

  function onMouseMove(e) {
    var rect = container.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function onMouseLeave() {
    mouse.x = -2;
    mouse.y = -2;
  }

  function onClick(e) {
    var rect = container.getBoundingClientRect();
    var x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    var y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    var hits = raycaster.intersectObjects(bit.children, true);
    if (hits.length > 0) {
      setBitMode(!isYesMode);
    }
  }

  function onResize() {
    var w = container.offsetWidth;
    var h = container.offsetHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  container.addEventListener('mousemove', onMouseMove);
  container.addEventListener('mouseleave', onMouseLeave);
  container.addEventListener('click', onClick);
  window.addEventListener('resize', onResize);

  setNeutralMode();
  onResize();
  requestAnimationFrame(function () { onResize(); });
  animate();
})();
