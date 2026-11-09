/* =====================================================================
   CINEVERSE 3D - REAL CINEMA AUDITORIUM & CURVED THEATER SEATING
   ===================================================================== */

// Core Three.js state
let scene, camera, renderer, controls;
let seatsGroup, screenMesh, screenVideoTexture, projectorBeam;
let ambientLight, projectorLight, screenBacklight, wallSconces = [];
let raycaster, mouse;
let hoveredSeat = null;
let isLightsDimmed = true; // Start in authentic dark cinema ambiance
let isAudioEnabled = true;
let isTourActive = false;

// Web Audio Synthesizer
let audioCtx = null;
function playSound(type) {
  if (!isAudioEnabled) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;

    if (type === 'click') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(450, now);
      osc.frequency.exponentialRampToValueAtTime(900, now + 0.08);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'select') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.12);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
    } else if (type === 'deselect') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(650, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.1);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'whoosh') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(260, now + 0.35);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    }
  } catch (e) {}
}

// Auditorium Layout Setup
// Screen is placed at Z = -18
const SCREEN_Z = -18;
const SCREEN_WIDTH = 26;
const SCREEN_HEIGHT = 10;

// Authentic Theater Rows (Steep Stadium-tiered Risers)
const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J']; // J is Couple Sofa Balcony
const COLS = 14;

// Authentic Cinema Color Tones
const COLOR_VELVET_RED   = 0x991b1b; // Authentic Cinema Red Fabric
const COLOR_GOLD_VIP     = 0xd97706; // VIP Golden Leather
const COLOR_COUPLE_PINK  = 0xdb2777; // Couple Sofa Plush
const COLOR_SELECTED     = 0x10b981; // Emerald Neon
const COLOR_BOOKED       = 0x262626; // Sold Out (Dim Dark Grey)
const COLOR_HOVER        = 0x38bdf8; // Cyan Highlight

let selectedSeats = new Map();
let currentMoviePrice = 350;

// Food Cart
let snackCart = { popcorn: 0, nachos: 0, coke: 0, combo: 0 };
const SNACK_PRICES = { popcorn: 250, nachos: 220, coke: 180, combo: 499 };

// Pre-booked Realistic Occupancy
const BOOKED_SEATS = new Set(['B6', 'B7', 'C7', 'C8', 'D6', 'D7', 'D8', 'F7', 'F8', 'G8', 'G9', 'H6', 'H7']);

// DOM Elements
const container = document.getElementById('canvas-container');
const tooltip = document.getElementById('seatTooltip');
const selectedSeatsList = document.getElementById('selectedSeatsList');
const totalPriceEl = document.getElementById('totalPrice');
const tierInfoEl = document.getElementById('tierInfo');
const snackSummaryEl = document.getElementById('snackSummary');
const snackBadgeEl = document.getElementById('snackBadge');
const checkoutBtn = document.getElementById('checkoutBtn');
const clearSelectionBtn = document.getElementById('clearSelectionBtn');
const movieSelect = document.getElementById('movieSelect');
const ticketModal = document.getElementById('ticketModal');
const cinemaVideo = document.getElementById('cinemaVideo');
const toggleTrailerBtn = document.getElementById('toggleTrailerBtn');

// Initialize
initThree();
buildRealTheater();
setupEventListeners();
animate();

function initThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020308); // Real Cinema Pitch Black
  scene.fog = new THREE.FogExp2(0x020308, 0.018);

  // Set camera default looking down from behind audience toward screen
  camera = new THREE.PerspectiveCamera(
    48,
    container.clientWidth / container.clientHeight,
    0.1,
    1000
  );
  camera.position.set(0, 11, 23); // Natural human stadium angle

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  container.appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxPolarAngle = Math.PI / 2 - 0.02; // Keep camera above floor
  controls.minDistance = 3;
  controls.maxDistance = 45;
  controls.target.set(0, 4, -4); // Look towards middle auditorium & screen

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  setupTheaterLighting();
}

