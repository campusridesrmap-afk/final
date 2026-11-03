
/**
 * CAMPUSRIDE — PRODUCTION FESTIVAL THEME SYSTEM
 * File: src/festivalTheme.js
 *
 * THEME: DIWALI ("Royal Navy & Luminous Golden Glow")
 *
 * Meticulously designed for CampusRide:
 * - Harmonious marriage of CampusRide's signature Royal Blue with regal warm gold and amber.
 * - Layered ambient lighting: deep twilight hero banner with organic toran fairy lights,
 *   subtle sacred rangoli watermark, centerpiece diya, and drifting starburst sparkles.
 * - Physics-based gliding diya indicator on desktop topbar and mobile sticky bottom nav.
 * - Subtle gold hairline detailing on ride cards without cluttering badges or action buttons.
 * - Smooth, high-performance GPU-accelerated animations (transform & opacity only).
 * - Comprehensive accessibility (respects prefers-reduced-motion) and tab-inactivity battery saver.
 * - 100% idempotent DOM management, MutationObserver throttling, and complete zero-leak cleanup.
 *
 * MANUAL ACTIVATION:
 *   active: true  -> Activates Diwali theme
 *   active: false -> Restores 100% original vanilla CampusRide
 */

// ============================================================================
// 1. FESTIVAL THEME CONFIGURATION (MANUAL ON / OFF ONLY)
// ============================================================================

const festivalTheme = {
  active: true, // Set to false to instantly deactivate and restore vanilla CampusRide
  name: "Diwali",
  type: "diwali",
  colors: {
    // Light Mode Palette (warm, legible, non-muddy gold & amber)
    gold: "#d97706",
    goldBright: "#f59e0b",
    goldSoft: "rgba(217, 119, 6, 0.18)",
    goldBorder: "rgba(217, 119, 6, 0.38)",
    amber: "#f59e0b",
    saffron: "#ea580c",
    aura: "rgba(245, 158, 11, 0.22)",

    // Dark Mode Palette (luminous champagne gold against midnight blue)
    darkGold: "#fbbf24",
    darkGoldBright: "#fde047",
    darkGoldSoft: "rgba(251, 191, 36, 0.22)",
    darkGoldBorder: "rgba(251, 191, 36, 0.42)",
    darkAura: "rgba(251, 191, 36, 0.28)",
  },
  decorations: {
    navDiya: true,           // Smooth gliding diya marker on active navigation tab
    heroBannerFestive: true, // Fairy lights, soft rangoli, centerpiece diya, sparkles
    cardFestiveAccents: true // Elegant hairline gold detailing & hover glow on ride cards
  },
  animations: true
};

export default festivalTheme;

// ============================================================================
// 2. CONSTANTS & LIFECYCLE IDENTIFIERS
// ============================================================================

const STYLE_ID = "campusride-festival-theme-styles";
const OVERLAY_ID = "campusride-festival-decorations";
const CLEANUP_KEY = "__campusRideFestivalCleanup__";
const PAUSED_CLASS = "cr-dw-paused";

// ============================================================================
// 3. HIGH-FIDELITY SVG & HTML ASSET GENERATORS
// ============================================================================

/**
 * Sculpted Brass Diya SVG
 * Features a metallic clay/brass bowl, delicate engraved rim, rich oil depth,
 * and a realistic dual-stage flame (inner luminous core + outer warm amber sheath).
 * Only the flame group (.cr-dw-flame) animates via hardware-accelerated transforms.
 */
