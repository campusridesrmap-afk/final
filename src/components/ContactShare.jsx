import { Phone, MessageCircle, User, ShieldCheck } from "lucide-react";

export default function ContactShare({ profile, role = "Vehicle Sharer", isSharingActive = true }) {
  if (!profile || !isSharingActive) return null;

  const phone = profile.mobile_number || profile.phone;
  const regNo = profile.registration_number;
  const cleanPhone = phone ? phone.replace(/\D/g, "") : "";

  return (
    <div className="contact-share-card">
      <div className="contact-header">
        <ShieldCheck size={16} className="contact-verified-icon" />
        <span>Verified {role} Contact</span>
      </div>

      <div className="contact-details">
        <div className="contact-person">
          <User size={14} />
          <strong>{profile.full_name || "SRM Student"}</strong>
          {regNo && <small className="contact-reg">({regNo})</small>}
        </div>

        {phone ? (
          <div className="contact-actions-row">
            <a
              href={`tel:${phone}`}
              className="contact-btn call-btn"
              title="Call directly"
            >
              <Phone size={14} />
              <span>{phone}</span>
            </a>

            {cleanPhone && (
              <a
                href={`https://wa.me/91${cleanPhone.slice(-10)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="contact-btn whatsapp-btn"
                title="Chat on WhatsApp"
              >
                <MessageCircle size={14} />
                <span>WhatsApp</span>
              </a>
            )}
          </div>
        ) : (
          <div className="contact-empty-hint">
            <span>No phone number shared on profile yet.</span>
          </div>
        )}
      </div>
    </div>
  );
}
