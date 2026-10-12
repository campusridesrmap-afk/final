import { Search, PlusCircle, Car, User, LogOut, Shield, Bell } from "lucide-react";

export default function Navbar({
  page,
  onNavigate,
  user,
  profile,
  onLogout,
  onOpenProfile,
  isProfileOpen = false,
  pendingRequestsCount = 0,
}) {
  return (
    <>
      {/* Desktop & Tablet Topbar */}
      <header className="topbar">
        <button
          className="brand"
          onClick={() => onNavigate("find")}
          aria-label="CampusRide Home"
        >
          <img src="/cr.jpeg" alt="CampusRide" className="brand-mark" />
          <div className="brand-copy">
            <strong>CampusRide</strong>
            <small>SRM University-AP Carpooling</small>
          </div>
        </button>

        <nav className="main-nav">
          <button
            className={`nav-link ${page === "find" ? "active" : ""}`}
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
          {user ? (
            <div className="user-profile-menu">
              <button
                type="button"
                className="user-profile-trigger"
                onClick={onOpenProfile}
                title="Edit profile & contact"
              >
                <div className="user-avatar">
                  {(profile?.full_name || user.email || "U")[0].toUpperCase()}
                </div>
                <div className="user-identity-copy">
                  <strong>{profile?.full_name || user.email.split("@")[0]}</strong>
                  <small>{profile?.registration_number || "SRM Student"}</small>
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
          className={`bottom-nav-item ${page === "find" ? "active" : ""}`}
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
          className={`bottom-nav-item ${isProfileOpen || page === "profile" || (page === "auth" && !user) ? "active" : ""}`}
          onClick={() => {
            if (user) {
              onOpenProfile();
            } else {
              onNavigate("auth");
            }
          }}
        >
          <User size={20} />
          <span>{user ? "Profile" : "Login"}</span>
        </button>
      </nav>
    </>
  );
}
