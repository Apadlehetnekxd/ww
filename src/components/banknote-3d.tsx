import { useEffect, useRef } from "react";
import * as THREE from "three";
import { Reveal } from "@/components/reveal";
import banknoteUrl from "@/assets/banknote-100.jpg";

/**
 * 3D US $100 bill made of particles. Disintegrates left → right as the user
 * scrolls past the section, reforms on scroll back. Colors sampled from a
 * real banknote image.
 */
export function Banknote3D() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    const wrap = wrapRef.current;
    if (!mount || !wrap) return;

    let disposed = false;
    let cleanup: (() => void) | null = null;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = banknoteUrl;

    img.onload = () => {
      if (disposed) return;

      const W = () => mount.clientWidth;
      const H = () => mount.clientHeight;

      // Draw banknote image to a canvas so we can sample pixel colors.
      const TEX_W = 1024;
      const TEX_H = Math.round(TEX_W * (img.height / img.width));
      const tcv = document.createElement("canvas");
      tcv.width = TEX_W;
      tcv.height = TEX_H;
      const tctx = tcv.getContext("2d")!;
      tctx.drawImage(img, 0, 0, TEX_W, TEX_H);
      const imgData = tctx.getImageData(0, 0, TEX_W, TEX_H).data;

      // Three.js scene
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, W() / H(), 0.1, 100);
      camera.position.set(0, 0, 6.5);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(W(), H(), false);
      renderer.setClearColor(0x000000, 0);
      mount.appendChild(renderer.domElement);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.display = "block";

      // Particle grid covering the bill aspect ratio
      const PLANE_W = 4.6;
      const PLANE_H = PLANE_W * (TEX_H / TEX_W);
      const COLS = 320;
      const ROWS = Math.round(COLS * (TEX_H / TEX_W));
      const COUNT = COLS * ROWS;

      const positions = new Float32Array(COUNT * 3);
      const home = new Float32Array(COUNT * 3);
      const colors = new Float32Array(COUNT * 3);
      const seeds = new Float32Array(COUNT * 3);
      const sizes = new Float32Array(COUNT);

      let i3 = 0;
      let iSize = 0;
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const u = x / (COLS - 1);
          const v = y / (ROWS - 1);
          const px = (u - 0.5) * PLANE_W;
          const py = -(v - 0.5) * PLANE_H;
          const pz = (Math.random() - 0.5) * 0.015;

          home[i3] = px;
          home[i3 + 1] = py;
          home[i3 + 2] = pz;
          positions[i3] = px;
          positions[i3 + 1] = py;
          positions[i3 + 2] = pz;

          const tx = Math.min(TEX_W - 1, Math.floor(u * TEX_W));
          const ty = Math.min(TEX_H - 1, Math.floor(v * TEX_H));
          const idx = (ty * TEX_W + tx) * 4;
          const r = imgData[idx] / 255;
          const g = imgData[idx + 1] / 255;
          const b = imgData[idx + 2] / 255;
          colors[i3] = r;
          colors[i3 + 1] = g;
          colors[i3 + 2] = b;

          const ang = Math.atan2(py, px) + (Math.random() - 0.5) * 0.6;
          const speed = 0.5 + Math.random() * 1.6;
          seeds[i3] = Math.cos(ang) * speed;
          seeds[i3 + 1] = Math.sin(ang) * speed + Math.random() * 0.4;
          seeds[i3 + 2] = (Math.random() - 0.5) * 1.4;

          // Hide near-white pixels (background) by giving zero size
          const isBg = r > 0.93 && g > 0.93 && b > 0.93;
          sizes[iSize++] = isBg ? 0 : 0.024 + Math.random() * 0.014;
          i3 += 3;
        }
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geom.setAttribute("aHome", new THREE.BufferAttribute(home, 3));
      geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geom.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 3));
      geom.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uProgress: { value: 0 },
          uTime: { value: 0 },
          uAssemble: { value: 0 }, // 0 = scattered far away, 1 = fully formed bill
          uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        },
        vertexShader: `
          attribute vec3 aHome;
          attribute vec3 aSeed;
          attribute float aSize;
          varying vec3 vColor;
          varying float vAlpha;
          varying float vHide;
          uniform float uProgress;
          uniform float uTime;
          uniform float uAssemble;
          uniform float uPixelRatio;

          void main() {
            // ===== Disintegration (scroll-driven, left → right) =====
            float u = (aHome.x / 2.3) * 0.5 + 0.5;
            float local = clamp((uProgress - u * 0.55) / 0.45, 0.0, 1.0);
            float ease = local * local * (3.0 - 2.0 * local);

            vec3 displaced = aHome + aSeed * ease * 2.6;
            displaced.y -= ease * ease * 1.8;
            displaced.x += sin(uTime * 1.5 + aSeed.z * 6.0) * ease * 0.3;
            displaced.z += cos(uTime * 1.2 + aSeed.x * 5.0) * ease * 0.4;

            // ===== Dramatic assembly (entrance) =====
            // Particles fly in from a chaotic far-away cloud and snap into place.
            float a = clamp(uAssemble, 0.0, 1.0);
            float aInv = 1.0 - a;
            // per-particle stagger so it ripples across the bill
            float stagger = clamp(a * 1.35 - u * 0.35, 0.0, 1.0);
            float aEase = stagger * stagger * (3.0 - 2.0 * stagger);
            float aOff = 1.0 - aEase;
            vec3 chaos = aSeed * 4.5 + vec3(aSeed.z, aSeed.x, aSeed.y) * 3.0;
            chaos.z += 6.0; // start in front of camera
            displaced += chaos * aOff;

            vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
            gl_Position = projectionMatrix * mv;
            float sizeBoost = mix(2.4, 1.0, aEase); // bigger sparkle on entry
            gl_PointSize = aSize * 360.0 * uPixelRatio * sizeBoost / -mv.z;

            vColor = color;
            vAlpha = (1.0 - ease) * aEase;
            vHide = aSize < 0.0001 ? 1.0 : 0.0;
          }
        `,
        fragmentShader: `
          varying vec3 vColor;
          varying float vAlpha;
          varying float vHide;
          void main() {
            if (vHide > 0.5) discard;
            vec2 c = gl_PointCoord - 0.5;
            float d = length(c);
            float a = smoothstep(0.5, 0.12, d);
            if (a < 0.01) discard;
            gl_FragColor = vec4(vColor, a * vAlpha);
          }
        `,
        transparent: true,
        depthWrite: false,
        vertexColors: true,
      });

      const points = new THREE.Points(geom, mat);
      scene.add(points);

      // Soft green glow behind the bill
      const glowGeom = new THREE.CircleGeometry(3.4, 64);
      const glowMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {},
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `
          varying vec2 vUv;
          void main(){
            float d = distance(vUv, vec2(0.5));
            float a = smoothstep(0.5, 0.0, d) * 0.4;
            gl_FragColor = vec4(0.10, 0.42, 0.28, a);
          }
        `,
      });
      const glow = new THREE.Mesh(glowGeom, glowMat);
      glow.position.z = -0.6;
      scene.add(glow);

      const onResize = () => {
        camera.aspect = W() / H();
        camera.updateProjectionMatrix();
        renderer.setSize(W(), H(), false);
      };
      const ro = new ResizeObserver(onResize);
      ro.observe(mount);

      // Locked-scroll values:
      //   targetProgress: 0 → 1 is driven by wheel/touch while the section is pinned
      //   targetAssemble: 0 → 1 as the section approaches/enters the viewport
      // The page is allowed past this section only after the bill fully disintegrates.
      let progress = 0;
      let targetProgress = 0;
      let assemble = 0;
      let targetAssemble = 0;
      let locked = false;
      let completedDown = false;
      let lockTop = 0;
      let lastScrollY = window.scrollY;
      let lastTouchY: number | null = null;
      let pendingRelease: "up" | "down" | null = null;

      const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

      const getLockTop = () => wrap.getBoundingClientRect().top + window.scrollY;

      const releaseLock = (direction: "up" | "down") => {
        locked = false;
        pendingRelease = null;
        lastTouchY = null;
        if (direction === "down") {
          completedDown = true;
          targetProgress = 1;
          window.scrollTo({ top: lockTop + window.innerHeight + 2, left: 0, behavior: "auto" });
        } else {
          targetProgress = 0;
          window.scrollTo({ top: Math.max(0, lockTop - 2), left: 0, behavior: "auto" });
        }
      };

      const engageLock = () => {
        if (locked || completedDown) return;
        lockTop = getLockTop();
        locked = true;
        targetAssemble = 1;
        targetProgress = 0;
        pendingRelease = null;
        progress = Math.min(progress, 0.02);
        window.scrollTo({ top: lockTop, left: 0, behavior: "auto" });
      };

      const scrubLockedAnimation = (delta: number) => {
        if (!locked) return;
        const next = clamp01(targetProgress + delta / (window.innerHeight * 1.15));
        targetProgress = next;
        window.scrollTo({ top: lockTop, left: 0, behavior: "auto" });

        if (delta > 0 && next >= 1) pendingRelease = "down";
        if (delta < 0 && next <= 0) pendingRelease = "up";
      };

      const updateProgress = () => {
        const rect = wrap.getBoundingClientRect();
        const vh = window.innerHeight;
        const currentY = window.scrollY;
        const sectionTop = getLockTop();
        const jumpedIntoSection = currentY > lastScrollY && lastScrollY < sectionTop && currentY >= sectionTop;

        // Assembly: starts when section is one viewport away from entering,
        // fully assembled by the time its top reaches the viewport top.
        // rect.top going from +vh (just below viewport) → 0 (pinned) maps 0→1.
        const enter = 1 - Math.min(1, Math.max(0, rect.top / vh));
        targetAssemble = enter;

        if (currentY < sectionTop - vh * 0.35) {
          completedDown = false;
          targetProgress = 0;
        }

        if (!locked && !completedDown && ((rect.top <= 0 && rect.bottom >= vh * 0.8) || jumpedIntoSection)) {
          engageLock();
        }

        if (completedDown && rect.bottom < vh * 0.15) {
          targetProgress = 1;
          targetAssemble = 1;
        }

        lastScrollY = locked ? lockTop : currentY;
      };
      updateProgress();
      window.addEventListener("scroll", updateProgress, { passive: true });
      window.addEventListener("resize", updateProgress);

      const onWheel = (e: WheelEvent) => {
        const rect = wrap.getBoundingClientRect();
        if (!locked && !completedDown && e.deltaY > 0 && rect.top <= 6 && rect.bottom >= window.innerHeight * 0.8) {
          engageLock();
        }

        if (!locked) return;
        e.preventDefault();
        scrubLockedAnimation(e.deltaY);
      };

      const onTouchStart = (e: TouchEvent) => {
        lastTouchY = e.touches[0]?.clientY ?? null;
      };

      const onTouchMove = (e: TouchEvent) => {
        if (lastTouchY === null) return;
        const y = e.touches[0]?.clientY ?? lastTouchY;
        const delta = lastTouchY - y;
        lastTouchY = y;

        const rect = wrap.getBoundingClientRect();
        if (!locked && !completedDown && delta > 0 && rect.top <= 6 && rect.bottom >= window.innerHeight * 0.8) {
          engageLock();
        }

        if (!locked) return;
        e.preventDefault();
        scrubLockedAnimation(delta * 2.2);
      };

      const onKeyDown = (e: KeyboardEvent) => {
        const forwardKeys = ["ArrowDown", "PageDown", " ", "End"];
        const backwardKeys = ["ArrowUp", "PageUp", "Home"];
        const rect = wrap.getBoundingClientRect();
        const shouldEnter = !locked && !completedDown && forwardKeys.includes(e.key) && rect.top <= 6 && rect.bottom >= window.innerHeight * 0.8;
        if (shouldEnter) engageLock();

        if (!locked) return;
        if (![...forwardKeys, ...backwardKeys].includes(e.key)) return;
        e.preventDefault();
        scrubLockedAnimation(forwardKeys.includes(e.key) ? window.innerHeight * 0.22 : -window.innerHeight * 0.22);
      };

      window.addEventListener("wheel", onWheel, { passive: false, capture: true });
      window.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
      window.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
      window.addEventListener("keydown", onKeyDown, { capture: true });

      let mx = 0, my = 0;
      const onMouse = (e: PointerEvent) => {
        const r = mount.getBoundingClientRect();
        mx = ((e.clientX - r.left) / r.width - 0.5) * 2;
        my = ((e.clientY - r.top) / r.height - 0.5) * 2;
      };
      mount.addEventListener("pointermove", onMouse);

      const clock = new THREE.Clock();
      let raf = 0;
      const tick = () => {
        const t = clock.getElapsedTime();
        progress += (targetProgress - progress) * 0.08;
        assemble += (targetAssemble - assemble) * 0.12;
        mat.uniforms.uProgress.value = progress;
        mat.uniforms.uTime.value = t;
        mat.uniforms.uAssemble.value = assemble;

        const baseRotY = Math.sin(t * 0.4) * 0.25 + mx * 0.35;
        const baseRotX = Math.sin(t * 0.3) * 0.1 - my * 0.25;
        // Dramatic spin-in during assembly
        const spinIn = (1 - assemble) * Math.PI * 1.2;
        points.rotation.y = baseRotY + spinIn;
        points.rotation.x = baseRotX;
        glow.rotation.y = baseRotY;
        glow.rotation.x = baseRotX;
        // Glow flash on entrance
        glow.scale.setScalar(1 + (1 - assemble) * 0.6);

        if (pendingRelease && Math.abs(targetProgress - progress) < 0.012) {
          releaseLock(pendingRelease);
        }

        renderer.render(scene, camera);
        raf = requestAnimationFrame(tick);
      };
      tick();

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        window.removeEventListener("scroll", updateProgress);
        window.removeEventListener("resize", updateProgress);
        window.removeEventListener("wheel", onWheel, { capture: true });
        window.removeEventListener("touchstart", onTouchStart, { capture: true });
        window.removeEventListener("touchmove", onTouchMove, { capture: true });
        window.removeEventListener("keydown", onKeyDown, { capture: true });
        mount.removeEventListener("pointermove", onMouse);
        geom.dispose();
        mat.dispose();
        glowGeom.dispose();
        glowMat.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
      };
    };

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return (
    <section
      ref={wrapRef}
      aria-label="Disintegrating $100 bill"
      className="tf-banknote-scene relative border-b border-border bg-foreground text-background overflow-hidden"
      style={{ height: "100vh" }}
    >
      <div className="sticky top-0 h-screen w-full flex items-center justify-center">
        <div ref={mountRef} className="absolute inset-0" />
        <div className="relative z-10 max-w-[1400px] w-full mx-auto px-5 sm:px-6 lg:px-10 pointer-events-none">
          <div className="max-w-xl">
              <Reveal variant="left">
              <div
                className="tf-eyebrow mb-4 sm:mb-6"
                style={{ color: "color-mix(in oklab, var(--background) 65%, transparent)" }}
              >
                Value, dissolved
              </div>
            </Reveal>
            <Reveal variant="right" delay={120}>
              <h2 className="tf-display text-4xl sm:text-6xl md:text-7xl leading-[0.95]">
                Money fades.
                <br />
                <span className="opacity-60">Intelligence stays free.</span>
              </h2>
            </Reveal>
            <Reveal variant="up" delay={320}>
              <p className="mt-6 text-base sm:text-lg opacity-70 max-w-md">
                A hundred bucks gone in seconds. Good thing Neurix stays free.
              </p>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
