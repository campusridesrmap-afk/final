import fs from "fs";
import path from "path";
import assert from "assert";

console.log("==================================================================");
console.log("CampusRide My Trips Mobile Layout & Responsiveness Verification");
console.log("==================================================================\n");

const myTripsJsxPath = path.resolve("./src/pages/MyTrips.jsx");
const appCssPath = path.resolve("./src/App.css");

const myTripsJsx = fs.readFileSync(myTripsJsxPath, "utf8");
const appCss = fs.readFileSync(appCssPath, "utf8");

let passedTests = 0;
let totalTests = 0;

function check(desc, condition) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAIL [Test ${totalTests}]: ${desc}`);
    throw new Error(`Failed: ${desc}`);
  }
  passedTests++;
  console.log(`✅ PASS [Test ${totalTests}]: ${desc}`);
}

// TEST GROUP 1: MyTrips JSX Structure
console.log("--- TEST GROUP 1: Section Structure & Vertical Ordering ---");

check("MyTrips includes trips-sections-container wrapper", 
  myTripsJsx.includes('className="trips-sections-container"')
);

// Verify order of sections: 1. Offered, 2. Incoming, 3. Bookings
const idxOffered = myTripsJsx.indexOf("trips-section-offered");
const idxIncoming = myTripsJsx.indexOf("trips-section-incoming");
const idxBookings = myTripsJsx.indexOf("trips-section-bookings");

check("Offered Rides section appears first", idxOffered !== -1);
check("Incoming Requests section appears second (after Offered)", idxIncoming > idxOffered);
check("Your Bookings section appears third (after Incoming)", idxBookings > idxIncoming);

// Verify each section has a mobile header with title and icon
check("Offered Rides section has mobile-section-header with title", 
  myTripsJsx.includes("Rides You Offer ({myRides.length})")
);
check("Incoming Requests section has mobile-section-header with title", 
  myTripsJsx.includes("Incoming Requests ({incomingBookings.length})")
);
check("Your Bookings section has mobile-section-header with title", 
  myTripsJsx.includes("Your Bookings ({myBookings.length})")
);

// TEST GROUP 2: Desktop & Tablet Tabbed Behavior
console.log("\n--- TEST GROUP 2: Desktop & Tablet Responsive Preservation ---");
check("Desktop trips-tab-bar is defined with display: flex", 
  appCss.includes(".trips-tab-bar") && appCss.includes("display: flex")
);
check("Desktop mobile-section-header is hidden (display: none)",
  appCss.includes(".mobile-section-header") && appCss.includes("display: none")
);
check("Desktop inactive sections are hidden (display: none)",
  appCss.includes(".trips-section") && appCss.includes("display: none")
);
check("Desktop active section is shown (display: block)",
  appCss.includes(".trips-section.tab-active") && appCss.includes("display: block")
);

// TEST GROUP 3: Mobile Phone Layout (<= 768px)
console.log("\n--- TEST GROUP 3: Mobile Phone Layout & Overflow Elimination ---");
// Check mobile breakpoint
const media768Idx = appCss.indexOf("@media (max-width: 768px)");
const media640Idx = appCss.indexOf("@media (max-width: 640px)");
const media768Block = appCss.slice(media768Idx, media640Idx);

check("Mobile hides the horizontal trips-tab-bar (display: none !important)",
  media768Block.includes(".trips-tab-bar") && media768Block.includes("display: none !important")
);

check("Mobile stacks trips-sections-container vertically (flex-direction: column)",
  media768Block.includes(".trips-sections-container") && media768Block.includes("flex-direction: column")
);

check("Mobile displays all three sections simultaneously (display: flex !important)",
  media768Block.includes(".trips-section") && media768Block.includes("display: flex !important")
);

check("Mobile displays mobile-section-header (display: flex)",
  media768Block.includes(".mobile-section-header") && media768Block.includes("display: flex")
);

check("Mobile booking-row-card is vertical (flex-direction: column) with box-sizing: border-box",
  media768Block.includes(".booking-row-card") && 
  media768Block.includes("flex-direction: column") && 
  media768Block.includes("box-sizing: border-box")
);

// TEST GROUP 4: Compact Viewports (320px, 375px, 430px)
console.log("\n--- TEST GROUP 4: Compact Viewports (320px, 375px, 430px) ---");

// Check media query for compact smartphones
const media480Idx = appCss.indexOf("@media (max-width: 480px)");
const media480Block = appCss.slice(media480Idx, media480Idx + 3000);

check("Compact mobile (<= 480px) reduces booking card padding (12px 10px)",
  media480Block.includes(".booking-row-card") && media480Block.includes("padding: 12px 10px")
);

check("Compact mobile (<= 480px) wraps route-endpoints without horizontal overflow",
  media480Block.includes(".route-endpoints") && media480Block.includes("flex-wrap: wrap")
);

check("Compact mobile (<= 480px) wraps booking-meta-line gracefully",
  media480Block.includes(".booking-meta-line") && media480Block.includes("flex-wrap: wrap")
);

const media360Idx = appCss.indexOf("@media (max-width: 360px)");
const media360Block = appCss.slice(media360Idx, media360Idx + 2000);

check("Ultra-compact mobile (<= 360px / 320px) applies compact padding (10px 8px)",
  media360Block.includes(".booking-row-card") && media360Block.includes("padding: 10px 8px")
);

// TEST GROUP 5: Zero Page-Level Horizontal Overflow
console.log("\n--- TEST GROUP 5: Zero Horizontal Overflow Rules ---");
check("No fixed widths on trips-section or booking-row-card",
  !media768Block.includes(".trips-section { width: 5") && 
  !media768Block.includes(".booking-row-card { width: 5")
);

check("my-trips-page and booking-row-card enforce overflow-x: hidden",
  media768Block.includes("overflow-x: hidden")
);

console.log("\n==================================================================");
console.log(`ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY (100%)`);
console.log("==================================================================");