function setupTheaterLighting() {
  // Ambient fill (Realistic dim cinema base)
  ambientLight = new THREE.AmbientLight(0x0f172a, 0.9);
  scene.add(ambientLight);

  // Big Screen Video Glow (Projects colorful light back onto the audience)
  screenBacklight = new THREE.PointLight(0x38bdf8, 3.5, 30);
  screenBacklight.position.set(0, 6, SCREEN_Z + 1.5);
  scene.add(screenBacklight);

  // High Projector Booth Spotlight shining from back down toward the screen
  projectorLight = new THREE.SpotLight(0xcffafe, 5.0, 48, Math.PI / 4.5, 0.35, 1);
  projectorLight.position.set(0, 16, 22);
  projectorLight.target.position.set(0, 5, SCREEN_Z);
  projectorLight.castShadow = true;
  projectorLight.shadow.mapSize.width = 1024;
  projectorLight.shadow.mapSize.height = 1024;
  scene.add(projectorLight);
  scene.add(projectorLight.target);

  // Visible Dust / Haze Light Cone (Realistic Cinema Projector Beam)
  const beamGeo = new THREE.ConeGeometry(8, 36, 32, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.04,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  projectorBeam = new THREE.Mesh(beamGeo, beamMat);
  projectorBeam.position.set(0, 10.5, 2);
  projectorBeam.rotation.x = -Math.PI / 2.35;
  scene.add(projectorBeam);
}

function buildRealTheater() {
  // 1. Auditorium Walls and Ceiling (Full Enclosed Theater Room)
  buildAuditoriumEnclosure();

  // 2. Colossal Curved IMAX Screen on Stage
  buildCurvedImaxScreen();

  // 3. Realistic Tiered Stadium Risers & Curved Arc Seating
  buildStadiumSeating();
}

function buildAuditoriumEnclosure() {
  // Deep Theater Carpet Floor
  const floorGeo = new THREE.PlaneGeometry(36, 50);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x090c18,
    roughness: 0.95,
    metalness: 0.05
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 2);
  floor.receiveShadow = true;
  scene.add(floor);

  // Acoustic Side Walls with cinema architectural red panels & sconce lamps
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x0c1022,
    roughness: 0.85
  });

  // Left & Right Walls
  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 18, 50), wallMat);
  leftWall.position.set(-17.5, 9, 2);
  scene.add(leftWall);

  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 18, 50), wallMat);
  rightWall.position.set(17.5, 9, 2);
  scene.add(rightWall);

  // Back Wall (Projection Booth Wall)
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(36, 18, 0.5), wallMat);
  backWall.position.set(0, 9, 27);
  scene.add(backWall);

  // Stage Floor in front of screen
  const stageGeo = new THREE.BoxGeometry(30, 0.8, 6);
  const stageMat = new THREE.MeshStandardMaterial({ color: 0x060814, roughness: 0.7 });
  const stage = new THREE.Mesh(stageGeo, stageMat);
  stage.position.set(0, 0.4, SCREEN_Z + 2);
  scene.add(stage);

  // Realistic Sconce Accent Lights along the walls
  [-17.2, 17.2].forEach(xPos => {
    for (let z = -10; z <= 20; z += 7.5) {
      const sconceGeo = new THREE.CylinderGeometry(0.12, 0.08, 0.6, 12);
      const sconceMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
      const sconceMesh = new THREE.Mesh(sconceGeo, sconceMat);
      sconceMesh.position.set(xPos, 5, z);
      scene.add(sconceMesh);

      const sconceLight = new THREE.PointLight(0xf59e0b, 0.4, 7);
      sconceLight.position.set(xPos > 0 ? xPos - 0.5 : xPos + 0.5, 5, z);
      scene.add(sconceLight);
      wallSconces.push(sconceLight);
    }
  });

  // Green Aisle Step Safety Lights
  for (let z = -8; z <= 20; z += 2.2) {
    const stepLightGeo = new THREE.BoxGeometry(0.2, 0.04, 0.4);
    const stepLightMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
    const leftStep = new THREE.Mesh(stepLightGeo, stepLightMat);
    leftStep.position.set(-0.6, 0.05, z);
    const rightStep = new THREE.Mesh(stepLightGeo, stepLightMat);
    rightStep.position.set(0.6, 0.05, z);
    scene.add(leftStep);
    scene.add(rightStep);
  }
}