function getDiyaSVGString(size = 32, isMini = false) {
  const h = Math.round((size * 30) / 40);
  const uid = `crDw_${Math.random().toString(36).slice(2, 8)}`;

  return `
    <svg class="cr-dw-diya-svg" width="${size}" height="${h}" viewBox="0 0 40 30" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <defs>
        <!-- Metallic Brass / Clay Bowl Gradient -->
        <linearGradient id="${uid}_bowl" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#fbbf24"/>
          <stop offset="40%" stop-color="#d97706"/>
          <stop offset="85%" stop-color="#92400e"/>
          <stop offset="100%" stop-color="#451a03"/>
        </linearGradient>
        <!-- Luminous Flame Radial Gradient -->
        <radialGradient id="${uid}_fire" cx="50%" cy="72%" r="62%">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="28%" stop-color="#fef08a"/>
          <stop offset="65%" stop-color="#f59e0b"/>
          <stop offset="100%" stop-color="#dc2626"/>
        </radialGradient>
        <!-- Soft Ambient Flame Halo -->
        <radialGradient id="${uid}_halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="rgba(254, 240, 138, 0.9)"/>
          <stop offset="50%" stop-color="rgba(245, 158, 11, 0.4)"/>
          <stop offset="100%" stop-color="rgba(245, 158, 11, 0)"/>
        </radialGradient>
      </defs>

      <!-- Lamp Base Shadow -->
      <ellipse cx="20" cy="28.5" rx="14" ry="1.5" fill="rgba(0, 0, 0, 0.25)"/>

      <!-- Sculpted Bowl Body -->
      <path d="M4 15 C4 23.5 11.5 28.5 20 28.5 C28.5 28.5 36 23.5 36 15 C30 18.2 10 18.2 4 15 Z" fill="url(#${uid}_bowl)"/>
      
      <!-- Polished Brass Rim -->
      <ellipse cx="20" cy="15" rx="16" ry="3.2" fill="#fde047"/>
      <!-- Sacred Oil Pool -->
      <ellipse cx="20" cy="15.3" rx="13" ry="2" fill="#78350f" opacity="0.85"/>

      ${!isMini ? `
        <!-- Traditional Decorative Engraved Dot Accents -->
        <circle cx="12" cy="22.5" r="1" fill="#fef08a" opacity="0.9"/>
        <circle cx="20" cy="25" r="1.1" fill="#fef08a" opacity="0.95"/>
        <circle cx="28" cy="22.5" r="1" fill="#fef08a" opacity="0.9"/>
      ` : ""}

      <!-- Cotton Wick -->
      <path d="M19.5 14.5 Q19.8 12 20.2 11" stroke="#3b1d04" stroke-width="1.2" stroke-linecap="round"/>

      <!-- Organic Multi-Layered Flame -->
      <g class="cr-dw-flame">
        <!-- Outer Golden Halo Aura -->
        <ellipse cx="20" cy="8.5" rx="6.5" ry="8" fill="url(#${uid}_halo)" opacity="0.7"/>
        <!-- Main Flame Body -->
        <path d="M20 1.2 C23.4 5.8 25 8.6 25 11 C25 13.8 22.8 14.8 20 14.8 C17.2 14.8 15 13.8 15 11 C15 8.6 16.6 5.8 20 1.2 Z" fill="url(#${uid}_fire)"/>
        <!-- Luminous Inner White Core -->
        <path d="M20 6.5 C21.6 8.6 22.4 9.8 22.4 11.2 C22.4 12.6 21.3 13.4 20 13.4 C18.7 13.4 17.6 12.6 17.6 11.2 C17.6 9.8 18.4 8.6 20 6.5 Z" fill="#ffffff" opacity="0.95"/>
      </g>
    </svg>
  `;
}

/**
 * Sacred Rangoli Mandala Corner Watermark (Quadrant)
 * Symmetrical sacred lotus geometry, drawn with mathematical precision.
 * Blends naturally into the deep blue twilight hero background without cluttering text.
 */
const RANGOLI_MANDALA_SVG = `
  <svg viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <g stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" opacity="0.9">
      <!-- Concentric Sacred Circles -->
      <circle cx="0" cy="0" r="28" stroke-width="1.2"/>
      <circle cx="0" cy="0" r="32" stroke-width="0.8" stroke-dasharray="1.5 3"/>
      <circle cx="0" cy="0" r="62" stroke-width="1.2"/>
      <circle cx="0" cy="0" r="66" stroke-width="0.8" stroke-dasharray="2 4"/>
      <circle cx="0" cy="0" r="102" stroke-width="1.1"/>
      <circle cx="0" cy="0" r="126" stroke-width="0.8" stroke-dasharray="2 6"/>

      <!-- Inner Lotus Petals (Layer 1) -->
      <path d="M28 0 Q42 10 62 0 Q42 -10 28 0 Z" stroke-width="1" transform="rotate(12)"/>
      <path d="M28 0 Q42 10 62 0 Q42 -10 28 0 Z" stroke-width="1" transform="rotate(32)"/>
      <path d="M28 0 Q42 10 62 0 Q42 -10 28 0 Z" stroke-width="1" transform="rotate(52)"/>
      <path d="M28 0 Q42 10 62 0 Q42 -10 28 0 Z" stroke-width="1" transform="rotate(72)"/>

      <!-- Outer Lotus Petals (Layer 2) -->
      <path d="M62 0 Q84 14 102 0 Q84 -14 62 0 Z" stroke-width="1" transform="rotate(22)"/>
      <path d="M62 0 Q84 14 102 0 Q84 -14 62 0 Z" stroke-width="1" transform="rotate(42)"/>
      <path d="M62 0 Q84 14 102 0 Q84 -14 62 0 Z" stroke-width="1" transform="rotate(62)"/>
      <path d="M62 0 Q84 14 102 0 Q84 -14 62 0 Z" stroke-width="1" transform="rotate(82)"/>
    </g>
    <!-- Auspicious Diya Pearl Accents -->
    <g fill="currentColor" opacity="0.95">
      <circle cx="112" cy="24" r="2"/>
      <circle cx="95" cy="64" r="2"/>
      <circle cx="64" cy="95" r="2"/>
      <circle cx="24" cy="112" r="2"/>
    </g>
  </svg>
`;

