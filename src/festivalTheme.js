/**
 * CAMPUSRIDE — SINGLE FILE FESTIVAL THEME SYSTEM
 * File: src/festivalTheme.js
 *
 * TRENDING HALLOWEEN THEME (MOBILE-OPTIMIZED & ELEMENT-REACTIVE):
 * 1. NAVBAR TABS (.main-nav & .mobile-bottom-nav):
 *    - Evil-grin glowing Jack-o'-lantern (trending sinister style with flickering inner flame)
 *    - Smoothly glides & perches directly on the active tab option ("Find", "Offer", "Trips", "Profile")!
 *    - Custom-tuned for mobile bottom navigation with zero layout shift.
 * 2. DASHBOARD FIND RIDE HERO BANNER (.find-ride-page .hero):
 *    - Trending Jack-o'-lantern centerpiece with sinister glowing eyes & candlelight halo.
 *    - Animated flapping flying bats strictly INSIDE the hero banner only! (Zero page leakage)
 *    - Deep atmospheric midnight-violet and glowing pumpkin rim lighting.
 * 3. RIDE CARDS (.ride-card):
 *    - Pumpkin orange top border, trending mini pumpkin badge, and warm ember hover glow.
 * 4. BUTTONS & INPUTS:
 *    - Fiery pumpkin orange gradient buttons and glowing focus rings.
 *
 * TO ACTIVATE:
 *   const festivalTheme = { active: true, name: "Halloween", type: "halloween", ... };
 *
 * TO DEACTIVATE (100% NORMAL CAMPUSRIDE):
 *   const festivalTheme = null;
 */

// ============================================================================
// 1. FESTIVAL THEME CONFIGURATION
// ============================================================================

const festivalTheme = {
  active: true,
  name: "Halloween",
  type: "halloween",
  colors: {
    primary: "#ea6a12",       // Pumpkin Orange
    primaryHover: "#c85608",
    primaryLight: "#fff4ea",
    primaryBorder: "#fcd3ae",
    night: "#0b0314",         // Deep Spooky Midnight
    violet: "#240c42",
    violetBright: "#7c3aed",
    aura: "rgba(234, 106, 18, 0.28)"
  },
  decorations: {
    trendingNavPumpkin: true,       // Sinister Jack-o'-lantern gliding under/over active tab
    heroBannerBatsOnly: true,       // Fluttering bats strictly inside Find page hero banner
    heroBannerTrendingPumpkin: true,// Sinister glowing pumpkin in hero banner
    cardFestiveAccents: true,       // Pumpkin orange top border & corner badge
    headingAccents: true            // Spooky accents on headings
  },
  animations: true
};

export default festivalTheme;

// ============================================================================
// 2. IDENTIFIERS & CONSTANTS
// ============================================================================

const STYLE_ID = "campusride-festival-theme-styles";
const OVERLAY_ID = "campusride-festival-decorations";
const CLEANUP_KEY = "__campusRideFestivalCleanup__";

// ============================================================================
// 3. SVG DEFINITIONS (Trending Sinister Jack-o'-lantern, Flapping Banner Bat, Corner Web)
// ============================================================================

/**
 * TRENDING JACK-O'-LANTERN SVG
 * Features:
 * - Sinister sharply angled evil eyes
 * - Wicked jagged sawtooth fangs grin
 * - Inner glowing flame that pulses/flickers like real candlelight
 * - 3D shaded pumpkin body with deep roasted ribs and curved vine stem
 */