function buildCurvedImaxScreen() {
  const curveRadius = 32;
  const screenAngle = Math.PI / 3.4;

  const screenGeo = new THREE.CylinderGeometry(
    curveRadius,
    curveRadius,
    SCREEN_HEIGHT,
    64,
    1,
    true,
    -screenAngle / 2 + Math.PI / 2,
    screenAngle
  );

  // Video Texture Projection
  screenVideoTexture = new THREE.VideoTexture(cinemaVideo);
  screenVideoTexture.minFilter = THREE.LinearFilter;
  screenVideoTexture.magFilter = THREE.LinearFilter;
  screenVideoTexture.format = THREE.RGBAFormat;

  const screenMat = new THREE.MeshBasicMaterial({
    map: screenVideoTexture,
    side: THREE.DoubleSide
  });

  screenMesh = new THREE.Mesh(screenGeo, screenMat);
  // Center of the screen curvature placed slightly behind SCREEN_Z
  screenMesh.position.set(0, 6.2, SCREEN_Z - curveRadius + 1);
  scene.add(screenMesh);

  // Sleek Black Screen Velvet Border (Proscenium Frame)
  const borderGeo = new THREE.CylinderGeometry(
    curveRadius + 0.08,
    curveRadius + 0.08,
    SCREEN_HEIGHT + 0.5,
    64,
    1,
    true,
    -screenAngle / 2 + Math.PI / 2,
    screenAngle
  );
  const borderMat = new THREE.MeshBasicMaterial({
    color: 0x06b6d4,
    side: THREE.BackSide,
    wireframe: true
  });
  const border = new THREE.Mesh(borderGeo, borderMat);
  border.position.copy(screenMesh.position);
  scene.add(border);

  // "IMAX" Logo Badge on Bottom Center of the Screen
  const badgeGeo = new THREE.BoxGeometry(2.5, 0.4, 0.1);
  const badgeMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
  const badge = new THREE.Mesh(badgeGeo, badgeMat);
  badge.position.set(0, 0.9, SCREEN_Z + 1.2);
  scene.add(badge);
}

function buildStadiumSeating() {
  seatsGroup = new THREE.Group();
  scene.add(seatsGroup);

  const riserMat = new THREE.MeshStandardMaterial({
    color: 0x080b18,
    roughness: 0.9
  });

  ROWS.forEach((rowName, rIdx) => {
    // Steep Stadium Tier Elevation (0.65m riser per row)
    const yElevation = 0.5 + rIdx * 0.65;
    const zPos = -7.5 + rIdx * 2.3; // Distance from screen increases backward

    // Create Physical Stadium Stepped Concrete Riser for each row
    const riserGeo = new THREE.BoxGeometry(32, 0.65, 2.4);
    const riser = new THREE.Mesh(riserGeo, riserMat);
    riser.position.set(0, yElevation - 0.32, zPos + 0.2);
    riser.receiveShadow = true;
    scene.add(riser);

    const isCouple = (rowName === 'J');
    const isVip = (rowName === 'G' || rowName === 'H');

    if (isCouple) {
      // Couple Sofas on the highest VIP Balcony Row (Row J)
      for (let c = 1; c <= COLS; c += 2) {
        const seatId = `${rowName}${c}-${c+1}`;
        const isBooked = BOOKED_SEATS.has(`${rowName}${c}`);

        // Authentic Curved Cinema Arc Math:
        // Seats on the sides are placed slightly forward and rotated toward center of screen
        const colCenterOffset = (c + 0.5) - (COLS / 2 + 0.5);
        const curveOffsetZ = Math.pow(colCenterOffset * 0.35, 2) * 0.12;

        const aisleGap = (c > 7) ? 1.4 : 0;
        const xPos = (colCenterOffset * 1.8) + (c > 7 ? 0.7 : -0.7);
        const finalZ = zPos - curveOffsetZ;

        const sofaMesh = createCinemaCoupleSofa(isBooked);
        sofaMesh.position.set(xPos, yElevation, finalZ);

        // Turn every seat directly to look at center of cinema screen!
        sofaMesh.lookAt(0, 5.5, SCREEN_Z);

        sofaMesh.userData = {
          seatId,
          row: rowName,
          col: c,
          tierType: 'couple',
          price: 850,
          isBooked,
          originalColor: isBooked ? COLOR_BOOKED : COLOR_COUPLE_PINK
        };

        seatsGroup.add(sofaMesh);
      }
    } else {
      // Standard & VIP Cinema Seats
      for (let c = 1; c <= COLS; c++) {
        const seatId = `${rowName}${c}`;
        const isBooked = BOOKED_SEATS.has(seatId);

        // Curved seating arc: outer seats curve in toward the center of the screen
        const colCenterOffset = c - (COLS / 2 + 0.5);
        const curveOffsetZ = Math.pow(colCenterOffset * 0.28, 2) * 0.11;

        const aisleGap = (c > 7) ? 0.9 : -0.9;
        const xPos = (colCenterOffset * 1.7) + aisleGap;
        const finalZ = zPos - curveOffsetZ;

        const seatMesh = createCinemaSeatMesh(isVip, isBooked);
        seatMesh.position.set(xPos, yElevation, finalZ);

        // Look straight into the IMAX screen
        seatMesh.lookAt(0, 5.5, SCREEN_Z);

        seatMesh.userData = {
          seatId,
          row: rowName,
          col: c,
          tierType: isVip ? 'vip' : 'standard',
          price: isVip ? 550 : currentMoviePrice,
          isBooked,
          originalColor: isBooked ? COLOR_BOOKED : (isVip ? COLOR_GOLD_VIP : COLOR_VELVET_RED)
        };

        seatsGroup.add(seatMesh);
      }
    }
  });
}

