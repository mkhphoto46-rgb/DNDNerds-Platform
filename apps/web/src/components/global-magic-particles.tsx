"use client";

import {
  useEffect,
  useRef,
} from "react";

type Particle = {
  homeX: number;
  homeY: number;

  x: number;
  y: number;

  vx: number;
  vy: number;

  radius: number;
  alpha: number;

  orbitX: number;
  orbitY: number;

  phase: number;
  speed: number;

  twinkleSpeed: number;
  twinkleStrength: number;
  twinkleFloor: number;

  color: string;
};

const COLORS = [
  "250,236,197",
  "234,199,136",
  "197,152,87",
  "221,128,70",
];

function clamp(
  value: number,
  min: number,
  max: number,
) {
  return Math.max(
    min,
    Math.min(
      max,
      value,
    ),
  );
}

function randomBetween(
  min: number,
  max: number,
) {
  return (
    min +
    Math.random() *
      (max - min)
  );
}

function createParticle(
  width: number,
  height: number,
): Particle {
  const homeX =
    Math.random() * width;

  const homeY =
    Math.random() * height;

  /*
   * Keep particles visually small.
   * We increase COUNT, not particle size.
   */

  const slightlyBright =
    Math.random() < 0.09;

  const radius =
    slightlyBright
      ? randomBetween(
          0.9,
          1.35,
        )
      : randomBetween(
          0.38,
          0.84,
        );

  const alpha =
    slightlyBright
      ? randomBetween(
          0.52,
          0.78,
        )
      : randomBetween(
          0.22,
          0.5,
        );

  /*
   * About half the field gets
   * a more obvious magical twinkle.
   */

  const strongTwinkle =
    Math.random() < 0.5;

  return {
    homeX,
    homeY,

    x: homeX,
    y: homeY,

    vx: 0,
    vy: 0,

    radius,
    alpha,

    /*
     * V5:
     * slightly larger local travel.
     */

    orbitX:
      randomBetween(
        12,
        40,
      ),

    orbitY:
      randomBetween(
        9,
        32,
      ),

    phase:
      Math.random() *
      Math.PI *
      2,

    /*
     * Still slow,
     * but more alive than V4.
     */

    speed:
      randomBetween(
        0.14,
        0.29,
      ),

    /*
     * Stronger visible twinkle.
     */

    twinkleSpeed:
      randomBetween(
        0.9,
        1.9,
      ),

    twinkleStrength:
      strongTwinkle
        ? randomBetween(
            0.8,
            0.97,
          )
        : randomBetween(
            0.38,
            0.62,
          ),

    twinkleFloor:
      strongTwinkle
        ? randomBetween(
            0.025,
            0.11,
          )
        : randomBetween(
            0.38,
            0.58,
          ),

    color:
      COLORS[
        Math.floor(
          Math.random() *
            COLORS.length,
        )
      ],
  };
}