/**
 * Toran Fairy Lights Garland
 * 10 scalloped swags of golden thread wire with warm micro-LED bulbs attached
 * precisely at each curve nadir, twinkling with natural asynchronous rhythm.
 */
function getHeroLightsHTML() {
  const bulbsData = [
    { left: 5, color: "#fef08a", delay: 0 },
    { left: 15, color: "#fde047", delay: 0.6 },
    { left: 25, color: "#f59e0b", delay: 1.3 },
    { left: 35, color: "#fef08a", delay: 0.4 },
    { left: 45, color: "#fb923c", delay: 1.7 },
    { left: 55, color: "#fde047", delay: 0.9 },
    { left: 65, color: "#fef08a", delay: 1.5 },
    { left: 75, color: "#f59e0b", delay: 0.2 },
    { left: 85, color: "#fde047", delay: 1.1 },
    { left: 95, color: "#fb923c", delay: 0.8 },
  ];

  let wireD = "M0,2";
  for (let i = 0; i < 10; i++) {
    const xMid = i * 40 + 20;
    const xEnd = (i + 1) * 40;
    wireD += ` Q${xMid},18 ${xEnd},2`;
  }

  const bulbsHtml = bulbsData
    .map(
      (b) => `
      <span class="cr-dw-bulb-wrap" style="left:${b.left}%;">
        <span class="cr-dw-bulb-cap"></span>
        <span class="cr-dw-bulb" style="animation-delay:${b.delay}s;--cr-dw-bulb-c:${b.color}"></span>
      </span>
    `
    )
    .join("");

  return `
    <div class="cr-dw-lights-container">
      <svg class="cr-dw-wire-svg" viewBox="0 0 400 22" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path d="${wireD}" fill="none" stroke="rgba(253, 224, 71, 0.45)" stroke-width="1.2" vector-effect="non-scaling-stroke"/>
      </svg>
      ${bulbsHtml}
    </div>
  `;
}

/**
 * Elegant Golden Starburst Sparkles (contained within hero)
 */
function getHeroSparklesHTML() {
  const sparkles = [
    { l: 8, t: 32, dur: 7.5, del: 0 },
    { l: 22, t: 68, dur: 9.0, del: 2.2 },
    { l: 42, t: 26, dur: 8.5, del: 1.1 },
    { l: 62, t: 72, dur: 9.5, del: 3.4 },
    { l: 78, t: 30, dur: 8.0, del: 1.8 },
    { l: 92, t: 62, dur: 10.0, del: 0.5 },
  ];

  return sparkles
    .map(
      (s) => `
      <span class="cr-dw-sparkle" style="left:${s.l}%;top:${s.t}%;animation-duration:${s.dur}s;animation-delay:${s.del}s;">
        <svg viewBox="0 0 16 16" fill="currentColor" width="100%" height="100%" aria-hidden="true" focusable="false">
          <path d="M8 0 Q8 8 16 8 Q8 8 8 16 Q8 8 0 8 Q8 8 8 0 Z"/>
        </svg>
      </span>
    `
    )
    .join("");
}

// ============================================================================
// 4. FESTIVAL CSS ENGINE ("Royal Twilight on CampusRide Blue")
// ============================================================================

