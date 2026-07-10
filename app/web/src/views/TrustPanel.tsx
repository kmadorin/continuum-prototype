// Task 8 — persistent trust-model footer.
//
// An honest, always-on statement of what the closing room does and does NOT trust:
// the operator never holds a signing key (Canton external-party signing), the
// reverse-proxy only relays signed submissions, and sub-transaction privacy is a
// Daml-signatory guarantee, not a UI trick. Rendered app-wide from App.tsx.
export default function TrustPanel() {
  return (
    <footer className="trust-panel" aria-label="Trust model">
      <span className="view-label">Trust model</span>
      <p className="hint trust-copy">
        Authorization is <b>non-custodial</b>: each role signs with a key held only in its browser (Canton
        external-party signing) — the operator never holds it. The reverse-proxy only relays signed submissions
        and injects a shared operator transport token (standard for a shared devnet validator). Sub-transaction
        privacy (sealed bids, private elections) is enforced by <b>Daml signatories</b>, not the UI. Production:
        per-user OAuth2/wallet auth mapping users → parties.
      </p>
    </footer>
  );
}