// Procedural Authentic Cinema Seat (Velvet Cushion, Ergonomic Curve, Armrest Cupholder)
function createCinemaSeatMesh(isVip, isBooked) {
  const seatGroup = new THREE.Group();
  const color = isBooked ? COLOR_BOOKED : (isVip ? COLOR_GOLD_VIP : COLOR_VELVET_RED);

  // Fabric / Leather Velvet Material
  const fabricMat = new THREE.MeshStandardMaterial({
    color: color,
    roughness: isVip ? 0.35 : 0.75,
    metalness: isVip ? 0.2 : 0.05
  });

  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x111625,
    roughness: 0.8
  });

  // 1. Folded Theater Bottom Seat Cushion
  const cushionGeo = new THREE.BoxGeometry(1.0, 0.26, 0.88);
  const cushion = new THREE.Mesh(cushionGeo, fabricMat);
  cushion.position.y = 0.56;
  cushion.castShadow = true;
  cushion.receiveShadow = true;
  seatGroup.add(cushion);

  // 2. High Backrest (Leans back comfortably)
  const backHeight = isVip ? 1.25 : 1.05;
  const backGeo = new THREE.BoxGeometry(0.96, backHeight, 0.22);
  const backrest = new THREE.Mesh(backGeo, fabricMat);
  backrest.position.set(0, 0.56 + backHeight / 2, -0.36);
  backrest.rotation.x = isVip ? -0.22 : -0.14;
  backrest.castShadow = true;
  seatGroup.add(backrest);

  // 3. Headrest Pillow
  if (isVip) {
    const headGeo = new THREE.BoxGeometry(0.72, 0.32, 0.18);
    const headrest = new THREE.Mesh(headGeo, fabricMat);
    headrest.position.set(0, 0.56 + backHeight + 0.08, -0.46);
    seatGroup.add(headrest);
  }

  // 4. Armrests with Cinema Cupholders
  const armGeo = new THREE.BoxGeometry(0.14, 0.44, 0.78);
  const leftArm = new THREE.Mesh(armGeo, frameMat);
  leftArm.position.set(-0.56, 0.72, -0.02);
  const rightArm = new THREE.Mesh(armGeo, frameMat);
  rightArm.position.set(0.56, 0.72, -0.02);
  seatGroup.add(leftArm);
  seatGroup.add(rightArm);

  // Cupholder rings on armrests
  const cupGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.12, 12);
  const cupMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
  const cup = new THREE.Mesh(cupGeo, cupMat);
  cup.position.set(0.56, 0.94, 0.28);
  seatGroup.add(cup);

  // 5. Metal Heavy Floor Mount / Base Stand
  const legGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.56, 8);
  const leg = new THREE.Mesh(legGeo, frameMat);
  leg.position.y = 0.28;
  seatGroup.add(leg);

  seatGroup.cushion = cushion;
  seatGroup.backrest = backrest;
  return seatGroup;
}