function buildDiwaliCSS(colors = {}) {
  const gold = colors.gold || "#d97706";
  const goldBright = colors.goldBright || "#f59e0b";
  const goldSoft = colors.goldSoft || "rgba(217, 119, 6, 0.18)";
  const goldBorder = colors.goldBorder || "rgba(217, 119, 6, 0.38)";
  const aura = colors.aura || "rgba(245, 158, 11, 0.22)";

  const darkGold = colors.darkGold || "#fbbf24";
  const darkGoldBright = colors.darkGoldBright || "#fde047";
  const darkGoldSoft = colors.darkGoldSoft || "rgba(251, 191, 36, 0.22)";
  const darkGoldBorder = colors.darkGoldBorder || "rgba(251, 191, 36, 0.42)";
  const darkAura = colors.darkAura || "rgba(251, 191, 36, 0.28)";

  return `
    /* ==========================================================================
       0. FESTIVAL DESIGN TOKENS
       ========================================================================== */
    body.campusride-festival-active {
      --cr-fest-gold: ${gold};
      --cr-fest-gold-bright: ${goldBright};
      --cr-fest-gold-soft: ${goldSoft};
      --cr-fest-gold-border: ${goldBorder};
      --cr-fest-aura: ${aura};
    }

    html.dark body.campusride-festival-active {
      --cr-fest-gold: ${darkGold};
      --cr-fest-gold-bright: ${darkGoldBright};
      --cr-fest-gold-soft: ${darkGoldSoft};
      --cr-fest-gold-border: ${darkGoldBorder};
      --cr-fest-aura: ${darkAura};
    }

    /* ==========================================================================
       1. TOPBAR & DESKTOP ACTIVE TAB DIYA
       ========================================================================== */
    body.campusride-festival-active .topbar {
      border-bottom: 1.5px solid var(--cr-fest-gold-border) !important;
      box-shadow: 0 4px 20px -4px var(--cr-fest-aura) !important;
      transition: border-color 0.25s ease, box-shadow 0.25s ease;
    }

    body.campusride-festival-active .main-nav {
      position: relative !important;
    }

    body.campusride-festival-active .brand-mark {
      box-shadow: 0 0 0 1.5px var(--cr-fest-gold-border), 0 0 14px var(--cr-fest-aura) !important;
      transition: box-shadow 0.25s ease;
    }

    /* Desktop Gliding Diya on Active Tab */
    .cr-dw-tab-diya {
      position: absolute;
      bottom: -13px;
      left: 0;
      width: 28px;
      height: 21px;
      pointer-events: none !important;
      z-index: 50;
      transition: transform 0.42s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.22s ease;
      filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.35));
      will-change: transform, opacity;
    }

    .cr-dw-diya-glow {
      position: absolute;
      left: 3px;
      top: -4px;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(254, 240, 138, 0.65) 0%, rgba(245, 158, 11, 0.3) 50%, transparent 75%);
      animation: crDwFlameGlow 3.2s ease-in-out infinite alternate;
      pointer-events: none;
      will-change: transform, opacity;
    }

    /* ==========================================================================
       2. MOBILE STICKY BOTTOM NAV DIYA
       ========================================================================== */
    body.campusride-festival-active .mobile-bottom-nav {
      border-top: 1.5px solid var(--cr-fest-gold-border) !important;
      box-shadow: 0 -4px 20px -2px var(--cr-fest-aura) !important;
      overflow: visible !important;
    }

    .cr-dw-mobile-diya {
      position: absolute;
      top: -14px;
      left: 0;
      width: 24px;
      height: 18px;
      pointer-events: none !important;
      z-index: 120;
      transition: transform 0.42s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.22s ease;
      filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.4));
      will-change: transform, opacity;
    }

    .cr-dw-mobile-diya .cr-dw-diya-glow {
      width: 18px;
      height: 18px;
      top: -3px;
      left: 3px;
    }

    /* ==========================================================================
       3. FLAME FLICKERING ANIMATION (GPU Transform & Opacity Only)
       ========================================================================== */
    .cr-dw-flame {
      transform-box: fill-box;
      transform-origin: 50% 92%;
      animation: crDwFlameWaver 3.2s ease-in-out infinite;
      will-change: transform, opacity;
    }

    @keyframes crDwFlameWaver {
      0%, 100% { transform: scale(1, 1) rotate(0deg); opacity: 0.98; }
      20% { transform: scale(0.96, 1.05) rotate(-1.2deg); opacity: 0.92; }
      45% { transform: scale(1.03, 0.96) rotate(1deg); opacity: 1; }
      70% { transform: scale(0.98, 1.03) rotate(-0.8deg); opacity: 0.94; }
      85% { transform: scale(1.01, 0.99) rotate(0.6deg); opacity: 0.98; }
    }

    @keyframes crDwFlameGlow {
      0% { opacity: 0.6; transform: scale(0.92); }
      100% { opacity: 1; transform: scale(1.08); }
    }

    /* ==========================================================================
       4. FIND RIDE HERO BANNER (ELEGANT TWILIGHT LIGHTING)
       ========================================================================== */
    body.campusride-festival-active .hero {
      position: relative !important;
      overflow: hidden !important;
      background:
        radial-gradient(ellipse 65% 55% at 85% 15%, rgba(245, 158, 11, 0.26) 0%, transparent 68%),
        radial-gradient(circle at 10% 85%, rgba(30, 64, 175, 0.45) 0%, transparent 55%),
        linear-gradient(135deg, #071330 0%, #0d2568 45%, #1d4ed8 100%) !important;
      border: 1.5px solid var(--cr-fest-gold-border) !important;
      box-shadow: 0 16px 36px -8px rgba(13, 37, 104, 0.45), inset 0 1px 0 rgba(254, 240, 138, 0.4) !important;
    }

    body.campusride-festival-active .hero .eyebrow {
      color: #fde047 !important;
      letter-spacing: 0.09em !important;
      text-shadow: 0 0 12px rgba(245, 158, 11, 0.45);
    }

    body.campusride-festival-active .hero h1 span {
      color: #fef08a !important;
      text-shadow: 0 0 18px rgba(245, 158, 11, 0.55) !important;
    }

    body.campusride-festival-active .stat-pill {
      background: rgba(15, 23, 42, 0.42) !important;
      border: 1px solid rgba(251, 191, 36, 0.3) !important;
      backdrop-filter: blur(8px) !important;
      -webkit-backdrop-filter: blur(8px) !important;
      color: #fef3c7 !important;
    }

    body.campusride-festival-active .stat-pill strong {
      color: #fde047 !important;
    }

    /* Container for all decorative hero effects */
    .cr-dw-hero-fx {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none !important;
      overflow: hidden !important;
      z-index: 1;
    }

    /* Toran Garland & Fairy Lights */
    .cr-dw-lights-container {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 24px;
    }

    .cr-dw-wire-svg {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 24px;
      display: block;
    }

    .cr-dw-bulb-wrap {
      position: absolute;
      top: 6px;
      margin-left: -5px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .cr-dw-bulb-cap {
      width: 4px;
      height: 2px;
      background: #78350f;
      border-radius: 1px;
    }

    .cr-dw-bulb {
      width: 8px;
      height: 10px;
      border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
      background: radial-gradient(circle at 35% 30%, #ffffff 0%, var(--cr-dw-bulb-c, #fde047) 55%, rgba(217, 119, 6, 0.9) 100%);
      box-shadow: 0 0 10px 2px var(--cr-dw-bulb-c, #fde047);
      animation: crDwBulbTwinkle 2.8s ease-in-out infinite alternate;
      will-change: opacity, transform;
    }

    @keyframes crDwBulbTwinkle {
      0% { opacity: 0.65; transform: scale(0.94); }
      100% { opacity: 1; transform: scale(1.06); }
    }

    /* Sacred Rangoli Watermark (Top-Left of Hero) */
    .cr-dw-hero-rangoli {
      position: absolute;
      top: -10px;
      left: -10px;
      width: 150px;
      height: 150px;
      color: #fde047;
      opacity: 0.16;
      pointer-events: none;
    }

    .cr-dw-hero-rangoli svg {
      width: 100%;
      height: 100%;
      display: block;
    }

    /* Floating Starburst Sparkles */
    .cr-dw-sparkle {
      position: absolute;
      width: 12px;
      height: 12px;
      color: #fef08a;
      filter: drop-shadow(0 0 4px rgba(251, 191, 36, 0.8));
      opacity: 0;
      animation: crDwSparkleFloat ease-in-out infinite;
      will-change: transform, opacity;
    }

    @keyframes crDwSparkleFloat {
      0% { opacity: 0; transform: translateY(8px) scale(0.5); }
      50% { opacity: 0.85; transform: translateY(-10px) scale(1); }
      100% { opacity: 0; transform: translateY(-28px) scale(0.4); }
    }

    /* ==========================================================================
       5. RIDE CARDS (SUBTLE GOLD LUXURY ACCENTS)
       ========================================================================== */
    body.campusride-festival-active .ride-card {
      border-top: 2px solid var(--cr-fest-gold-border) !important;
      transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease !important;
    }

    body.campusride-festival-active .ride-card:hover {
      box-shadow: 0 10px 24px -4px rgba(245, 158, 11, 0.16), 0 0 0 1px var(--cr-fest-gold-soft) !important;
    }

    body.campusride-festival-active .vehicle-pill {
      background: #fffbeb !important;
      border: 1px solid rgba(217, 119, 6, 0.3) !important;
      color: #92400e !important;
    }

    html.dark body.campusride-festival-active .vehicle-pill {
      background: rgba(245, 158, 11, 0.14) !important;
      border-color: rgba(251, 191, 36, 0.35) !important;
      color: #fde047 !important;
    }

    /* ==========================================================================
       6. BUTTONS & FORM INPUTS (PRESERVES BLUE IDENTITY)
       ========================================================================== */
    body.campusride-festival-active .button-primary:hover {
      box-shadow: 0 6px 18px rgba(37, 99, 235, 0.4), 0 0 0 2px var(--cr-fest-gold-border) !important;
    }

    body.campusride-festival-active .button-primary:focus-visible {
      outline: 2px solid var(--cr-fest-gold) !important;
      outline-offset: 2px !important;
    }

    body.campusride-festival-active input:focus,
    body.campusride-festival-active select:focus,
    body.campusride-festival-active textarea:focus,
    body.campusride-festival-active .gender-select-trigger:focus-visible {
      border-color: var(--cr-fest-gold) !important;
      box-shadow: 0 0 0 3px var(--cr-fest-gold-soft) !important;
    }

    body.campusride-festival-active .search-filter-card {
      border-color: var(--cr-fest-gold-border) !important;
    }

    /* ==========================================================================
       7. GLOBAL AMBIENT CORNER WATERMARK
       ========================================================================== */
    #${OVERLAY_ID} {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none !important;
      user-select: none !important;
      overflow: hidden;
      z-index: 35;
    }

    .cr-dw-global-rangoli {
      position: absolute;
      top: 0;
      left: 0;
      width: 140px;
      height: 140px;
      color: var(--cr-fest-gold);
      opacity: 0.12;
      pointer-events: none;
    }

    html.dark .cr-dw-global-rangoli {
      opacity: 0.18;
    }

    .cr-dw-global-rangoli svg {
      width: 100%;
      height: 100%;
      display: block;
    }

    /* ==========================================================================
       8. TAB INACTIVITY PERFORMANCE GUARD
       ========================================================================== */
    html.${PAUSED_CLASS} .cr-dw-flame,
    html.${PAUSED_CLASS} .cr-dw-diya-glow,
    html.${PAUSED_CLASS} .cr-dw-bulb,
    html.${PAUSED_CLASS} .cr-dw-sparkle {
      animation-play-state: paused !important;
    }

    /* ==========================================================================
       9. RESPONSIVE DESIGN (TABLETS & PHONES)
       ========================================================================== */
    @media (max-width: 768px) {
      /* Hide fixed corner rangoli on mobile to ensure pristine readability */
      .cr-dw-global-rangoli {
        display: none !important;
      }

      .cr-dw-hero-rangoli {
        width: 100px;
        height: 100px;
        opacity: 0.12;
      }

      /* Scale down sparkles for mobile cleanliness */
      .cr-dw-sparkle:nth-child(n+5) {
        display: none !important;
      }
    }

    @media (max-width: 480px) {
      .cr-dw-mobile-diya {
        top: -12px;
        width: 22px;
        height: 17px;
      }

      .cr-dw-mobile-diya .cr-dw-diya-svg {
        width: 22px !important;
        height: 17px !important;
      }

      /* Thin out fairy lights on small screens to avoid crowding */
      .cr-dw-bulb-wrap:nth-of-type(even) {
        display: none;
      }
    }

    /* ==========================================================================
       10. ACCESSIBILITY: REDUCED MOTION SUPPORT
       ========================================================================== */
    @media (prefers-reduced-motion: reduce) {
      .cr-dw-flame,
      .cr-dw-diya-glow,
      .cr-dw-bulb,
      .cr-dw-sparkle {
        animation: none !important;
      }

      .cr-dw-sparkle {
        display: none !important;
      }

      .cr-dw-tab-diya,
      .cr-dw-mobile-diya {
        transition: none !important;
      }
    }
  `;
}