function getTrendingPumpkinSVGString(size = 32) {
  const h = Math.round((size * 32) / 38);
  const uniqueId = `crTrend_${Math.random().toString(36).substr(2, 6)}`;

  return `
    <svg class="cr-trend-pumpkin-svg" width="${size}" height="${h}" viewBox="0 0 38 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <defs>
        <!-- 3D Shaded Roasted Pumpkin Orange -->
        <radialGradient id="${uniqueId}_body" cx="50%" cy="30%" r="75%">
          <stop offset="0%" stop-color="#ff7a1a"/>
          <stop offset="60%" stop-color="#e05304"/>
          <stop offset="100%" stop-color="#802000"/>
        </radialGradient>
        <!-- Inner Candlelight Flame -->
        <radialGradient id="${uniqueId}_fire" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="25%" stop-color="#fff59d"/>
          <stop offset="65%" stop-color="#ff9100"/>
          <stop offset="100%" stop-color="#ff3d00"/>
        </radialGradient>
        <!-- Vine Stem -->
        <linearGradient id="${uniqueId}_stem" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#4d7c0f"/>
          <stop offset="100%" stop-color="#1e3a10"/>
        </linearGradient>
      </defs>

      <!-- Gnarled Vine Stem & Curly Tendril -->
      <path d="M19 5.5 C18.5 2 22 0.8 24 1.5 C22.5 3.5 21 4.5 20.5 6 Z" fill="url(#${uniqueId}_stem)"/>
      <path d="M22 3.2 Q25.5 1.8 25 5 Q26.5 3.8 27.5 5.5" stroke="#65a30d" stroke-width="0.9" fill="none" stroke-linecap="round"/>

      <!-- Pumpkin Ribs & 3D Depth Silhouette -->
      <ellipse cx="19" cy="18.5" rx="16.5" ry="12" fill="url(#${uniqueId}_body)"/>
      <ellipse cx="12" cy="18.5" rx="10.5" ry="11.4" fill="#cf4300" opacity="0.6"/>
      <ellipse cx="26" cy="18.5" rx="10.5" ry="11.4" fill="#cf4300" opacity="0.6"/>
      <ellipse cx="19" cy="18.8" rx="6.5" ry="11.8" fill="url(#${uniqueId}_body)"/>

      <!-- Sinister Slanted Triangle Eyes (Aggressive Trend Glare) -->
      <polygon points="10.5,13.8 17,16.5 12,18.2" fill="url(#${uniqueId}_fire)" class="cr-trend-fire"/>
      <polygon points="27.5,13.8 21,16.5 26,18.2" fill="url(#${uniqueId}_fire)" class="cr-trend-fire"/>

      <!-- Carved Inverted Triangle Nose -->
      <polygon points="19,16.8 20.8,19.8 17.2,19.8" fill="url(#${uniqueId}_fire)" class="cr-trend-fire"/>

      <!-- Wicked Jagged Sawtooth Grin (Trending Jack-o'-Lantern) -->
      <path d="M9 21.5 Q19 31.5 29 21.5 C26.8 24 25.2 22.8 24.2 24.5 L22.4 22.2 L20.8 25.4 L19 22.2 L17.2 25.4 L15.6 22.2 L13.8 24.5 C12.8 22.8 11.2 24 9 21.5 Z" fill="url(#${uniqueId}_fire)" class="cr-trend-fire"/>
    </svg>
  `;
}

/**
 * ANIMATED FLAPPING BANNER BAT SVG
 * Fluttering bat with distinct wings and glowing orange slit eyes
 */
function getBannerBatSVGString(size = 30) {
  const h = Math.round((size * 18) / 36);
  return `
    <svg class="cr-banner-bat-svg" width="${size}" height="${h}" viewBox="0 0 36 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <!-- Bat Wings & Body -->
      <path d="M18 10 C16.5 7 13 3.5 8 3.5 C3 3.5 0.5 7 0 9 C3 8.5 6 10 8.5 12 C11 14 13 14 15.5 11.5 L18 13 L20.5 11.5 C23 14 25 14 27.5 12 C30 10 33 8.5 36 9 C35.5 7 33 3.5 28 3.5 C23 3.5 19.5 7 18 10 Z" fill="#1b082e"/>
      <!-- Bat Head & Spooky Ears -->
      <circle cx="18" cy="7.5" r="2.8" fill="#240c42"/>
      <polygon points="16,5.5 17,2.5 17.8,5.5" fill="#3b1263"/>
      <polygon points="20,5.5 19,2.5 18.2,5.5" fill="#3b1263"/>
      <!-- Glowing Orange Eyes -->
      <circle cx="17.2" cy="7.2" r="0.65" fill="#ff7a00"/>
      <circle cx="18.8" cy="7.2" r="0.65" fill="#ff7a00"/>
    </svg>
  `;
}

