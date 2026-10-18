"use client";

import Image from "next/image";
import Link from "next/link";
import { SocialScene } from "./social-scene";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

const SCENE_COUNT = 6;

const sceneLabels = [
  "DND Nerds",
  "Web VTT",
  "DM Tables",
  "DMless",
  "Store",
  "Friends & Chat",
];

const ambientDice = [
  { sides: "D4", points: "32,5 58,54 6,54", lines: "M32 5v49M6 54l26-18 26 18" },
  { sides: "D6", points: "10,14 44,9 56,24 53,51 20,57 8,39", lines: "M10 14l25 17 21-7M35 31 20 57M35 31l18 20" },
  { sides: "D8", points: "32,3 57,31 32,61 7,31", lines: "M32 3v58M7 31h50M32 3 7 31l25 30 25-30Z" },
  { sides: "D10", points: "32,4 52,17 58,42 32,60 6,42 12,17", lines: "M12 17h40M6 42l26-15 26 15M32 27v33" },
  { sides: "D12", points: "32,3 51,10 60,29 54,49 32,61 10,49 4,29 13,10", lines: "M13 10 23 29 10 49M51 10 41 29 54 49M23 29h18M23 29l9 32 9-32" },
  { sides: "D20", points: "32,3 54,17 58,43 32,60 6,43 10,17", lines: "M10 17h44M6 43l26-9 26 9M32 3 21 26l11 8 11-8L32 3ZM32 34v26" },
] as const;

function AmbientDice() {
  return <div className="ambient-dice" aria-hidden="true">{ambientDice.map(die => (
    <svg key={die.sides} className={`ambient-die ambient-die-${die.sides.toLowerCase()}`} viewBox="0 0 64 64" focusable="false">
      <polygon points={die.points} /><path d={die.lines} /><text x="32" y="39" textAnchor="middle">{die.sides.slice(1)}</text>
    </svg>
  ))}</div>;
}

const sceneVariants = {
  enter: (direction: number) => ({
    opacity: 0,
    y: direction > 0 ? 52 : -52,
    scale: 0.985,
    filter: "blur(14px)",
  }),

  center: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
  },

  exit: (direction: number) => ({
    opacity: 0,
    y: direction > 0 ? -42 : 42,
    scale: 1.015,
    filter: "blur(12px)",
  }),
};

