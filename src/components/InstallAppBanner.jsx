import { useState, useEffect } from "react";
import { Download, X } from "lucide-react";
import { CAMPUS_RIDE_LOGO } from "../assets/logo";

export default function InstallAppBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // 1. If already installed in standalone mode, don't show
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true ||
      document.referrer.includes("android-app://");

    if (isStandalone) return;

    // 2. Check if user dismissed recently (allow manual re-check if needed)
    const dismissedUntil = localStorage.getItem("campusride_install_dismissed_until");
    if (dismissedUntil && Number(dismissedUntil) > Date.now()) {
      return;
    }

    // Always show banner after initial mount so user sees the install option immediately!
    setIsVisible(true);

    // 3. Listen for browser's native beforeinstallprompt
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    const handleAppInstalled = () => {
      setIsVisible(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    // If native prompt is primed, trigger Chrome's official install dialog directly!
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setIsVisible(false);
      }
      setDeferredPrompt(null);
      return;
    }

    // Fallback if browser hasn't fired beforeinstallprompt yet (or iOS Safari)
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(userAgent);

    if (isIOS) {
      alert("To install on iPhone:\nTap the Share button (bottom of Safari) and select 'Add to Home Screen'.");
    } else {
      alert("To install CampusRide:\nTap the 3 dots (⋮) in Chrome and select 'Install app' or 'Add to Home screen'.");
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem(
      "campusride_install_dismissed_until",
      String(Date.now() + 24 * 60 * 60 * 1000)
    );
  };

  if (!isVisible) return null;

  return (
    <aside className="install-app-banner" role="region" aria-label="Install CampusRide App">
      <div className="install-banner-content">
        <img
          src={CAMPUS_RIDE_LOGO}
          alt="CampusRide"
          className="install-banner-icon"
          width="38"
          height="38"
        />
        <div className="install-banner-text">
          <strong>Install CampusRide</strong>
          <span>Get app for instant ride booking</span>
        </div>
      </div>

      <div className="install-banner-actions">
        <button
          type="button"
          className="install-action-btn"
          onClick={handleInstallClick}
          aria-label="Install CampusRide App"
        >
          <Download size={15} />
          <span>Install</span>
        </button>
        <button
          type="button"
          className="install-dismiss-btn"
          onClick={handleDismiss}
          aria-label="Dismiss banner"
        >
          <X size={16} />
        </button>
      </div>
    </aside>
  );
}