// Subtle corner spider-web SVG
const CORNER_WEB_SVG = `
  <svg viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <g stroke="#7c3aed" stroke-width="1.2" stroke-opacity="0.22" stroke-linecap="round">
      <path d="M0,0 L140,0 M0,0 L0,140 M0,0 L110,110 M0,0 L140,50 M0,0 L50,140 M0,0 L140,20 M0,0 L20,140"/>
      <path d="M30,0 Q26,26 0,30 M55,0 Q46,46 0,55 M85,0 Q72,72 0,85 M115,0 Q98,98 0,115"/>
    </g>
  </svg>
`;

// ============================================================================
// 4. ELEMENT-REACTIVE CSS (Mobile Optimized & Banner Focused)
// ============================================================================

function buildFestivalCSS(colors = {}) {
  const p = colors.primary || "#ea6a12";
  const pHover = colors.primaryHover || "#c85608";
  const pLight = colors.primaryLight || "#fff4ea";
  const pBorder = colors.primaryBorder || "#fcd3ae";
  const aura = colors.aura || "rgba(234, 106, 18, 0.28)";

  return `
    :root {
      --fest-primary: ${p};
      --fest-primary-hover: ${pHover};
      --fest-primary-light: ${pLight};
      --fest-primary-border: ${pBorder};
      --fest-aura: ${aura};
    }

    body.campusride-festival-active {
      --blue: ${p} !important;
      --blue-hover: ${pHover} !important;
      --blue-soft: ${pLight} !important;
      --border-blue: ${pBorder} !important;
    }

    /* --------------------------------------------------------------------------
       1. NAVBARS & ACTIVE TAB TRENDING PUMPKIN (DESKTOP & MOBILE)
       -------------------------------------------------------------------------- */
    body.campusride-festival-active .topbar {
      border-bottom: 2px solid ${p} !important;
      box-shadow: 0 4px 20px ${aura} !important;
    }

    .main-nav {
      position: relative !important;
    }

    /* Desktop Tab Gliding Trending Pumpkin */
    .cr-active-tab-pumpkin {
      position: absolute;
      bottom: -15px;
      left: 0;
      width: 32px;
      height: 27px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      pointer-events: none !important;
      z-index: 60;
      transition: transform 0.38s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease;
      filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.45));
    }

    /* Mobile Bottom Navigation Bar (Primary Mobile Focus) */
    body.campusride-festival-active .mobile-bottom-nav {
      border-top: 2.5px solid ${p} !important;
      box-shadow: 0 -4px 24px ${aura} !important;
      background: rgba(255, 252, 248, 0.98) !important;
      overflow: visible !important;
      position: fixed !important;
      bottom: 0 !important;
      left: 0 !important;
      right: 0 !important;
    }

    html.dark body.campusride-festival-active .mobile-bottom-nav {
      background: rgba(11, 17, 32, 0.96) !important;
    }

    html.dark body.campusride-festival-active .topbar {
      background: rgba(11, 17, 32, 0.94) !important;
    }

    html.dark body.campusride-festival-active .vehicle-pill {
      background: rgba(234, 106, 18, 0.16) !important;
      border-color: rgba(234, 106, 18, 0.4) !important;
      color: #fdba74 !important;
    }

    /* Mobile Tab Gliding Trending Pumpkin (Perched right over active tab) */
    .cr-mobile-tab-pumpkin {
      position: absolute;
      top: -15px;
      left: 0;
      width: 28px;
      height: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      pointer-events: none !important;
      z-index: 120;
      transition: transform 0.38s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease;
      filter: drop-shadow(0 2px 7px rgba(0, 0, 0, 0.5));
    }

    /* Glow aura beneath the moving pumpkins */
    .cr-tab-pumpkin-glow {
      position: absolute;
      bottom: -2px;
      left: 50%;
      transform: translateX(-50%);
      width: 22px;
      height: 6px;
      border-radius: 50%;
      background: radial-gradient(ellipse at center, #ff7a00 0%, rgba(255, 122, 0, 0) 75%);
      animation: crPulseGlow 1.8s ease-in-out infinite alternate;
      pointer-events: none;
    }

    /* Active Nav link & bottom item text */
    body.campusride-festival-active .nav-link.active {
      color: ${p} !important;
      background: ${pLight} !important;
      font-weight: 700 !important;
    }

    body.campusride-festival-active .bottom-nav-item.active {
      color: ${p} !important;
      font-weight: 700 !important;
    }

    body.campusride-festival-active .bottom-nav-item.active svg {
      stroke: ${p} !important;
      filter: drop-shadow(0 0 6px ${aura});
    }

    /* Brand mark Halloween glow */
    body.campusride-festival-active .brand-mark {
      box-shadow: 0 0 0 2px ${p}, 0 0 16px ${aura} !important;
    }

    /* --------------------------------------------------------------------------
       2. STARTING DASHBOARD HERO BANNER (FIND RIDE PAGE EXCLUSIVE)
       -------------------------------------------------------------------------- */
    body.campusride-festival-active .find-ride-page .hero,
    body.campusride-festival-active .hero {
      position: relative !important;
      overflow: hidden !important;
      /* Deep spooky midnight-to-pumpkin gradient */
      background: linear-gradient(135deg, #0d041a 0%, #1c0836 40%, #350f52 75%, #a83506 100%) !important;
      border: 1.5px solid rgba(234, 106, 18, 0.45) !important;
      box-shadow: 0 14px 36px rgba(234, 88, 12, 0.28), inset 0 1px 0 rgba(255, 154, 60, 0.3) !important;
    }

    /* Banner headline highlight */
    body.campusride-festival-active .hero h1 span {
      color: #fed7aa !important;
      text-shadow: 0 0 20px rgba(249, 115, 22, 0.6) !important;
    }

    body.campusride-festival-active .hero .eyebrow {
      color: #fdba74 !important;
      letter-spacing: 0.08em !important;
    }

    /* Bats Container: STRICTLY INSIDE HERO BANNER ONLY */
    .cr-hero-bats-container {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none !important;
      overflow: hidden !important;
      z-index: 2;
    }

    /* Fluttering Bats flying across banner */
    .cr-hero-bat {
      position: absolute;
      pointer-events: none !important;
      will-change: transform;
      filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.6));
    }

    .cr-banner-bat-svg {
      animation: crBatFlap 0.32s ease-in-out infinite alternate;
      transform-origin: center center;
    }

    .cr-hero-bat.bat-1 {
      top: 14%;
      left: 0;
      animation: crBannerBatSwoop1 13s cubic-bezier(0.4, 0, 0.2, 1) infinite;
    }

    .cr-hero-bat.bat-2 {
      top: 48%;
      left: 0;
      animation: crBannerBatSwoop2 10s cubic-bezier(0.4, 0, 0.2, 1) infinite -4s;
    }

    .cr-hero-bat.bat-3 {
      top: 24%;
      left: 0;
      animation: crBannerBatSwoop3 15s cubic-bezier(0.4, 0, 0.2, 1) infinite -8s;
    }

    .cr-hero-bat.bat-4 {
      top: 68%;
      left: 0;
      animation: crBannerBatSwoop4 11s cubic-bezier(0.4, 0, 0.2, 1) infinite -6s;
    }

    /* Trending Centerpiece Pumpkin in Hero Banner */
    .cr-hero-corner-pumpkin {
      position: absolute;
      top: 18px;
      right: 22px;
      pointer-events: none !important;
      z-index: 3;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      filter: drop-shadow(0 0 16px rgba(255, 122, 0, 0.95)) drop-shadow(0 4px 10px rgba(0, 0, 0, 0.7));
      animation: crTrendingPumpkinFloat 3.2s ease-in-out infinite alternate;
    }

    .cr-hero-pumpkin-halo {
      position: absolute;
      inset: -8px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(255, 122, 0, 0.4) 0%, rgba(255, 60, 0, 0) 70%);
      animation: crPulseGlow 2s ease-in-out infinite alternate;
    }

    /* --------------------------------------------------------------------------
       3. RIDE CARDS (.ride-card)
       -------------------------------------------------------------------------- */
    body.campusride-festival-active .ride-card {
      position: relative;
      border-top: 3.5px solid ${p} !important;
      transition: all 0.22s ease !important;
      box-shadow: 0 2px 8px -2px rgba(15, 23, 42, 0.06), 0 4px 16px -2px ${aura} !important;
    }

    body.campusride-festival-active .ride-card:hover {
      transform: translateY(-3px) !important;
      border-color: ${p} !important;
      box-shadow: 0 12px 28px -4px rgba(234, 106, 18, 0.25), 0 0 0 1.5px rgba(249, 115, 22, 0.35) !important;
    }

    .cr-card-corner-pumpkin {
      position: absolute;
      top: 12px;
      right: 14px;
      pointer-events: none !important;
      opacity: 0.92;
      filter: drop-shadow(0 0 5px ${p});
      animation: crPulseGlow 3s ease-in-out infinite alternate;
    }

    body.campusride-festival-active .vehicle-pill {
      background: #fff4ea !important;
      border-color: rgba(234, 106, 18, 0.3) !important;
      color: #9a3412 !important;
    }

    /* --------------------------------------------------------------------------
       4. BUTTONS & INPUTS
       -------------------------------------------------------------------------- */
    body.campusride-festival-active .button-primary {
      background: linear-gradient(135deg, #f97316 0%, ${pHover} 100%) !important;
      box-shadow: 0 4px 16px rgba(234, 106, 18, 0.45) !important;
    }

    body.campusride-festival-active .button-primary:hover {
      background: linear-gradient(135deg, #fb923c 0%, ${p} 100%) !important;
      box-shadow: 0 6px 22px rgba(234, 106, 18, 0.6) !important;
    }

    body.campusride-festival-active input:focus,
    body.campusride-festival-active select:focus,
    body.campusride-festival-active textarea:focus,
    body.campusride-festival-active .gender-select-trigger:focus-visible {
      border-color: ${p} !important;
      box-shadow: 0 0 0 3px rgba(234, 106, 18, 0.25) !important;
    }

    body.campusride-festival-active .search-form-card,
    body.campusride-festival-active .route-input-group {
      border-color: rgba(234, 106, 18, 0.25) !important;
    }

    /* --------------------------------------------------------------------------
       5. MINIMAL AMBIENT OVERLAY (Subtle Corner Webs, No Random Screen Bats)
       -------------------------------------------------------------------------- */
    #${OVERLAY_ID} {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none !important;
      user-select: none !important;
      overflow: hidden;
      z-index: 40;
    }

    .cr-corner-web {
      position: absolute;
      top: 0;
      width: 120px;
      height: 120px;
      pointer-events: none;
      opacity: 0.5;
    }

    .cr-corner-web.left {
      left: 0;
    }

    .cr-corner-web.right {
      right: 0;
      transform: scaleX(-1);
    }

    /* --------------------------------------------------------------------------
       6. KEYFRAME ANIMATIONS
       -------------------------------------------------------------------------- */
    /* Candlelight inner flame flicker on trending pumpkin eyes & mouth */
    @keyframes crFlamePulse {
      0%, 100% {
        filter: drop-shadow(0 0 2px #fff) drop-shadow(0 0 7px #ff7a00);
        opacity: 0.95;
      }
      28% {
        filter: drop-shadow(0 0 1px #fff) drop-shadow(0 0 4px #ff5500);
        opacity: 0.82;
      }
      62% {
        filter: drop-shadow(0 0 3px #fff) drop-shadow(0 0 11px #ff9500);
        opacity: 1;
      }
      84% {
        filter: drop-shadow(0 0 2px #fff) drop-shadow(0 0 6px #ff6600);
        opacity: 0.9;
      }
    }

    .cr-trend-fire {
      animation: crFlamePulse 1.6s infinite ease-in-out;
    }

    /* Gentle floating animation for centerpiece pumpkin */
    @keyframes crTrendingPumpkinFloat {
      0% { transform: translateY(0px) rotate(0deg); }
      50% { transform: translateY(-5px) rotate(2deg); }
      100% { transform: translateY(0px) rotate(0deg); }
    }

    @keyframes crPulseGlow {
      0% { opacity: 0.55; transform: scale(0.92); }
      100% { opacity: 0.95; transform: scale(1.08); }
    }

    /* Bat Wing Flapping */
    @keyframes crBatFlap {
      0% { transform: scaleY(1); }
      100% { transform: scaleY(0.42); }
    }

    /* Bat flight trajectories strictly across banner */
    @keyframes crBannerBatSwoop1 {
      0% { transform: translate3d(-40px, 10px, 0) scale(0.8) rotate(-6deg); opacity: 0; }
      12% { opacity: 0.9; }
      50% { transform: translate3d(50vw, 30px, 0) scale(1) rotate(6deg); opacity: 0.95; }
      88% { opacity: 0.9; }
      100% { transform: translate3d(105vw, 15px, 0) scale(0.85) rotate(-4deg); opacity: 0; }
    }

    @keyframes crBannerBatSwoop2 {
      0% { transform: translate3d(-30px, 45px, 0) scale(0.7) rotate(5deg); opacity: 0; }
      15% { opacity: 0.85; }
      50% { transform: translate3d(45vw, 15px, 0) scale(0.85) rotate(-5deg); opacity: 0.9; }
      85% { opacity: 0.85; }
      100% { transform: translate3d(105vw, 55px, 0) scale(0.75) rotate(6deg); opacity: 0; }
    }

    @keyframes crBannerBatSwoop3 {
      0% { transform: translate3d(-50px, 20px, 0) scale(0.9) rotate(-8deg); opacity: 0; }
      12% { opacity: 0.9; }
      55% { transform: translate3d(55vw, 42px, 0) scale(1.05) rotate(8deg); opacity: 0.95; }
      88% { opacity: 0.9; }
      100% { transform: translate3d(105vw, 15px, 0) scale(0.85) rotate(-5deg); opacity: 0; }
    }

    @keyframes crBannerBatSwoop4 {
      0% { transform: translate3d(-35px, 60px, 0) scale(0.65) rotate(4deg); opacity: 0; }
      15% { opacity: 0.75; }
      50% { transform: translate3d(40vw, 25px, 0) scale(0.75) rotate(-4deg); opacity: 0.85; }
      85% { opacity: 0.75; }
      100% { transform: translate3d(105vw, 50px, 0) scale(0.65) rotate(5deg); opacity: 0; }
    }

    /* --------------------------------------------------------------------------
       7. MOBILE SPECIFIC TUNING (max-width: 768px & 480px)
       -------------------------------------------------------------------------- */
    @media (max-width: 768px) {
      .cr-corner-web {
        width: 80px;
        height: 80px;
        opacity: 0.35;
      }

      .cr-corner-web.right {
        display: none;
      }

      /* Compact mobile banner centerpiece */
      .cr-hero-corner-pumpkin {
        top: 12px;
        right: 14px;
        filter: drop-shadow(0 0 12px rgba(255, 122, 0, 0.9));
      }

      .cr-hero-corner-pumpkin svg {
        width: 36px !important;
        height: 30px !important;
      }

      /* Scaled down mobile bats for perfect touch clarity */
      .cr-hero-bat.bat-1 svg { width: 22px !important; }
      .cr-hero-bat.bat-2 svg { width: 26px !important; }
      .cr-hero-bat.bat-3 svg { width: 30px !important; }
      .cr-hero-bat.bat-4 svg { width: 20px !important; }
    }

    @media (max-width: 480px) {
      .cr-mobile-tab-pumpkin {
        top: -14px;
        width: 25px;
        height: 21px;
      }

      .cr-mobile-tab-pumpkin svg {
        width: 25px !important;
        height: 21px !important;
      }

      .cr-hero-corner-pumpkin {
        top: 10px;
        right: 10px;
      }

      .cr-hero-corner-pumpkin svg {
        width: 32px !important;
        height: 27px !important;
      }
    }

    /* --------------------------------------------------------------------------
       8. ACCESSIBILITY REDUCED MOTION
       -------------------------------------------------------------------------- */
    @media (prefers-reduced-motion: reduce) {
      .cr-trend-fire,
      .cr-banner-bat-svg,
      .cr-hero-bat,
      .cr-hero-corner-pumpkin,
      .cr-tab-pumpkin-glow {
        animation: none !important;
        transition: none !important;
      }
    }
  `;
}