const childVariants = {
  hidden: {
    opacity: 0,
    y: 22,
  },

  show: (delay: number) => ({
    opacity: 1,
    y: 0,

    transition: {
      duration: 0.75,
      delay,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  }),
};

export function HomeSceneExperience() {
  const reducedMotion = useReducedMotion();

  const [activeScene, setActiveScene] = useState(0);
  const [direction, setDirection] = useState(1);

  const locked = useRef(false);
  const wheelAccumulator = useRef(0);
  const touchStartY = useRef<number | null>(null);

  const wheelResetTimer =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const changeScene = useCallback(
    (step: number) => {
      if (locked.current) {
        return;
      }

      const next = Math.max(
        0,
        Math.min(
          SCENE_COUNT - 1,
          activeScene + step,
        ),
      );

      if (next === activeScene) {
        return;
      }

      locked.current = true;

      setDirection(
        step > 0 ? 1 : -1,
      );

      setActiveScene(next);

      window.setTimeout(
        () => {
          locked.current = false;
        },
        reducedMotion ? 100 : 950,
      );
    },
    [
      activeScene,
      reducedMotion,
    ],
  );

  const jumpToScene = useCallback(
    (target: number) => {
      if (
        locked.current ||
        target === activeScene ||
        target < 0 ||
        target >= SCENE_COUNT
      ) {
        return;
      }

      locked.current = true;

      setDirection(
        target > activeScene
          ? 1
          : -1,
      );

      setActiveScene(target);

      window.setTimeout(
        () => {
          locked.current = false;
        },
        reducedMotion ? 100 : 950,
      );
    },
    [
      activeScene,
      reducedMotion,
    ],
  );

  useEffect(() => {
    const onWheel = (
      event: WheelEvent,
    ) => {
      if (event.target instanceof Element && event.target.closest("[data-social-dock]")) return;
      event.preventDefault();

      if (locked.current) {
        return;
      }

      wheelAccumulator.current +=
        event.deltaY;

      if (
        wheelResetTimer.current
      ) {
        clearTimeout(
          wheelResetTimer.current,
        );
      }

      wheelResetTimer.current =
        setTimeout(
          () => {
            wheelAccumulator.current = 0;
          },
          160,
        );

      if (
        Math.abs(
          wheelAccumulator.current,
        ) < 90
      ) {
        return;
      }

      const step =
        wheelAccumulator.current > 0
          ? 1
          : -1;

      wheelAccumulator.current = 0;

      changeScene(step);
    };

    const onKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (event.target instanceof Element && event.target.closest("input, textarea, select, button, a, [contenteditable], [data-social-dock]")) return;
      if (
        event.key === "ArrowDown" ||
        event.key === "PageDown"
      ) {
        event.preventDefault();
        changeScene(1);
      }

      if (
        event.key === "ArrowUp" ||
        event.key === "PageUp"
      ) {
        event.preventDefault();
        changeScene(-1);
      }

      if (event.key === "Home") {
        event.preventDefault();
        jumpToScene(0);
      }

      if (event.key === "End") {
        event.preventDefault();
        jumpToScene(
          SCENE_COUNT - 1,
        );
      }
    };

    const onTouchStart = (
      event: TouchEvent,
    ) => {
      touchStartY.current =
        event.changedTouches[0]
          ?.clientY ?? null;
    };

    const onTouchEnd = (
      event: TouchEvent,
    ) => {
      if (
        touchStartY.current === null
      ) {
        return;
      }

      const endY =
        event.changedTouches[0]
          ?.clientY ??
        touchStartY.current;

      const distance =
        touchStartY.current -
        endY;

      touchStartY.current = null;

      if (
        Math.abs(distance) < 65
      ) {
        return;
      }

      changeScene(
        distance > 0 ? 1 : -1,
      );
    };

    window.addEventListener(
      "wheel",
      onWheel,
      {
        passive: false,
      },
    );

    window.addEventListener(
      "keydown",
      onKeyDown,
    );

    window.addEventListener(
      "touchstart",
      onTouchStart,
      {
        passive: true,
      },
    );

    window.addEventListener(
      "touchend",
      onTouchEnd,
      {
        passive: true,
      },
    );

    return () => {
      window.removeEventListener(
        "wheel",
        onWheel,
      );

      window.removeEventListener(
        "keydown",
        onKeyDown,
      );

      window.removeEventListener(
        "touchstart",
        onTouchStart,
      );

      window.removeEventListener(
        "touchend",
        onTouchEnd,
      );

      if (
        wheelResetTimer.current
      ) {
        clearTimeout(
          wheelResetTimer.current,
        );
      }
    };
  }, [
    changeScene,
    jumpToScene,
  ]);

  return (
    <main className="scene-experience" data-scene={activeScene}>

      <div
        className="magic-background"
        aria-hidden="true"
      >
        <div className="magic-orb magic-orb-red" />
        <div className="magic-orb magic-orb-gold" />

        <div className="magic-vignette" />
        <div className="magic-grain" />
        <AmbientDice />
      </div>

      <AnimatePresence
        mode="wait"
        custom={direction}
        initial={false}
      >
        <motion.section
          key={activeScene}
          className="scene"
          custom={direction}
          variants={sceneVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            duration:
              reducedMotion
                ? 0.01
                : 0.82,

            ease:
              [0.22, 1, 0.36, 1],
          }}
        >
          {activeScene === 0 && (
            <IntroScene />
          )}

          {activeScene === 1 && (
            <VttScene />
          )}

          {activeScene === 2 && (
            <DmScene />
          )}

          {activeScene === 3 && (
            <ArenaScene />
          )}

          {activeScene === 4 && (
            <StoreScene />
          )}

          {activeScene === 5 && (
            <SocialScene />
          )}
        </motion.section>
      </AnimatePresence>

      <SceneNavigator
        activeScene={activeScene}
        onSelect={jumpToScene}
      />

      <div className="scene-wheel-hint">
        <span>SCROLL</span>

        <div className="wheel-line">
          <i />
        </div>
      </div>

    </main>
  );
}

