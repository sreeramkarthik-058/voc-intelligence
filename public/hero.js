/* ═══════════════════════════════════════════════════════════════
   Ball-pit Hero Background — Vanilla JS + Three.js
   Adapted for Customer Sentiment Analysis
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ─── Config ───────────────────────────────────────────────────
  const CONFIG = {
    count: 120,
    minSize: 0.25,
    maxSize: 0.7,
    size0: 0.9,
    gravity: 0.35,
    friction: 0.995,
    wallBounce: 0.2,
    maxVelocity: 0.1,
    maxX: 10,
    maxY: 10,
    maxZ: 8,
    controlSphere0: true,
    followCursor: true,
    materialParams: {
      metalness: 0.75,
      roughness: 0.25,
      clearcoat: 1,
      clearcoatRoughness: 0.15,
    },
    lightIntensity: 3.5,
    ambientIntensity: 1.8,
  };

  // ─── Color palettes ───────────────────────────────────────────
  const PALETTES = {
    light: ['#F5E6D3', '#E8D5C4', '#D4C4B0', '#C9B8A4', '#DDD0C0', '#E0CFC0'],
    dark:  ['#3D3530', '#2A2520', '#1F1B18', '#4A4035', '#352F28', '#28231E'],
  };

  // ─── Physics engine ───────────────────────────────────────────
  class Physics {
    constructor(config) {
      this.config = config;
      this.positions = new Float32Array(3 * config.count);
      this.velocities = new Float32Array(3 * config.count);
      this.sizes = new Float32Array(config.count);
      this.center = new THREE.Vector3();
      this._initPositions();
      this._initSizes();
    }

    _initPositions() {
      const { count, maxX, maxY, maxZ } = this.config;
      this.positions[0] = 0;
      this.positions[1] = 0;
      this.positions[2] = 0;
      for (let i = 1; i < count; i++) {
        const idx = 3 * i;
        this.positions[idx]     = THREE.MathUtils.randFloatSpread(2 * maxX);
        this.positions[idx + 1] = THREE.MathUtils.randFloatSpread(2 * maxY);
        this.positions[idx + 2] = THREE.MathUtils.randFloatSpread(2 * maxZ);
      }
    }

    _initSizes() {
      const { count, size0, minSize, maxSize } = this.config;
      this.sizes[0] = size0;
      for (let i = 1; i < count; i++) {
        this.sizes[i] = THREE.MathUtils.randFloat(minSize, maxSize);
      }
    }

    update(delta) {
      const { config, center, positions, sizes, velocities } = this;
      const startIdx = config.controlSphere0 ? 1 : 0;

      if (config.controlSphere0) {
        const pos = new THREE.Vector3().fromArray(positions, 0);
        pos.lerp(center, 0.1).toArray(positions, 0);
        velocities[0] = velocities[1] = velocities[2] = 0;
      }

      for (let i = startIdx; i < config.count; i++) {
        const base = 3 * i;
        const pos = new THREE.Vector3().fromArray(positions, base);
        const vel = new THREE.Vector3().fromArray(velocities, base);

        vel.y -= delta * config.gravity * sizes[i];
        vel.multiplyScalar(config.friction);
        vel.clampLength(0, config.maxVelocity);
        pos.add(vel);

        // Sphere-sphere collision
        for (let j = i + 1; j < config.count; j++) {
          const otherBase = 3 * j;
          const otherPos = new THREE.Vector3().fromArray(positions, otherBase);
          const diff = new THREE.Vector3().subVectors(otherPos, pos);
          const dist = diff.length();
          const sumRadius = sizes[i] + sizes[j];
          if (dist < sumRadius && dist > 0.001) {
            const overlap = (sumRadius - dist) * 0.5;
            diff.normalize();
            pos.addScaledVector(diff, -overlap);
            otherPos.addScaledVector(diff, overlap);
            pos.toArray(positions, base);
            otherPos.toArray(positions, otherBase);
          }
        }

        // Wall collisions
        if (Math.abs(pos.x) + sizes[i] > config.maxX) {
          pos.x = Math.sign(pos.x) * (config.maxX - sizes[i]);
          vel.x *= -config.wallBounce;
        }
        if (pos.y - sizes[i] < -config.maxY) {
          pos.y = -config.maxY + sizes[i];
          vel.y *= -config.wallBounce;
        }
        if (pos.y + sizes[i] > config.maxY) {
          pos.y = config.maxY - sizes[i];
          vel.y *= -config.wallBounce;
        }
        if (Math.abs(pos.z) + sizes[i] > config.maxZ) {
          pos.z = Math.sign(pos.z) * (config.maxZ - sizes[i]);
          vel.z *= -config.wallBounce;
        }

        pos.toArray(positions, base);
        vel.toArray(velocities, base);
      }
    }
  }

  // ─── Scene manager ────────────────────────────────────────────
  class HeroBallpit {
    constructor(canvas) {
      this.canvas = canvas;
      this.clock = new THREE.Clock();
      this.pointer = new THREE.Vector2();
      this.isVisible = false;
      this.animFrameId = 0;
      this.disposed = false;

      this._initScene();
      this._initSpheres();
      this._initListeners();
      this._resize();
    }

    _initScene() {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

      this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
      this.camera.position.set(0, 0, 20);

      this.scene = new THREE.Scene();
    }

    _initSpheres() {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const RoomEnv = THREE.RoomEnvironment || window.RoomEnvironment;
      const envTexture = pmrem.fromScene(new RoomEnv(this.renderer)).texture;
      pmrem.dispose();

      const geometry = new THREE.SphereGeometry(1, 20, 20);
      const material = new THREE.MeshPhysicalMaterial({
        envMap: envTexture,
        ...CONFIG.materialParams,
      });

      this.mesh = new THREE.InstancedMesh(geometry, material, CONFIG.count);
      this.physics = new Physics(CONFIG);

      this._setColors();

      this.ambientLight = new THREE.AmbientLight(0xffffff, CONFIG.ambientIntensity);
      this.pointLight   = new THREE.PointLight(0xffffff, CONFIG.lightIntensity, 100, 1);

      this.scene.add(this.mesh);
      this.scene.add(this.ambientLight);
      this.scene.add(this.pointLight);

      this._updateInstances();
    }

    _setColors() {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const palette = isDark ? PALETTES.dark : PALETTES.light;
      for (let i = 0; i < CONFIG.count; i++) {
        const color = new THREE.Color(palette[i % palette.length]);
        this.mesh.setColorAt(i, color);
      }
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }

    _updateInstances() {
      const dummy = new THREE.Object3D();
      for (let i = 0; i < CONFIG.count; i++) {
        dummy.position.fromArray(this.physics.positions, 3 * i);
        dummy.scale.setScalar(this.physics.sizes[i]);
        dummy.updateMatrix();
        this.mesh.setMatrixAt(i, dummy.matrix);
      }
      this.mesh.instanceMatrix.needsUpdate = true;

      if (CONFIG.controlSphere0) {
        this.pointLight.position.fromArray(this.physics.positions, 0);
      }
    }

    _initListeners() {
      this._onPointerMove = (e) => {
        const rect = this.canvas.getBoundingClientRect();
        this.pointer.set(
          ((e.clientX - rect.left) / rect.width)  * 2 - 1,
          -((e.clientY - rect.top)  / rect.height) * 2 + 1
        );
      };

      this._onTouchMove = (e) => {
        if (e.touches.length > 0) {
          const touch = e.touches[0];
          const rect = this.canvas.getBoundingClientRect();
          this.pointer.set(
            ((touch.clientX - rect.left) / rect.width)  * 2 - 1,
            -((touch.clientY - rect.top)  / rect.height) * 2 + 1
          );
        }
      };

      this._onResize = () => {
        clearTimeout(this._resizeTimer);
        this._resizeTimer = setTimeout(() => this._resize(), 100);
      };

      this._themeObserver = new MutationObserver(() => this._setColors());
      this._themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme'],
      });

      this._intersectionObs = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) this._start();
          else this._stop();
        },
        { threshold: 0 }
      );
      this._intersectionObs.observe(this.canvas);

      window.addEventListener('pointermove', this._onPointerMove);
      window.addEventListener('touchmove', this._onTouchMove, { passive: true });
      window.addEventListener('resize', this._onResize);
    }

    _resize() {
      const parent = this.canvas.parentElement;
      if (!parent) return;
      const w = parent.offsetWidth;
      const h = parent.offsetHeight;

      this.canvas.width  = w;
      this.canvas.height = h;

      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();

      this.renderer.setSize(w, h);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      const fovRad  = (this.camera.fov * Math.PI) / 180;
      const wHeight = 2 * Math.tan(fovRad / 2) * this.camera.position.z;
      const wWidth  = wHeight * this.camera.aspect;
      this.physics.config.maxX = wWidth  / 2;
      this.physics.config.maxY = wHeight / 2;
      this.physics.config.maxZ = wWidth  / 4;
    }

    _start() {
      if (this.isVisible || this.disposed) return;
      this.isVisible = true;
      this.clock.start();

      const raycaster    = new THREE.Raycaster();
      const plane        = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
      const intersection = new THREE.Vector3();

      const loop = () => {
        if (!this.isVisible || this.disposed) return;
        this.animFrameId = requestAnimationFrame(loop);

        const delta = this.clock.getDelta();

        if (CONFIG.followCursor) {
          raycaster.setFromCamera(this.pointer, this.camera);
          if (raycaster.ray.intersectPlane(plane, intersection)) {
            this.physics.center.copy(intersection);
          }
        }

        this.physics.update(delta);
        this._updateInstances();
        this.renderer.render(this.scene, this.camera);
      };

      loop();
    }

    _stop() {
      if (!this.isVisible) return;
      this.isVisible = false;
      this.clock.stop();
      cancelAnimationFrame(this.animFrameId);
    }

    dispose() {
      this.disposed = true;
      this._stop();
      this._intersectionObs?.disconnect();
      this._themeObserver?.disconnect();
      window.removeEventListener('pointermove', this._onPointerMove);
      window.removeEventListener('touchmove',   this._onTouchMove);
      window.removeEventListener('resize',      this._onResize);
      this.scene.clear();
      this.renderer.dispose();
    }
  }

  // ─── Initialize on DOM ready ──────────────────────────────────
  function init() {
    const canvas = document.getElementById('hero-canvas');
    if (!canvas) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      canvas.style.display = 'none';
      return;
    }

    window._heroBallpit = new HeroBallpit(canvas);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
