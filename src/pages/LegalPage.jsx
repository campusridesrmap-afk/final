import { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { LEGAL_DOCS } from "../data/legalContent";

export default function LegalPage({ onNavigate }) {
  const [activeTab, setActiveTab] = useState("privacy"); // "privacy" | "dataUsage" | "terms"

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  function handleTabChange(tabKey) {
    setActiveTab(tabKey);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderBody(body) {
    if (!body) return null;
    if (typeof body === "string") {
      return <p className="legal-p">{body}</p>;
    }
    if (Array.isArray(body)) {
      if (body.length > 0 && typeof body[0] === "string") {
        return (
          <ul className="legal-bullets">
            {body.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        );
      }
      return body.map((item, idx) => {
        if (item.p) {
          return (
            <p key={idx} className="legal-p">
              {item.p}
            </p>
          );
        }
        if (item.ul) {
          return (
            <ul key={idx} className="legal-bullets">
              {item.ul.map((li, lIdx) => (
                <li key={lIdx}>{li}</li>
              ))}
            </ul>
          );
        }
        if (item.ol) {
          return (
            <ol key={idx} className="legal-numbered">
              {item.ol.map((li, lIdx) => (
                <li key={lIdx}>{li}</li>
              ))}
            </ol>
          );
        }
        return null;
      });
    }
    return null;
  }

  return (
    <div className="legal-page-container">
      {/* Top Breadcrumb & Back Action */}
      <div className="legal-top-nav">
        <button
          type="button"
          className="legal-back-btn"
          onClick={(e) => {
            e.preventDefault();
            if (onNavigate) {
              onNavigate("find");
            } else {
              window.location.hash = "find";
            }
          }}
        >
          <ArrowLeft size={16} />
          <span>Back to CampusRide</span>
        </button>
      </div>

      {/* Header */}
      <div className="legal-hero-header">
        <h1 className="legal-page-title">Legal & Policies</h1>
        <p className="legal-page-subtitle">
          Official platform guidelines, data governance, and user terms of service for the SRM University-AP campus community.
        </p>

        {/* Clean Document Tabs */}
        <div className="legal-tabs-bar" role="tablist">
          <button
            type="button"
            className={`legal-tab-pill ${activeTab === "privacy" ? "active" : ""}`}
            onClick={() => handleTabChange("privacy")}
          >
            Privacy Policy
          </button>
          <button
            type="button"
            className={`legal-tab-pill ${activeTab === "dataUsage" ? "active" : ""}`}
            onClick={() => handleTabChange("dataUsage")}
          >
            Data Usage
          </button>
          <button
            type="button"
            className={`legal-tab-pill ${activeTab === "terms" ? "active" : ""}`}
            onClick={() => handleTabChange("terms")}
          >
            Terms of Service
          </button>
        </div>
      </div>

      {/* Document Content Stack */}
      <div className="legal-documents-stack">
        {/* PRIVACY POLICY */}
        <section
          id="legal-section-privacy"
          className={`legal-doc-card ${activeTab !== "privacy" ? "legal-hidden" : ""}`}
        >
          <div className="legal-doc-header">
            <h2 className="legal-doc-title">{LEGAL_DOCS.privacy.title}</h2>
            <div className="legal-doc-date">Last updated: {LEGAL_DOCS.privacy.updated}</div>
            <p className="legal-doc-intro">{LEGAL_DOCS.privacy.intro}</p>
          </div>

          <div className="legal-doc-content">
            {LEGAL_DOCS.privacy.sections.map((section, idx) => (
              <div key={idx} className="legal-clause-block">
                <h3 className="legal-clause-heading">{section.heading}</h3>
                {renderBody(section.body)}

                {section.subsections && section.subsections.length > 0 && (
                  <div className="legal-subsections-list">
                    {section.subsections.map((sub, sIdx) => (
                      <div key={sIdx} className="legal-subclause-block">
                        <h4 className="legal-subclause-heading">{sub.heading}</h4>
                        {renderBody(sub.body)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* DATA USAGE POLICY */}
        <section
          id="legal-section-dataUsage"
          className={`legal-doc-card ${activeTab !== "dataUsage" ? "legal-hidden" : ""}`}
        >
          <div className="legal-doc-header">
            <h2 className="legal-doc-title">{LEGAL_DOCS.dataUsage.title}</h2>
            <div className="legal-doc-date">Last updated: {LEGAL_DOCS.dataUsage.updated}</div>
            <p className="legal-doc-intro">{LEGAL_DOCS.dataUsage.intro}</p>
          </div>

          <div className="legal-doc-content">
            {LEGAL_DOCS.dataUsage.sections.map((section, idx) => (
              <div key={idx} className="legal-clause-block">
                <h3 className="legal-clause-heading">{section.heading}</h3>
                {renderBody(section.body)}
              </div>
            ))}
          </div>
        </section>

        {/* TERMS OF SERVICE */}
        <section
          id="legal-section-terms"
          className={`legal-doc-card ${activeTab !== "terms" ? "legal-hidden" : ""}`}
        >
          <div className="legal-doc-header">
            <h2 className="legal-doc-title">{LEGAL_DOCS.terms.title}</h2>
            <div className="legal-doc-date">Last updated: {LEGAL_DOCS.terms.updated}</div>
            <p className="legal-doc-intro">{LEGAL_DOCS.terms.intro}</p>
          </div>

          <div className="legal-doc-content">
            {LEGAL_DOCS.terms.sections.map((section, idx) => (
              <div key={idx} className="legal-clause-block">
                <h3 className="legal-clause-heading">{section.heading}</h3>
                {renderBody(section.body)}
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Footer Contact Note */}
      <div className="legal-footer-contact">
        <p>
          Questions regarding platform policies? Contact us at{" "}
          <a href="mailto:campusride.srmap@gmail.com">campusride.srmap@gmail.com</a>.
        </p>
      </div>
    </div>
  );
}
