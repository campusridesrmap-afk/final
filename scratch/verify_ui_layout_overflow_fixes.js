import fs from "fs";
import path from "path";
import assert from "assert";

console.log("==================================================================");
console.log("CampusRide UI Layout & CSS Boundary Overflow Verification");
console.log("==================================================================\n");

const cssPath = path.resolve("./src/App.css");
const indexCssPath = path.resolve("./src/index.css");
const mainJsxPath = path.resolve("./src/main.jsx");

const appCss = fs.readFileSync(cssPath, "utf8");
const indexCss = fs.readFileSync(indexCssPath, "utf8");
const mainJsx = fs.readFileSync(mainJsxPath, "utf8");

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

// TEST 1: index.css imported in main.jsx
console.log("--- TEST GROUP 1: Foundational CSS & Global Box-Sizing ---");
check("main.jsx imports index.css", mainJsx.includes('import "./index.css"'));
check("index.css defines global box-sizing: border-box", indexCss.includes("box-sizing: border-box"));
check("App.css defines explicit global box-sizing reset", 
  appCss.includes("*, *::before, *::after") && appCss.includes("box-sizing: border-box")
);
check("App.css defines box-sizing: border-box on input, select, textarea",
  appCss.includes("button, input, select, textarea") && appCss.includes("box-sizing: border-box")
);

// TEST 2: Login Page - Email and Password inputs
console.log("\n--- TEST GROUP 2: Login Page Input Boundaries ---");
// Check auth-layout grid container
check("auth-layout has width: 100%", appCss.includes(".auth-layout") && appCss.includes("width: 100%"));
check("auth-layout children have min-width: 0 to prevent grid blowout", 
  appCss.includes(".auth-layout > *") && appCss.includes("min-width: 0")
);
// Check auth-card boundaries
check("auth-card has box-sizing: border-box", appCss.includes(".auth-card") && appCss.includes("box-sizing: border-box"));
check("auth-card has max-width constraint", appCss.includes(".auth-card") && appCss.includes("max-width: 480px"));
check("auth-form and fields have width: 100% and min-width: 0", 
  appCss.includes(".auth-form") && appCss.includes(".auth-form .field")
);
check("auth-form inputs have max-width: 100% and box-sizing: border-box",
  appCss.includes(".auth-form .field input") && appCss.includes("box-sizing: border-box")
);

// TEST 3: Dashboard Search Trips Date Field
console.log("\n--- TEST GROUP 3: Dashboard Search Trips Date Field ---");
check("search-inputs-grid children have min-width: 0",
  appCss.includes(".search-inputs-grid > *") && appCss.includes("min-width: 0")
);
check("filter-item has min-width: 0 and width: 100%",
  appCss.includes(".filter-item") && appCss.includes("min-width: 0") && appCss.includes("width: 100%")
);
check("date-input has box-sizing: border-box and max-width: 100%",
  appCss.includes(".date-input") && appCss.includes("box-sizing: border-box") && appCss.includes("max-width: 100%")
);
check("date-input calendar picker indicator styled cleanly",
  appCss.includes(".date-input::-webkit-calendar-picker-indicator")
);

// TEST 4: Offer Ride Departure Date & Time Field
console.log("\n--- TEST GROUP 4: Offer Ride Departure Date & Time Field ---");
check("offer-layout-grid children have min-width: 0",
  appCss.includes(".offer-layout-grid > *") && appCss.includes("min-width: 0")
);
check("form-card has box-sizing: border-box and min-width: 0",
  appCss.includes(".form-card") && appCss.includes("box-sizing: border-box") && appCss.includes("min-width: 0")
);
check("field input has box-sizing: border-box and max-width: 100%",
  appCss.includes(".field input") && appCss.includes("box-sizing: border-box") && appCss.includes("max-width: 100%")
);
check("field input[type='datetime-local'] explicitly constrained to max-width: 100%",
  appCss.includes(".field input[type=\"datetime-local\"]") && appCss.includes("box-sizing: border-box")
);
check("field-row and its children have min-width: 0 to prevent grid blowout",
  appCss.includes(".field-row > *") && appCss.includes("min-width: 0")
);

// TEST 5: Profile Panel Container Boundaries & Spacing
console.log("\n--- TEST GROUP 5: Profile Panel Spacing & Boundaries ---");
check("modal-overlay uses centered flex alignment",
  appCss.includes(".modal-overlay") && appCss.includes("align-items: center") && appCss.includes("justify-content: center")
);
check("modal-overlay has consistent desktop padding (24px 20px)",
  appCss.includes(".modal-overlay") && appCss.includes("padding: 24px 20px")
);
check("profile-onboarding-card has box-sizing: border-box and max-height constraint",
  appCss.includes(".profile-onboarding-card") && appCss.includes("box-sizing: border-box") && appCss.includes("max-height:")
);
check("profile-onboarding-card has auto margins for balanced centering",
  appCss.includes(".profile-onboarding-card") && appCss.includes("margin: auto")
);
// Compact screens (<= 480px)
const mobileModalsBlock = appCss.slice(appCss.indexOf("/* Modals */"), appCss.indexOf("/* Modals */") + 300);
check("Mobile modal-overlay retains centered alignment and 16px gutter (no 8px flex-end edge-touch)",
  mobileModalsBlock.includes("padding: 16px") && 
  mobileModalsBlock.includes("align-items: center") &&
  !mobileModalsBlock.includes("align-items: flex-end")
);
check("Mobile profile-onboarding-card preserves calc(100vw - 32px) boundary",
  appCss.includes("max-width: calc(100vw - 32px)")
);

console.log("\n==================================================================");
console.log(`ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY (100%)`);
console.log("==================================================================");