// ============================================================================
// 5. DOM DECORATION ATTACHMENT & TEARDOWN
// ============================================================================

let domObserver = null;

// 1. Smoothly glide the trending evil Jack-o'-lantern under/over the active tab
function updateMovingNavPumpkin() {
  // Desktop Topbar Navigation
  const mainNav = document.querySelector(".main-nav");
  if (mainNav) {
    const activeLink = mainNav.querySelector(".nav-link.active");
    let pumpkin = mainNav.querySelector(".cr-active-tab-pumpkin");
    if (!pumpkin) {
      pumpkin = document.createElement("div");
      pumpkin.className = "cr-active-tab-pumpkin";
      pumpkin.setAttribute("aria-hidden", "true");
      pumpkin.innerHTML = `
        <span class="cr-tab-pumpkin-glow"></span>
        ${getTrendingPumpkinSVGString(30)}
      `;
      mainNav.appendChild(pumpkin);
    }

    if (activeLink) {
      const left = activeLink.offsetLeft + activeLink.offsetWidth / 2 - 15;
      pumpkin.style.transform = `translateX(${left}px)`;
      pumpkin.style.opacity = "1";
    } else {
      pumpkin.style.opacity = "0";
    }
  }

  // Mobile Bottom Navigation (Primary Mobile Tab Bar)
  const mobileNav = document.querySelector(".mobile-bottom-nav");
  if (mobileNav) {
    const activeItem = mobileNav.querySelector(".bottom-nav-item.active");
    let mobilePumpkin = mobileNav.querySelector(".cr-mobile-tab-pumpkin");
    if (!mobilePumpkin) {
      mobilePumpkin = document.createElement("div");
      mobilePumpkin.className = "cr-mobile-tab-pumpkin";
      mobilePumpkin.setAttribute("aria-hidden", "true");
      mobilePumpkin.innerHTML = `
        <span class="cr-tab-pumpkin-glow"></span>
        ${getTrendingPumpkinSVGString(26)}
      `;
      mobileNav.appendChild(mobilePumpkin);
    }

    if (activeItem) {
      const left = activeItem.offsetLeft + activeItem.offsetWidth / 2 - 13;
      mobilePumpkin.style.transform = `translateX(${left}px)`;
      mobilePumpkin.style.opacity = "1";
    } else {
      mobilePumpkin.style.opacity = "0";
    }
  }
}