// Procedural Couple Sofa Lounge
function createCinemaCoupleSofa(isBooked) {
  const sofaGroup = new THREE.Group();
  const color = isBooked ? COLOR_BOOKED : COLOR_COUPLE_PINK;

  const sofaMat = new THREE.MeshStandardMaterial({
    color: color,
    roughness: 0.5,
    metalness: 0.1
  });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x111625, roughness: 0.8 });

  // Wide Double Cushion
  const cushionGeo = new THREE.BoxGeometry(2.3, 0.3, 1.05);
  const cushion = new THREE.Mesh(cushionGeo, sofaMat);
  cushion.position.y = 0.56;
  cushion.castShadow = true;
  sofaGroup.add(cushion);

  // Plush Double Backrest
  const backGeo = new THREE.BoxGeometry(2.24, 1.3, 0.26);
  const backrest = new THREE.Mesh(backGeo, sofaMat);
  backrest.position.set(0, 1.25, -0.42);
  backrest.rotation.x = -0.18;
  backrest.castShadow = true;
  sofaGroup.add(backrest);

  // Armrests
  const armGeo = new THREE.BoxGeometry(0.18, 0.54, 0.95);
  const leftArm = new THREE.Mesh(armGeo, frameMat);
  leftArm.position.set(-1.22, 0.78, 0);
  const rightArm = new THREE.Mesh(armGeo, frameMat);
  rightArm.position.set(1.22, 0.78, 0);
  sofaGroup.add(leftArm);
  sofaGroup.add(rightArm);

  sofaGroup.cushion = cushion;
  sofaGroup.backrest = backrest;
  return sofaGroup;
}

// Raycasting Interaction
function onPointerMove(event) {
  if (isTourActive) return;

  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(seatsGroup.children, true);

  if (intersects.length > 0) {
    let obj = intersects[0].object;
    while (obj.parent && !obj.userData.seatId) {
      obj = obj.parent;
    }

    if (obj && obj.userData && obj.userData.seatId) {
      if (hoveredSeat !== obj) {
        resetHover();
        if (!obj.userData.isBooked && !selectedSeats.has(obj.userData.seatId)) {
          hoveredSeat = obj;
          setSeatColor(obj, COLOR_HOVER);
          playSound('click');
        }
      }

      const data = obj.userData;
      const statusText = data.isBooked ? '❌ Booked / Unavailable' : (selectedSeats.has(data.seatId) ? '✅ Selected (Click to remove)' : '🟢 Click to Select');
      let tierTitle = `Standard Velvet (₹${currentMoviePrice})`;
      if (data.tierType === 'vip') tierTitle = '⭐ VIP Gold Recliner (₹550)';
      if (data.tierType === 'couple') tierTitle = '💖 Luxury Couple Sofa (₹850)';

      tooltip.innerHTML = `<strong>Seat ${data.seatId}</strong><br/>${tierTitle}<br/>${statusText}`;
      tooltip.style.left = `${event.clientX}px`;
      tooltip.style.top = `${event.clientY}px`;
      tooltip.style.opacity = '1';
      document.body.style.cursor = data.isBooked ? 'not-allowed' : 'pointer';
      return;
    }
  }

  resetHover();
  tooltip.style.opacity = '0';
  document.body.style.cursor = 'default';
}

function resetHover() {
  if (hoveredSeat) {
    if (!selectedSeats.has(hoveredSeat.userData.seatId)) {
      setSeatColor(hoveredSeat, hoveredSeat.userData.originalColor);
    }
    hoveredSeat = null;
  }
}

function onPointerDown(event) {
  if (isTourActive) return;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(seatsGroup.children, true);

  if (intersects.length > 0) {
    let obj = intersects[0].object;
    while (obj.parent && !obj.userData.seatId) {
      obj = obj.parent;
    }

    if (obj && obj.userData && obj.userData.seatId) {
      toggleSeat(obj);
    }
  }
}

function toggleSeat(seatObj) {
  const data = seatObj.userData;
  if (data.isBooked) return;

  const id = data.seatId;
  if (selectedSeats.has(id)) {
    // Deselect
    selectedSeats.delete(id);
    setSeatColor(seatObj, data.originalColor);
    tweenSeatScale(seatObj, 1.0);
    playSound('deselect');
  } else {
    // Select
    let price = currentMoviePrice;
    if (data.tierType === 'vip') price = 550;
    if (data.tierType === 'couple') price = 850;

    selectedSeats.set(id, {
      row: data.row,
      col: data.col,
      tierType: data.tierType,
      price: price,
      mesh: seatObj
    });
    setSeatColor(seatObj, COLOR_SELECTED);
    tweenSeatScale(seatObj, 1.15);
    playSound('select');
  }

  updateBookingUI();
}