/* ==========================================================
   SCENE 01
   ========================================================== */

function IntroScene() {
  return (
    <div className="scene-shell intro-v2">

      <motion.div
        className="scene-copy intro-copy-v2"
        custom={0.06}
        variants={childVariants}
        initial="hidden"
        animate="show"
      >

        <div className="scene-kicker">
          <span>01</span>
          DND NERDS
        </div>

        <h1>
          تمام دنیای بازی
          <em>
            روی یک میز
          </em>
        </h1>

        <p className="scene-description">
          بازی، همراه و ماجرا؛ همه در یک جا.
        </p>

        <div className="scene-actions">

          <Link
            className="button button-primary button-large"
            href="/register"
          >
            شروع ماجراجویی
          </Link>

          <Link
            className="button button-ghost button-large"
            href="/find-game"
          >
            پیدا کردن بازی
          </Link>

        </div>

        <div className="intro-signature">

          <span>
            Campaign
          </span>

          <i />

          <span>
            Web VTT
          </span>

          <i />

          <span>
            DMless
          </span>

          <i />

          <span>
            Store
          </span>

        </div>

      </motion.div>

      <motion.div
        className="hero-art-stage"
        custom={0.16}
        variants={childVariants}
        initial="hidden"
        animate="show"
        aria-hidden="true"
      >

        <div className="hero-art-aura hero-art-aura-red" />

        <div className="hero-art-aura hero-art-aura-gold" />

        <div className="hero-art-orbit hero-art-orbit-one" />

        <div className="hero-art-orbit hero-art-orbit-two" />

        <div className="hero-art-image-wrap">

          <Image
            src="/brand/hero/hero-arcana.png"
            alt=""
            width={1448}
            height={1086}
            priority
            className="hero-arcana-image"
          />

          <div className="hero-art-shine" />

          <div className="hero-light-streak streak-one" />

          <div className="hero-light-streak streak-two" />

          <div className="hero-spark spark-one" />
          <div className="hero-spark spark-two" />
          <div className="hero-spark spark-three" />
          <div className="hero-spark spark-four" />
          <div className="hero-spark spark-five" />
          <div className="hero-spark spark-six" />

        </div>

      </motion.div>

    </div>
  );
}
function VttScene() {
  return (
    <div className="scene-shell feature-scene">

      <motion.div
        className="scene-copy feature-copy"
        custom={0.08}
        variants={childVariants}
        initial="hidden"
        animate="show"
      >
        <div className="scene-kicker">
          <span>02</span>
          WEB VTT
        </div>

        <h2>
          بازی را از دل کمپین
          <em>اجرا کن</em>
        </h2>

        <p className="scene-description">
          نقشه و نبرد، کنار کمپین تو.
        </p>

        <details className="scene-more"><summary>جزئیات میز مجازی</summary><div className="micro-features"><span>Grid Maps</span><span>Fog of War</span><span>Initiative</span><span>Auto Rules</span></div></details>

        <Link
          className="scene-text-link"
          href="/play"
        >
          مشاهده Web VTT
          <span>←</span>
        </Link>
      </motion.div>

      <motion.div
        className="vtt-showcase"
        custom={0.18}
        variants={childVariants}
        initial="hidden"
        animate="show"
      >
        <div className="vtt-window">

          <div className="vtt-window-header">

            <div>
              <i />
              <i />
              <i />
            </div>

            <span>
              SESSION 18
            </span>

          </div>

          <div className="vtt-window-body">

            <div className="vtt-side-panel">

              <span className="vtt-label">
                INITIATIVE
              </span>

              <div className="initiative-row active">
                <b>18</b>
                <span>Kael</span>
              </div>

              <div className="initiative-row">
                <b>14</b>
                <span>Mira</span>
              </div>

              <div className="initiative-row">
                <b>09</b>
                <span>Wraith</span>
              </div>

            </div>

            <div className="vtt-board">

              <div className="vtt-grid" />

              <div className="room room-one" />
              <div className="room room-two" />
              <div className="corridor" />

              <div className="vtt-token token-a">
                <span>K</span>
              </div>

              <div className="vtt-token token-b">
                <span>M</span>
              </div>

              <div className="vtt-token token-enemy">
                <span>W</span>
              </div>

              <div className="spell-range" />

              <div className="fog fog-a" />
              <div className="fog fog-b" />

            </div>

          </div>

        </div>

        <div className="vtt-float-card">
          <small>TURN</small>
          <strong>Kael</strong>
          <span>30 ft movement</span>
        </div>

      </motion.div>

    </div>
  );
}