// 2. Attach bats and trending pumpkin STRICTLY to Find page hero banner only!
function attachHeroBannerHalloween() {
  const hero = document.querySelector(".find-ride-page .hero, .hero");
  if (!hero) return;

  // Bats layer strictly inside banner
  let batsContainer = hero.querySelector(".cr-hero-bats-container");
  if (!batsContainer) {
    batsContainer = document.createElement("div");
    batsContainer.className = "cr-hero-bats-container";
    batsContainer.setAttribute("aria-hidden", "true");
    batsContainer.innerHTML = `
      <div class="cr-hero-bat bat-1">${getBannerBatSVGString(26)}</div>
      <div class="cr-hero-bat bat-2">${getBannerBatSVGString(32)}</div>
      <div class="cr-hero-bat bat-3">${getBannerBatSVGString(38)}</div>
      <div class="cr-hero-bat bat-4">${getBannerBatSVGString(22)}</div>
    `;
    hero.appendChild(batsContainer);
  }

  // Trending Jack-o'-lantern Centerpiece in Hero Banner
  let cornerPumpkin = hero.querySelector(".cr-hero-corner-pumpkin");
  if (!cornerPumpkin) {
    cornerPumpkin = document.createElement("div");
    cornerPumpkin.className = "cr-hero-corner-pumpkin";
    cornerPumpkin.setAttribute("aria-hidden", "true");
    cornerPumpkin.innerHTML = `
      <span class="cr-hero-pumpkin-halo"></span>
      ${getTrendingPumpkinSVGString(44)}
    `;
    hero.appendChild(cornerPumpkin);
  }
}