function setSeatColor(seatObj, hexColor) {
  if (seatObj.cushion) seatObj.cushion.material.color.setHex(hexColor);
  if (seatObj.backrest) seatObj.backrest.material.color.setHex(hexColor);
}

function tweenSeatScale(obj, targetScale) {
  new TWEEN.Tween(obj.scale)
    .to({ x: targetScale, y: targetScale, z: targetScale }, 200)
    .easing(TWEEN.Easing.Back.Out)
    .start();
}

// UI State & Total Calculation
function updateBookingUI() {
  selectedSeatsList.innerHTML = '';

  let seatsTotal = 0;
  let hasVip = false;
  let hasCouple = false;
  let hasStandard = false;

  selectedSeats.forEach((item, id) => {
    seatsTotal += item.price;
    if (item.tierType === 'vip') hasVip = true;
    else if (item.tierType === 'couple') hasCouple = true;
    else hasStandard = true;

    const badge = document.createElement('span');
    badge.className = 'seat-badge';
    badge.textContent = id;
    selectedSeatsList.appendChild(badge);
  });

  // Calculate snacks
  let snacksTotal = 0;
  let totalSnackCount = 0;
  for (let key in snackCart) {
    snacksTotal += snackCart[key] * SNACK_PRICES[key];
    totalSnackCount += snackCart[key];
  }

  snackBadgeEl.textContent = totalSnackCount;
  snackSummaryEl.textContent = `₹${snacksTotal}`;
  document.getElementById('foodSubtotal').textContent = `₹${snacksTotal}`;

  const grandTotal = seatsTotal + snacksTotal;
  totalPriceEl.textContent = `₹${grandTotal}`;

  if (selectedSeats.size === 0) {
    selectedSeatsList.textContent = 'None selected';
    tierInfoEl.textContent = 'Audi 04 (Dual Laser 3D)';
    checkoutBtn.disabled = true;
    return;
  }

  checkoutBtn.disabled = false;

  const tiers = [];
  if (hasCouple) tiers.push('Couple Lounge');
  if (hasVip) tiers.push('VIP Gold');
  if (hasStandard) tiers.push('Standard');
  tierInfoEl.textContent = tiers.join(' + ');
}

// Smooth Camera Transition
function animateCamera(targetPos, targetLookAt, duration = 1200, onComplete = null) {
  playSound('whoosh');
  new TWEEN.Tween(camera.position)
    .to(targetPos, duration)
    .easing(TWEEN.Easing.Cubic.InOut)
    .start();

  new TWEEN.Tween(controls.target)
    .to(targetLookAt, duration)
    .easing(TWEEN.Easing.Cubic.InOut)
    .onComplete(() => {
      if (onComplete) onComplete();
    })
    .start();
}

// Automated 3D Cinematic Fly-Through Tour
function startWalkthroughTour() {
  isTourActive = true;
  // 1: Center aisle overview looking straight down to curved screen
  animateCamera({ x: 0, y: 14, z: 24 }, { x: 0, y: 5, z: SCREEN_Z }, 2000, () => {
    // 2: Swoop down center aisle straight to row D
    animateCamera({ x: 0, y: 3.5, z: 2 }, { x: 0, y: 6, z: SCREEN_Z }, 2400, () => {
      // 3: Pan to left VIP recliners
      animateCamera({ x: -10, y: 6.5, z: 12 }, { x: 0, y: 5.5, z: SCREEN_Z }, 2200, () => {
        // 4: Ascend to Couple Sofa row
        animateCamera({ x: 8, y: 8, z: 16 }, { x: 0, y: 5, z: SCREEN_Z }, 2200, () => {
          // 5: Return to standard viewing angle
          animateCamera({ x: 0, y: 11, z: 23 }, { x: 0, y: 4, z: -4 }, 2000, () => {
            isTourActive = false;
          });
        });
      });
    });
  });
}