export function GlobalMagicParticles() {
  const canvasRef =
    useRef<HTMLCanvasElement | null>(
      null,
    );

  const particlesRef =
    useRef<Particle[]>([]);

  const frameRef =
    useRef<number | null>(
      null,
    );

  const mouseRef =
    useRef({
      x: -9999,
      y: -9999,

      active: false,

      radius: 150,
      force: 0.36,

      lastMove: 0,
    });

  useEffect(() => {
    const canvas =
      canvasRef.current;

    if (!canvas) {
      return;
    }

    const ctx =
      canvas.getContext(
        "2d",
        {
          alpha: true,
        },
      );

    if (!ctx) {
      return;
    }

    const reducedMotion =
      window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

    const coarsePointer =
      window.matchMedia(
        "(pointer: coarse)",
      ).matches;

    let width =
      window.innerWidth;

    let height =
      window.innerHeight;

    let dpr =
      Math.min(
        window.devicePixelRatio || 1,
        1.5,
      );

    const rebuild = () => {
      width =
        window.innerWidth;

      height =
        window.innerHeight;

      dpr =
        Math.min(
          window.devicePixelRatio || 1,
          1.5,
        );

      canvas.width =
        Math.floor(
          width * dpr,
        );

      canvas.height =
        Math.floor(
          height * dpr,
        );

      canvas.style.width =
        `${width}px`;

      canvas.style.height =
        `${height}px`;

      ctx.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0,
      );

      const area =
        width * height;

      /*
       * V5:
       * noticeably denser field.
       */

      let count =
        Math.floor(
          area / 4300,
        );

      count =
        clamp(
          count,
          coarsePointer
            ? 150
            : 320,
          coarsePointer
            ? 240
            : 520,
        );

      if (reducedMotion) {
        count = 110;
      }

      particlesRef.current =
        Array.from(
          {
            length: count,
          },
          () =>
            createParticle(
              width,
              height,
            ),
        );
    };

    rebuild();

    const drawParticle = (
      particle: Particle,
      time: number,
    ) => {
      /*
       * Smooth independent blinking.
       */

      const rawWave =
        (
          Math.sin(
            time *
              particle.twinkleSpeed +
              particle.phase,
          ) +
          1
        ) /
        2;

      /*
       * Smoothstep curve.
       */

      const smoothWave =
        rawWave *
        rawWave *
        (
          3 -
          2 * rawWave
        );

      /*
       * Extra shaping:
       * makes bright moments slightly
       * more noticeable without flashing.
       */

      const luminousWave =
        Math.pow(
          smoothWave,
          1.35,
        );

      const twinkle =
        particle.twinkleFloor +
        (
          1 -
          particle.twinkleFloor
        ) *
          luminousWave;

      const mixedTwinkle =
        1 -
        particle.twinkleStrength +
        particle.twinkleStrength *
          twinkle;

      const alpha =
        particle.alpha *
        mixedTwinkle;

      /*
       * Still compact glow.
       */

      const glowRadius =
        particle.radius *
        3.2;

      const gradient =
        ctx.createRadialGradient(
          particle.x,
          particle.y,
          0,

          particle.x,
          particle.y,
          glowRadius,
        );

      gradient.addColorStop(
        0,
        `rgba(${particle.color},${alpha})`,
      );

      gradient.addColorStop(
        0.25,
        `rgba(${particle.color},${alpha * 0.5})`,
      );

      gradient.addColorStop(
        0.62,
        `rgba(${particle.color},${alpha * 0.09})`,
      );

      gradient.addColorStop(
        1,
        `rgba(${particle.color},0)`,
      );

      ctx.beginPath();

      ctx.fillStyle =
        gradient;

      ctx.arc(
        particle.x,
        particle.y,
        glowRadius,
        0,
        Math.PI * 2,
      );

      ctx.fill();

      /*
       * Small bright center.
       */

      ctx.beginPath();

      ctx.fillStyle =
        `rgba(${particle.color},${Math.min(
          0.96,
          alpha * 1.45,
        )})`;

      ctx.arc(
        particle.x,
        particle.y,
        particle.radius,
        0,
        Math.PI * 2,
      );

      ctx.fill();
    };

    const animate = (
      timestamp: number,
    ) => {
      ctx.clearRect(
        0,
        0,
        width,
        height,
      );

      const time =
        timestamp * 0.001;

      if (
        mouseRef.current.active &&
        timestamp -
          mouseRef.current.lastMove >
          180
      ) {
        mouseRef.current.active =
          false;
      }

      ctx.globalCompositeOperation =
        "lighter";

      for (
        const particle
        of particlesRef.current
      ) {
        /*
         * Slightly stronger ambient travel.
         */

        const targetX =
          particle.homeX +
          Math.sin(
            time *
              particle.speed +
              particle.phase,
          ) *
            particle.orbitX;

        const targetY =
          particle.homeY +
          Math.cos(
            time *
              particle.speed *
              0.83 +
              particle.phase,
          ) *
            particle.orbitY;

        /*
         * Spring return remains.
         */

        particle.vx +=
          (
            targetX -
            particle.x
          ) *
          0.0019;

        particle.vy +=
          (
            targetY -
            particle.y
          ) *
          0.0019;

        /*
         * Mouse repulsion.
         */

        if (
          mouseRef.current.active &&
          !reducedMotion
        ) {
          const dx =
            particle.x -
            mouseRef.current.x;

          const dy =
            particle.y -
            mouseRef.current.y;

          const distanceSquared =
            dx * dx +
            dy * dy;

          const radius =
            mouseRef.current.radius;

          if (
            distanceSquared <
            radius * radius
          ) {
            const distance =
              Math.sqrt(
                distanceSquared,
              ) || 0.001;

            const normalized =
              1 -
              distance /
                radius;

            const force =
              normalized *
              normalized *
              mouseRef.current.force;

            particle.vx +=
              (
                dx /
                distance
              ) *
              force;

            particle.vy +=
              (
                dy /
                distance
              ) *
              force;
          }
        }

        /*
         * Smooth damping.
         */

        particle.vx *=
          0.968;

        particle.vy *=
          0.968;

        /*
         * Slightly higher max speed,
         * but nowhere near chaotic V2.
         */

        particle.vx =
          clamp(
            particle.vx,
            -1.35,
            1.35,
          );

        particle.vy =
          clamp(
            particle.vy,
            -1.35,
            1.35,
          );

        particle.x +=
          particle.vx;

        particle.y +=
          particle.vy;

        drawParticle(
          particle,
          time,
        );
      }

      ctx.globalCompositeOperation =
        "source-over";

      frameRef.current =
        window.requestAnimationFrame(
          animate,
        );
    };

    const onPointerMove = (
      event: PointerEvent,
    ) => {
      if (
        event.pointerType ===
        "touch"
      ) {
        return;
      }

      mouseRef.current.x =
        event.clientX;

      mouseRef.current.y =
        event.clientY;

      mouseRef.current.active =
        true;

      mouseRef.current.lastMove =
        performance.now();
    };

    const onPointerLeave = () => {
      mouseRef.current.active =
        false;
    };

    const onResize = () => {
      rebuild();
    };

    window.addEventListener(
      "pointermove",
      onPointerMove,
      {
        passive: true,
      },
    );

    window.addEventListener(
      "pointerleave",
      onPointerLeave,
    );

    window.addEventListener(
      "resize",
      onResize,
    );

    frameRef.current =
      window.requestAnimationFrame(
        animate,
      );

    return () => {
      window.removeEventListener(
        "pointermove",
        onPointerMove,
      );

      window.removeEventListener(
        "pointerleave",
        onPointerLeave,
      );

      window.removeEventListener(
        "resize",
        onResize,
      );

      if (
        frameRef.current !== null
      ) {
        window.cancelAnimationFrame(
          frameRef.current,
        );
      }
    };
  }, []);

  return (
    <div
      className="global-magic-particles"
      aria-hidden="true"
    >

      <canvas
        ref={canvasRef}
        className="global-magic-particles-canvas"
      />

      <div className="particle-haze particle-haze-red" />

      <div className="particle-haze particle-haze-gold" />

    </div>
  );
}