// 3. Attach corner badge to ride cards
function attachCardFestiveAccents() {
  const cards = document.querySelectorAll(".ride-card");
  cards.forEach((card) => {
    if (card.querySelector(".cr-card-corner-pumpkin")) return;
    const cornerPumpkin = document.createElement("span");
    cornerPumpkin.className = "cr-card-corner-pumpkin";
    cornerPumpkin.setAttribute("aria-hidden", "true");
    cornerPumpkin.innerHTML = getTrendingPumpkinSVGString(18);
    card.appendChild(cornerPumpkin);
  });
}

// Master cleanup function: restores CampusRide to 100% original normal state
export function cleanupFestivalTheme() {
  if (typeof document === "undefined") return;

  if (domObserver) {
    domObserver.disconnect();
    domObserver = null;
  }

  const styleEl = document.getElementById(STYLE_ID);
  if (styleEl) styleEl.remove();

  const overlayEl = document.getElementById(OVERLAY_ID);
  if (overlayEl) overlayEl.remove();

  document.querySelectorAll(".cr-active-tab-pumpkin").forEach((el) => el.remove());
  document.querySelectorAll(".cr-mobile-tab-pumpkin").forEach((el) => el.remove());
  document.querySelectorAll(".cr-hero-bats-container").forEach((el) => el.remove());
  document.querySelectorAll(".cr-hero-corner-pumpkin").forEach((el) => el.remove());
  document.querySelectorAll(".cr-card-corner-pumpkin").forEach((el) => el.remove());

  document.body.classList.remove("campusride-festival-active");
  document.documentElement.removeAttribute("data-festival");
}