/* ==========================================================
   SCENE 03
   ========================================================== */

function DmScene() {
  return (
    <div className="scene-shell feature-scene">

      <motion.div
        className="scene-copy feature-copy"
        custom={0.08}
        variants={childVariants}
        initial="hidden"
        animate="show"
      >
        <div className="scene-kicker">
          <span>03</span>
          DM TABLES
        </div>

        <h2>
          میز مناسب را پیدا کن
          <em>یا میز خودت را بساز</em>
        </h2>

        <p className="scene-description">
          میز مناسب را انتخاب کن یا میز خودت را بساز.
        </p>

        <details className="scene-more"><summary>جزئیات میزها</summary><div className="micro-features"><span>Free Tables</span><span>Paid Tables</span><span>DM Profiles</span><span>Invites</span></div></details>

        <Link
          className="scene-text-link"
          href="/find-dm"
        >
          مشاهده میزهای DM
          <span>←</span>
        </Link>

      </motion.div>

      <motion.div
        className="table-stack"
        custom={0.18}
        variants={childVariants}
        initial="hidden"
        animate="show"
      >

        <article className="table-card table-card-back">
          <div className="table-art table-art-three" />

          <div className="table-content">
            <small>Dark Fantasy</small>
            <strong>Raven&apos;s Hollow</strong>
            <span>پنجشنبه ۲۰:۳۰</span>
          </div>
        </article>

        <article className="table-card table-card-mid">
          <div className="table-art table-art-two" />

          <div className="table-content">
            <small>Mini Campaign</small>
            <strong>Ashes of Veyra</strong>
            <span>۳ صندلی خالی</span>
          </div>
        </article>

        <article className="table-card table-card-front">

          <div className="table-art table-art-one">
            <div className="table-moon" />
            <div className="table-castle" />
          </div>

          <div className="table-content">

            <div className="table-content-top">
              <small>CAMPAIGN</small>
              <span className="table-price">
                FREE
              </span>
            </div>

            <strong>
              The Crimson Throne
            </strong>

            <p>
              یک کمپین هفتگی برای ۵ بازیکن
            </p>

            <div className="dm-row">

              <div className="dm-avatar">
                DM
              </div>

              <div>
                <b>Raven Master</b>
                <span>
                  4.9 · 86 Sessions
                </span>
              </div>

            </div>

          </div>
        </article>

      </motion.div>

    </div>
  );
}

/* ==========================================================
   SCENE 04 — DMLESS
   ========================================================== */

function ArenaScene() {
  return (
    <div className="scene-shell feature-scene">

      <motion.div
        className="scene-copy feature-copy"
        custom={0.08}
        variants={childVariants}
        initial="hidden"
        animate="show"
      >
        <div className="scene-kicker crimson">
          <span>04</span>
          DMLESS ARENA
        </div>

        <h2>
          DMless
          <em>جایی که فقط بازیکن تصمیم می‌گیرد</em>
        </h2>

        <p className="scene-description">
          نبرد سریع؛ تصمیم با توست.
        </p>

        <div className="arena-modes">
          <span className="selected">
            1v1
          </span>

          <span>
            2v2
          </span>

          <span>
            3v3
          </span>
        </div>

        <Link
          className="scene-text-link red-link"
          href="/arena"
        >
          ورود به DMless Arena
          <span>←</span>
        </Link>

      </motion.div>

      <motion.div
        className="arena-stage"
        custom={0.18}
        variants={childVariants}
        initial="hidden"
        animate="show"
      >
        <div className="arena-beam" />

        <article className="fighter fighter-one">

          <div className="fighter-emblem">
            <span>K</span>
          </div>

          <small>
            PLAYER ONE
          </small>

          <strong>
            Kael
          </strong>

          <div className="fighter-rank">
            GOLD I
          </div>

        </article>

        <div className="arena-center">

          <div className="arena-rank-label">
            DMLESS
          </div>

          <strong>
            VS
          </strong>

          <span>
            RANKED MATCH
          </span>

        </div>

        <article className="fighter fighter-two">

          <div className="fighter-emblem">
            <span>V</span>
          </div>

          <small>
            PLAYER TWO
          </small>

          <strong>
            Vael
          </strong>

          <div className="fighter-rank">
            GOLD II
          </div>

        </article>

      </motion.div>

    </div>
  );
}