function buildFestivalCSS(config = {}) {
  return buildDiwaliCSS(config.colors || {});
}

// ============================================================================
// 5. DOM DECORATION ATTACHMENT & TEARDOWN ENGINE
// ============================================================================

let domObserver = null;
let attachRafId = 0;
let visibilityHandler = null;
let resizeHandler = null;

/**
 * 1. Update the position of the gliding Diya marker
 * Desktop: nestled right below the active tab in .main-nav.
 * Mobile: perched above the active tab icon in .mobile-bottom-nav.
 */
function updateMovingNavDiya() {
  // Desktop Topbar Nav
  const mainNav = document.querySelector(".main-nav");
  if (mainNav && window.getComputedStyle(mainNav).display !== "none") {
    const activeLink = mainNav.querySelector(".nav-link.active");
    let diya = mainNav.querySelector(".cr-dw-tab-diya");
    if (!diya) {
      diya = document.createElement("div");
      diya.className = "cr-dw-tab-diya";
      diya.setAttribute("aria-hidden", "true");
      diya.innerHTML = `
        <span class="cr-dw-diya-glow"></span>
        ${getDiyaSVGString(28)}
      `;
      mainNav.appendChild(diya);
    }

    if (activeLink) {
      const left = activeLink.offsetLeft + activeLink.offsetWidth / 2 - 14;
      diya.style.transform = `translateX(${left}px)`;
      diya.style.opacity = "1";
    } else {
      diya.style.opacity = "0";
    }
  }

  // Mobile Bottom Nav
  const mobileNav = document.querySelector(".mobile-bottom-nav");
  if (mobileNav && window.getComputedStyle(mobileNav).display !== "none") {
    const activeItem = mobileNav.querySelector(".bottom-nav-item.active");
    let mobileDiya = mobileNav.querySelector(".cr-dw-mobile-diya");
    if (!mobileDiya) {
      mobileDiya = document.createElement("div");
      mobileDiya.className = "cr-dw-mobile-diya";
      mobileDiya.setAttribute("aria-hidden", "true");
      mobileDiya.innerHTML = `
        <span class="cr-dw-diya-glow"></span>
        ${getDiyaSVGString(24, true)}
      `;
      mobileNav.appendChild(mobileDiya);
    }

    if (activeItem) {
      const left = activeItem.offsetLeft + activeItem.offsetWidth / 2 - 12;
      mobileDiya.style.transform = `translateX(${left}px)`;
      mobileDiya.style.opacity = "1";
    } else {
      mobileDiya.style.opacity = "0";
    }
  }
}