// Master apply function
export function applyFestivalTheme(config) {
  if (typeof document === "undefined") return;

  cleanupFestivalTheme();

  if (!config || !config.active) return;

  // 1. Inject Dynamic CSS
  const styleEl = document.createElement("style");
  styleEl.id = STYLE_ID;
  styleEl.textContent = buildFestivalCSS(config.colors || {});
  document.head.appendChild(styleEl);

  // 2. Add active class to body
  document.body.classList.add("campusride-festival-active");
  document.documentElement.setAttribute("data-festival", config.type || "halloween");

  // 3. Inject subtle Corner Webs Overlay only (NO screen-wide bats)
  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `
    <div class="cr-corner-web left">${CORNER_WEB_SVG}</div>
    <div class="cr-corner-web right">${CORNER_WEB_SVG}</div>
  `;
  document.body.appendChild(overlay);

  // 4. Attach element-specific decorations
  const attachAll = () => {
    if (config.decorations?.trendingNavPumpkin !== false) updateMovingNavPumpkin();
    if (config.decorations?.heroBannerBatsOnly !== false) attachHeroBannerHalloween();
    if (config.decorations?.cardFestiveAccents !== false) attachCardFestiveAccents();
  };

  attachAll();

  // 5. Observe DOM mutations (React page transitions, route changes)
  domObserver = new MutationObserver(() => {
    attachAll();
  });

  domObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class"]
  });
}

// ============================================================================
// 6. AUTO-BOOT & VITE HMR
// ============================================================================

if (typeof window !== "undefined") {
  if (typeof window[CLEANUP_KEY] === "function") {
    try { window[CLEANUP_KEY](); } catch (_) {}
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

  // Handle resize for pixel-perfect pumpkin alignment on mobile rotation
  window.addEventListener("resize", () => {
    if (festivalTheme && festivalTheme.active) {
      updateMovingNavPumpkin();
    }
  }, { passive: true });

  // Vite HMR
  if (import.meta && import.meta.hot) {
    import.meta.hot.dispose(() => cleanupFestivalTheme());
    import.meta.hot.accept(() => runBoot());
  }
}
