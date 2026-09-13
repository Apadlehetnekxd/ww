import { useEffect, useRef, useState } from "react";

/** A self-lit, decorative chrome sculpture. No external models or textures. */
export function LandingSculpture({ className = "" }: { className?: string }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    const disposers: Array<() => void> = [];

    async function createSculpture() {
      try {
        const THREE = await import("three");
        if (disposed || !mount) return;

        const renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          powerPreference: "low-power",
        });
        disposers.push(() => {
          renderer.dispose();
          renderer.forceContextLoss();
          renderer.domElement.remove();
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
        renderer.setClearColor(0x000000, 0);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.12;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.domElement.style.cssText =
          "display:block;width:100%;height:100%;position:absolute;inset:0;";
        mount.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 40);
        camera.position.set(0, 0, 7.4);

        // A small HDR studio panorama creates the broad, continuous reflections
        // that make metal read as polished chrome, even against a black page.
        const textureWidth = 512;
        const textureHeight = 256;
        const pixels = new Float32Array(textureWidth * textureHeight * 4);
        const softboxes = [
          { u: 0.12, v: 0.33, w: 0.045, h: 0.22, color: [8.5, 9.2, 10] },
          { u: 0.4, v: 0.46, w: 0.022, h: 0.3, color: [10, 10, 10] },
          { u: 0.59, v: 0.25, w: 0.15, h: 0.06, color: [7, 7.2, 7.5] },
          { u: 0.82, v: 0.52, w: 0.11, h: 0.21, color: [5, 3.1, 2.25] },
          { u: 0.95, v: 0.75, w: 0.13, h: 0.025, color: [2.8, 3.2, 3.8] },
        ];
        for (let y = 0; y < textureHeight; y++) {
          for (let x = 0; x < textureWidth; x++) {
            const u = x / textureWidth;
            const v = y / textureHeight;
            const i = (y * textureWidth + x) * 4;
            pixels[i] = 0.035;
            pixels[i + 1] = 0.038;
            pixels[i + 2] = 0.045;
            pixels[i + 3] = 1;
            for (const box of softboxes) {
              const distance = Math.abs(u - box.u);
              const dx = Math.min(distance, 1 - distance) / box.w;
              const dy = Math.abs(v - box.v) / box.h;
              const strength = Math.exp(-(dx ** 6 + dy ** 6));
              pixels[i] += box.color[0] * strength;
              pixels[i + 1] += box.color[1] * strength;
              pixels[i + 2] += box.color[2] * strength;
            }
          }
        }
        const panorama = new THREE.DataTexture(
          pixels,
          textureWidth,
          textureHeight,
          THREE.RGBAFormat,
          THREE.FloatType,
        );
        panorama.mapping = THREE.EquirectangularReflectionMapping;
        panorama.needsUpdate = true;
        disposers.push(() => panorama.dispose());
        const pmrem = new THREE.PMREMGenerator(renderer);
        disposers.push(() => pmrem.dispose());
        const environment = pmrem.fromEquirectangular(panorama);
        scene.environment = environment.texture;
        disposers.push(() => environment.dispose());

        const geometry = new THREE.TorusKnotGeometry(1.14, 0.38, 240, 36, 2, 3);
        const material = new THREE.MeshPhysicalMaterial({
          color: 0xe9e7e3,
          metalness: 1,
          roughness: 0.19,
          clearcoat: 1,
          clearcoatRoughness: 0.16,
          envMapIntensity: 1.3,
        });
        disposers.push(
          () => geometry.dispose(),
          () => material.dispose(),
        );
        const sculpture = new THREE.Mesh(geometry, material);
        sculpture.scale.set(1, 1.06, 1);
        const group = new THREE.Group();
        group.add(sculpture);
        scene.add(group);

        const keyLight = new THREE.DirectionalLight(0xf1f6ff, 3);
        keyLight.position.set(-3, 4, 5);
        scene.add(keyLight);
        const warmLight = new THREE.DirectionalLight(0xffc5a6, 2);
        warmLight.position.set(4, -1, 2);
        scene.add(warmLight);

        const reducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        );
        let visible = true;
        let contextLost = false;
        let frame = 0;
        let previousTime = 0;
        let elapsed = 0;
        let scroll = Math.min(
          window.scrollY / Math.max(window.innerHeight, 1),
          1.6,
        );
        let pointerX = 0;
        let pointerY = 0;
        let easedX = 0;
        let easedY = 0;
        let easedScroll = scroll;

        function draw(time: number) {
          frame = 0;
          if (disposed || contextLost || !visible || document.hidden) return;
          const moving = !reducedMotion.matches;
          const delta = previousTime
            ? Math.min((time - previousTime) / 1000, 0.05)
            : 0;
          previousTime = time;
          if (moving) elapsed += delta;
          const smoothing = 1 - Math.exp(-delta * 5);
          easedX += (pointerX - easedX) * smoothing;
          easedY += (pointerY - easedY) * smoothing;
          easedScroll += (scroll - easedScroll) * smoothing;
          group.rotation.set(
            0.23 + (moving ? easedY * 0.11 + easedScroll * 0.52 : 0),
            -0.48 +
              (moving
                ? elapsed * 0.085 + easedX * 0.2 + easedScroll * 1.15
                : 0),
            -0.3 +
              (moving
                ? Math.sin(elapsed * 0.22) * 0.07 - easedScroll * 0.2
                : 0),
          );
          group.position.y = moving ? Math.sin(elapsed * 0.65) * 0.045 : 0;
          renderer.render(scene, camera);
          if (moving) frame = window.requestAnimationFrame(draw);
        }

        function wake() {
          window.cancelAnimationFrame(frame);
          previousTime = 0;
          frame = 0;
          if (!disposed && visible && !document.hidden && !contextLost) {
            frame = window.requestAnimationFrame(draw);
          }
        }

        function resize() {
          const width = Math.max(mount!.clientWidth, 1);
          const height = Math.max(mount!.clientHeight, 1);
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.position.z =
            camera.aspect < 0.85 ? 7.4 / (camera.aspect / 0.85) : 7.4;
          camera.updateProjectionMatrix();
          wake();
        }

        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(mount!);
        disposers.push(() => resizeObserver.disconnect());
        const intersectionObserver = new IntersectionObserver(
          ([entry]) => {
            visible = entry.isIntersecting;
            wake();
          },
          { rootMargin: "80px" },
        );
        intersectionObserver.observe(mount!);
        disposers.push(() => intersectionObserver.disconnect());

        const onPointer = (event: PointerEvent) => {
          if (
            event.pointerType === "touch" ||
            reducedMotion.matches ||
            !visible
          )
            return;
          pointerX = (event.clientX / window.innerWidth - 0.5) * 2;
          pointerY = (event.clientY / window.innerHeight - 0.5) * 2;
        };
        const onScroll = () => {
          scroll = Math.min(
            window.scrollY / Math.max(window.innerHeight, 1),
            1.6,
          );
        };
        const onContextLost = (event: Event) => {
          event.preventDefault();
          contextLost = true;
          setReady(false);
          wake();
        };
        const onContextRestored = () => {
          contextLost = false;
          setReady(true);
          wake();
        };
        window.addEventListener("pointermove", onPointer, { passive: true });
        window.addEventListener("scroll", onScroll, { passive: true });
        document.addEventListener("visibilitychange", wake);
        reducedMotion.addEventListener("change", wake);
        renderer.domElement.addEventListener("webglcontextlost", onContextLost);
        renderer.domElement.addEventListener(
          "webglcontextrestored",
          onContextRestored,
        );
        disposers.push(() => {
          window.cancelAnimationFrame(frame);
          window.removeEventListener("pointermove", onPointer);
          window.removeEventListener("scroll", onScroll);
          document.removeEventListener("visibilitychange", wake);
          reducedMotion.removeEventListener("change", wake);
          renderer.domElement.removeEventListener(
            "webglcontextlost",
            onContextLost,
          );
          renderer.domElement.removeEventListener(
            "webglcontextrestored",
            onContextRestored,
          );
        });
        resize();
        setReady(true);
      } catch {
        // An elegant CSS silhouette remains available when WebGL is disabled.
        for (const dispose of disposers.reverse()) dispose();
        disposers.length = 0;
        if (!disposed) setReady(false);
      }
    }

    void createSculpture();
    return () => {
      disposed = true;
      for (const dispose of disposers.reverse()) dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className={className}
      aria-hidden="true"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "15%",
          opacity: ready ? 0 : 1,
          filter: "drop-shadow(0 20px 35px #0008)",
        }}
      >
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            style={{
              position: "absolute",
              inset: "12% 0",
              borderRadius: "50%",
              border: "clamp(22px, 4vw, 58px) solid transparent",
              background:
                "linear-gradient(#101013,#101013) padding-box, conic-gradient(from 35deg,#55555b,#f8eee4 15%,#77777d 27%,#1f2024 43%,#f5f4f1 64%,#9e8174 76%,#29292e 88%,#77777c) border-box",
              transform: `rotate(${index * 60 - 25}deg) scaleX(.65)`,
              boxShadow: "inset 2px 2px 8px #0009, 2px 4px 14px #0006",
            }}
          />
        ))}
      </div>
    </div>
  );
}