/* ==========================================================
   SCENE 05
   ========================================================== */

function StoreScene() {
  return (
    <div className="scene-shell feature-scene">

      <motion.div
        className="scene-copy feature-copy"
        custom={0.08}
        variants={childVariants}
        initial="hidden"
        animate="show"
      >
        <div className="scene-kicker">
          <span>05</span>
          STORE + LIBRARY
        </div>

        <h2>
          خرید کن
          <em>مستقیم داخل بازی استفاده کن</em>
        </h2>

        <p className="scene-description">
          محتوای تازه، مستقیم روی میز بازی‌ات.
        </p>

        <div className="scene-actions">

          <Link
            className="button button-primary button-large"
            href="/store"
          >
            ورود به Store
          </Link>

          <Link
            className="button button-ghost button-large"
            href="/register"
          >
            ساخت حساب
          </Link>

        </div>

      </motion.div>

      <motion.div
        className="store-flow"
        custom={0.18}
        variants={childVariants}
        initial="hidden"
        animate="show"
      >

        <div className="store-flow-card asset-card">

          <div className="asset-preview">
            <div className="asset-map-grid" />
            <div className="asset-gate" />
          </div>

          <small>
            STORE
          </small>

          <strong>
            Crimson Keep
          </strong>

          <span>
            Map Pack
          </span>

        </div>

        <div className="flow-arrow">
          ←
        </div>

        <div className="store-flow-card library-card">

          <div className="library-icon">
            <span>+</span>
          </div>

          <small>
            MY LIBRARY
          </small>

          <strong>
            Owned Content
          </strong>

          <span>
            Ready to use
          </span>

        </div>

        <div className="flow-arrow">
          ←
        </div>

        <div className="store-flow-card campaign-card">

          <div className="campaign-icon">
            DND
          </div>

          <small>
            CAMPAIGN
          </small>

          <strong>
            Add to VTT
          </strong>

          <span>
            One click
          </span>

        </div>

      </motion.div>

    </div>
  );
}

/* ==========================================================
   NAVIGATOR
   ========================================================== */

type SceneNavigatorProps = {
  activeScene: number;
  onSelect: (index: number) => void;
};

function SceneNavigator({
  activeScene,
  onSelect,
}: SceneNavigatorProps) {
  return (
    <nav
      className="scene-navigator"
      aria-label="Scene navigation"
    >

      <div className="scene-counter">

        <strong>
          {String(
            activeScene + 1,
          ).padStart(
            2,
            "0",
          )}
        </strong>

        <span>/</span>

        <span>
          {String(
            SCENE_COUNT,
          ).padStart(
            2,
            "0",
          )}
        </span>

      </div>

      <div className="scene-progress">

        <motion.div
          className="scene-progress-fill"
          animate={{
            width:
              `${
                (
                  (
                    activeScene + 1
                  ) /
                  SCENE_COUNT
                ) *
                100
              }%`,
          }}
          transition={{
            duration: 0.7,
            ease:
              [0.22, 1, 0.36, 1],
          }}
        />

      </div>

      <div className="scene-labels">

        {sceneLabels.map(
          (
            label,
            index,
          ) => (
            <button
              key={label}
              type="button"
              onClick={
                () =>
                  onSelect(index)
              }
              className={
                index === activeScene
                  ? "active"
                  : ""
              }
            >
              {label}
            </button>
          ),
        )}

      </div>

    </nav>
  );
}