// Event Listeners
function setupEventListeners() {
  window.addEventListener('resize', onWindowResize);
  container.addEventListener('pointermove', onPointerMove);
  container.addEventListener('pointerdown', onPointerDown);

  // Movie dropdown
  movieSelect.addEventListener('change', e => {
    const selectedOption = e.target.options[e.target.selectedIndex];
    currentMoviePrice = parseInt(selectedOption.dataset.price);

    const trailerUrl = selectedOption.dataset.trailer;
    if (trailerUrl) {
      cinemaVideo.src = trailerUrl;
      cinemaVideo.play().catch(() => {});
    }

    selectedSeats.forEach(seat => {
      if (seat.tierType === 'standard') seat.price = currentMoviePrice;
    });
    updateBookingUI();
  });

  // Date and Time pills
  document.querySelectorAll('.date-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.date-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      playSound('click');
    });
  });

  document.querySelectorAll('.time-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.time-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      playSound('click');
    });
  });

  // Camera buttons
  const camBtns = document.querySelectorAll('.cam-btn:not(.snack-btn):not(#toggleLightsBtn)');
  function setActiveCamBtn(btn) {
    camBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }

  // 1. Auditorium Classic View (From high behind the seats looking down at screen)
  document.getElementById('viewOverviewBtn').addEventListener('click', function() {
    setActiveCamBtn(this);
    animateCamera({ x: 0, y: 11, z: 23 }, { x: 0, y: 4, z: -4 });
  });

  // 2. Audience Center Screen (Front view looking straight up at colossal screen)
  document.getElementById('viewScreenBtn').addEventListener('click', function() {
    setActiveCamBtn(this);
    animateCamera({ x: 0, y: 3.5, z: 6 }, { x: 0, y: 6, z: SCREEN_Z });
  });

  // 3. Tour
  document.getElementById('viewWalkthroughBtn').addEventListener('click', function() {
    setActiveCamBtn(this);
    startWalkthroughTour();
  });

  // 4. Dim / Brighten Lights
  document.getElementById('toggleLightsBtn').addEventListener('click', function() {
    isLightsDimmed = !isLightsDimmed;
    const targetAmbient = isLightsDimmed ? 0.9 : 1.8;
    const targetSpot = isLightsDimmed ? 5.0 : 3.0;

    new TWEEN.Tween(ambientLight).to({ intensity: targetAmbient }, 800).start();
    new TWEEN.Tween(projectorLight).to({ intensity: targetSpot }, 800).start();
    wallSconces.forEach(sc => {
      new TWEEN.Tween(sc).to({ intensity: isLightsDimmed ? 0.4 : 1.2 }, 800).start();
    });

    this.innerHTML = isLightsDimmed ? '<i class="fas fa-sun"></i> Brighten Lights' : '<i class="fas fa-lightbulb"></i> Dim Lights';
    playSound('click');
  });

  // 5. TRUE FIRST-PERSON POINT OF VIEW FROM SELECTED SEAT TOWARD THE SCREEN
  document.getElementById('viewMySeatBtn').addEventListener('click', function() {
    if (selectedSeats.size === 0) {
      alert('Please click and select a seat first to test its direct view of the screen!');
      return;
    }
    setActiveCamBtn(this);

    // Pick first selected seat
    const firstSelected = selectedSeats.values().next().value;
    const mesh = firstSelected.mesh;

    const seatWorldPos = new THREE.Vector3();
    mesh.getWorldPosition(seatWorldPos);

    // Camera sits right at human eye height (sitting in this specific chair)
    const eyeLevelPos = {
      x: seatWorldPos.x,
      y: seatWorldPos.y + 1.25,
      z: seatWorldPos.z + 0.3
    };

    // Stare directly into the center of the IMAX curved screen!
    const screenCenter = { x: 0, y: 6.2, z: SCREEN_Z };

    animateCamera(eyeLevelPos, screenCenter, 1400);
  });

  // Toggle Video Playback on 3D Screen
  toggleTrailerBtn.addEventListener('click', () => {
    if (cinemaVideo.paused) {
      cinemaVideo.play().then(() => {
        toggleTrailerBtn.innerHTML = '<i class="fas fa-pause"></i> Pause 3D Trailer';
        toggleTrailerBtn.style.background = 'var(--primary)';
        toggleTrailerBtn.style.color = '#000';
      }).catch(err => {
        console.log('Video autoplay interaction needed', err);
      });
    } else {
      cinemaVideo.pause();
      toggleTrailerBtn.innerHTML = '<i class="fas fa-play"></i> Play Trailer On 3D Screen';
      toggleTrailerBtn.style.background = '';
      toggleTrailerBtn.style.color = '';
    }
    playSound('click');
  });

  // Audio Toggle
  const toggleAudioBtn = document.getElementById('toggleAudioBtn');
  toggleAudioBtn.addEventListener('click', () => {
    isAudioEnabled = !isAudioEnabled;
    toggleAudioBtn.innerHTML = isAudioEnabled ? '<i class="fas fa-volume-up"></i>' : '<i class="fas fa-volume-mute"></i>';
    toggleAudioBtn.style.color = isAudioEnabled ? 'var(--primary)' : 'var(--text-dim)';
  });

  // Food Drawer
  const foodDrawer = document.getElementById('foodDrawer');
  document.getElementById('openFoodDrawerBtn').addEventListener('click', () => {
    foodDrawer.classList.add('open');
    playSound('click');
  });
  document.getElementById('closeFoodDrawerBtn').addEventListener('click', () => {
    foodDrawer.classList.remove('open');
  });
  document.getElementById('applySnacksBtn').addEventListener('click', () => {
    foodDrawer.classList.remove('open');
    updateBookingUI();
    playSound('click');
  });

  // Food + / -
  document.querySelectorAll('.food-item').forEach(item => {
    const id = item.dataset.id;
    const qtyVal = item.querySelector('.qty-val');
    item.querySelector('.plus').addEventListener('click', () => {
      snackCart[id]++;
      qtyVal.textContent = snackCart[id];
      updateBookingUI();
      playSound('click');
    });
    item.querySelector('.minus').addEventListener('click', () => {
      if (snackCart[id] > 0) {
        snackCart[id]--;
        qtyVal.textContent = snackCart[id];
        updateBookingUI();
        playSound('click');
      }
    });
  });

  // Clear Selection
  clearSelectionBtn.addEventListener('click', () => {
    selectedSeats.forEach(seat => {
      setSeatColor(seat.mesh, seat.mesh.userData.originalColor);
      tweenSeatScale(seat.mesh, 1.0);
    });
    selectedSeats.clear();
    updateBookingUI();
    playSound('deselect');
  });

  // Checkout modal
  checkoutBtn.addEventListener('click', () => {
    if (selectedSeats.size === 0) return;

    const movieName = movieSelect.options[movieSelect.selectedIndex].text.split(' - ')[0];
    const seatsArr = Array.from(selectedSeats.keys()).join(', ');
    const activeDate = document.querySelector('.date-pill.active')?.textContent || 'Today';
    const activeTime = document.querySelector('.time-pill.active')?.textContent || '07:45 PM';

    const snackList = [];
    if (snackCart.popcorn > 0) snackList.push(`${snackCart.popcorn}x Popcorn`);
    if (snackCart.nachos > 0) snackList.push(`${snackCart.nachos}x Nachos`);
    if (snackCart.coke > 0) snackList.push(`${snackCart.coke}x Coke`);
    if (snackCart.combo > 0) snackList.push(`${snackCart.combo}x Duo Combo`);

    document.getElementById('ticketMovie').textContent = movieName;
    document.getElementById('ticketSeats').textContent = seatsArr;
    document.getElementById('ticketPrice').textContent = totalPriceEl.textContent;
    document.getElementById('ticketTime').textContent = `${activeDate}, ${activeTime}`;
    document.getElementById('ticketFood').textContent = snackList.length > 0 ? snackList.join(', ') : 'None';

    ticketModal.classList.add('open');
    playSound('select');
  });

  document.getElementById('closeModalBtn').addEventListener('click', () => {
    ticketModal.classList.remove('open');
  });

  document.getElementById('downloadTicketBtn').addEventListener('click', () => {
    alert('🎟️ CineVerse Digital Ticket saved! Enjoy the real cinema experience.');
    ticketModal.classList.remove('open');
  });
}

function onWindowResize() {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

// Render loop
function animate(time) {
  requestAnimationFrame(animate);
  TWEEN.update();
  controls.update();

  // Subtle projector light beam flicker effect (like real film/laser projector)
  if (projectorBeam && projectorLight) {
    const flicker = 0.035 + Math.sin(time * 0.015) * 0.008;
    projectorBeam.material.opacity = flicker;
  }

  if (cinemaVideo && !cinemaVideo.paused && screenVideoTexture) {
    screenVideoTexture.needsUpdate = true;
  }

  renderer.render(scene, camera);
}