/**
 * 2. Attach Hero Banner festive effects (clipped strictly within .hero)
 */
function attachHeroBannerDiwali() {
  const hero = document.querySelector(".find-ride-page .hero, .hero");
  if (!hero) return;

  // Clean up any previously attached hero effects to ensure immediate update
  const existingFx = hero.querySelector(".cr-dw-hero-fx");
  if (existingFx) {
    existingFx.remove();
  }
  hero.querySelectorAll(".cr-dw-hero-diya").forEach((el) => el.remove());

  const fx = document.createElement("div");
  fx.className = "cr-dw-hero-fx";
  fx.setAttribute("aria-hidden", "true");
  fx.innerHTML = `
    <div class="cr-dw-hero-rangoli">${RANGOLI_MANDALA_SVG}</div>
    ${getHeroLightsHTML()}
    ${getHeroSparklesHTML()}
  `;
  hero.appendChild(fx);
}

// ============================================================================
// 6. MASTER CLEANUP & APPLICATION
// ============================================================================

/**
 * Master cleanup function: Restores CampusRide to 100% original vanilla state.
 * Guaranteed zero DOM leaks, zero orphaned listeners, and zero style pollution.
 */
export function cleanupFestivalTheme() {
  if (typeof document === "undefined") return;

  // 1. Disconnect and nullify MutationObserver
  if (domObserver) {
    domObserver.disconnect();
    domObserver = null;
  }

  // 2. Cancel pending AnimationFrame
  if (attachRafId) {
    cancelAnimationFrame(attachRafId);
    attachRafId = 0;
  }

  // 3. Detach visibility handler
  if (visibilityHandler) {
    document.removeEventListener("visibilitychange", visibilityHandler);
    visibilityHandler = null;
  }
  document.documentElement.classList.remove(PAUSED_CLASS);

  // 4. Detach window resize listener
  if (resizeHandler) {
    window.removeEventListener("resize", resizeHandler);
    resizeHandler = null;
  }

  // 5. Remove injected festival styles
  const styleEl = document.getElementById(STYLE_ID);
  if (styleEl) styleEl.remove();

  // 6. Remove global ambient overlay
  const overlayEl = document.getElementById(OVERLAY_ID);
  if (overlayEl) overlayEl.remove();

  // 7. Remove all injected DOM elements
  document.querySelectorAll(".cr-dw-tab-diya").forEach((el) => el.remove());
  document.querySelectorAll(".cr-dw-mobile-diya").forEach((el) => el.remove());
  document.querySelectorAll(".cr-dw-hero-fx, .cr-dw-hero-diya").forEach((el) => el.remove());

  // 8. Remove body and html classes/attributes
  document.body.classList.remove("campusride-festival-active");
  document.documentElement.removeAttribute("data-festival");
}

