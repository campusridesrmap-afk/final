import { Search, PlusCircle, Car, User, LogOut } from "lucide-react";
import { CAMPUS_RIDE_LOGO } from "../assets/logo";
import ThemeToggle from "./ThemeToggle";

export default function Navbar({
  page,
  onNavigate,
  user,
  authLoading = false,
  profile,
  onLogout,
  onOpenProfile,
  isProfileOpen = false,
  pendingRequestsCount = 0,
}) {
  const isFindOrDashboard = page === "find" || page === "dashboard";

  return (
    <>
      {/* Desktop & Tablet Topbar */}
      <header className="topbar">
        <button
          className="brand"
          onClick={() => onNavigate("find")}
          aria-label="CampusRide Home"
        >
          <img
            src={CAMPUS_RIDE_LOGO}
            alt="CampusRide"
            className="brand-mark"
            width="40"
            height="40"
            loading="eager"
            fetchPriority="high"
            decoding="sync"
          />
          <div className="brand-copy">
            <strong>CampusRide</strong>
            <small>SRM University-AP Carpooling</small>
          </div>
        </button>

        <nav className="main-nav">
          <button
            className={`nav-link ${isFindOrDashboard ? "active" : ""}`}
            onClick={() => onNavigate("find")}
          >
            <Search size={16} />
            <span>Find a Ride</span>
          </button>

          <button
            className={`nav-link ${page === "offer" ? "active" : ""}`}
            onClick={() => onNavigate("offer")}
          >
            <PlusCircle size={16} />
            <span>Offer a Ride</span>
          </button>

          <button
            className={`nav-link ${page === "trips" ? "active" : ""}`}
            onClick={() => onNavigate("trips")}
          >
            <Car size={16} />
            <span>My Trips</span>
            {pendingRequestsCount > 0 && (
              <span className="nav-badge">{pendingRequestsCount}</span>
            )}
          </button>


        </nav>

        <div className="account-area">
          <ThemeToggle />
          {user ? (
            <div className="user-profile-menu">
              <button
                type="button"
                className="user-profile-trigger"
                onClick={onOpenProfile}
                title="Edit profile & contact"
              >
                <div className="user-avatar">
                  {profile?.full_name ? (
                    profile.full_name.trim()[0].toUpperCase()
                  ) : (
                    <User size={16} />
                  )}
                </div>
                <div className="user-identity-copy">
                  {profile?.full_name ? (
                    <>
                      <strong>{profile.full_name}</strong>
                      {profile.registration_number ? (
                        <small>{profile.registration_number}</small>
                      ) : (
                        <small className="user-identity-sub">SRM-AP Member</small>
                      )}
                    </>
                  ) : (
                    <div className="profile-placeholder-box" aria-hidden="true">
                      <span className="profile-placeholder-line profile-placeholder-title"></span>
                      <span className="profile-placeholder-line profile-placeholder-sub"></span>
                    </div>
                  )}
                </div>
              </button>

              <button
                className="button button-outline button-small logout-btn"
                onClick={onLogout}
                title="Log out"
              >
                <LogOut size={14} />
                <span className="hide-on-mobile">Log out</span>
              </button>
            </div>
          ) : authLoading ? (
            <div
              className="auth-loading-pill"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                fontSize: "12px",
                color: "var(--muted)",
                borderRadius: "var(--radius-full)",
              }}
            >
              <span>Restoring session...</span>
            </div>
          ) : (
            <button
              className="button button-primary button-small"
              onClick={() => onNavigate("auth")}
            >
              <User size={15} />
              <span>Log in</span>
            </button>
          )}
        </div>
      </header>

      {/* Mobile Sticky Bottom Navigation Bar */}
      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        <button
          className={`bottom-nav-item ${isFindOrDashboard ? "active" : ""}`}
          onClick={() => onNavigate("find")}
        >
          <Search size={20} />
          <span>Find</span>
        </button>

        <button
          className={`bottom-nav-item ${page === "offer" ? "active" : ""}`}
          onClick={() => onNavigate("offer")}
        >
          <PlusCircle size={20} />
          <span>Offer</span>
        </button>

        <button
          className={`bottom-nav-item ${page === "trips" ? "active" : ""}`}
          onClick={() => onNavigate("trips")}
        >
          <div className="bottom-nav-icon-wrapper">
            <Car size={20} />
            {pendingRequestsCount > 0 && (
              <span className="bottom-nav-badge">{pendingRequestsCount}</span>
            )}
          </div>
          <span>Trips</span>
        </button>



        <button
          className={`bottom-nav-item ${isProfileOpen || page === "profile" || (page === "auth" && !user && !authLoading) ? "active" : ""}`}
          onClick={() => {
            if (user) {
              onOpenProfile();
            } else if (!authLoading) {
              onNavigate("auth");
            }
          }}
        >
          <User size={20} />
          <span>{user ? "Profile" : authLoading ? "Verifying..." : "Login"}</span>
        </button>
      </nav>
    </>
  );
}