/**
 * Master apply function: Injects CSS and attaches decorations.
 * Idempotent: Calling multiple times cleans up previous instances first.
 */
export function applyFestivalTheme(config) {
  if (typeof document === "undefined") return;

  cleanupFestivalTheme();

  if (!config || !config.active) return;

  // 1. Inject Dynamic Festive CSS
  const styleEl = document.createElement("style");
  styleEl.id = STYLE_ID;
  styleEl.textContent = buildFestivalCSS(config);
  document.head.appendChild(styleEl);

  // 2. Mark active attributes on DOM root
  document.body.classList.add("campusride-festival-active");
  document.documentElement.setAttribute("data-festival", config.type || "diwali");

  // 3. Inject minimal ambient background overlay (watermark)
  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `<div class="cr-dw-global-rangoli">${RANGOLI_MANDALA_SVG}</div>`;
  document.body.appendChild(overlay);

  // 4. Attach element-specific decorations
  const attachAll = () => {
    if (config.decorations?.navDiya !== false) updateMovingNavDiya();
    if (config.decorations?.heroBannerFestive !== false) attachHeroBannerDiwali();
  };

  attachAll();

  // 5. Efficient Throttled MutationObserver (handles React route and page changes)
  const scheduleAttach = () => {
    if (attachRafId) return;
    attachRafId = requestAnimationFrame(() => {
      attachRafId = 0;
      attachAll();
    });
  };

  domObserver = new MutationObserver((mutations) => {
    // Only schedule if child nodes or relevant navigation classes change
    for (const m of mutations) {
      if (m.type === "childList" || (m.type === "attributes" && m.attributeName === "class")) {
        scheduleAttach();
        break;
      }
    }
  });

  domObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class"]
  });

  // 6. Tab Inactivity Battery Saver
  visibilityHandler = () => {
    document.documentElement.classList.toggle(PAUSED_CLASS, document.hidden);
  };
  document.addEventListener("visibilitychange", visibilityHandler);
  visibilityHandler();

  // 7. Responsive Navigation Alignment on Resize
  resizeHandler = () => {
    if (festivalTheme && festivalTheme.active) {
      scheduleAttach();
    }
  };
  window.addEventListener("resize", resizeHandler, { passive: true });
}

// ============================================================================
// 7. AUTO-BOOT & VITE HMR INTEGRATION
// ============================================================================

if (typeof window !== "undefined") {
  if (typeof window[CLEANUP_KEY] === "function") {
    try {
      window[CLEANUP_KEY]();
    } catch (_) {}
  }
  window[CLEANUP_KEY] = cleanupFestivalTheme;

  const runBoot = () => {
    if (festivalTheme && festivalTheme.active) {
      applyFestivalTheme(festivalTheme);
    } else {
      cleanupFestivalTheme();
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runBoot, { once: true });
  } else {
    runBoot();
  }

  // Vite HMR Support
  if (import.meta && import.meta.hot) {
    import.meta.hot.dispose(() => cleanupFestivalTheme());
    import.meta.hot.accept(() => runBoot());
  }
}
