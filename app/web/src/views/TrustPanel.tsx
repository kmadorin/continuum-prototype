// Persistent trust-model footer.
//
// An honest, always-on statement of the custody model: each party is committed
// only by ITS OWN Ed25519 key's signature, verified by Canton itself — the demo
// colocates five custodians in one service, but the protocol is already
// multi-custodian. Sub-transaction privacy is a Daml-signatory guarantee, not a
// UI trick. Rendered app-wide from App.tsx.
export default function TrustPanel() {
  return (
    <footer className="trust-panel" aria-label="Trust model">
      <span className="view-label">Trust model</span>
      <p className="hint trust-copy">
        Authorization is <b>custodial, per-party</b>: each role's <b>qualified custodian</b> holds that party's
        own Ed25519 key and signs on its behalf — the browser holds no key material. Every close still leaves
        five distinct signatures the synchronizer verifies, so no party is committed without its own key
        (Canton external-party signing). The demo colocates five custodians in one service; production moves
        those keys to Fireblocks/Copper/a bank custodian without changing a line of settlement code.
        Sub-transaction privacy (sealed bids, private elections) is enforced by <b>Daml signatories</b>, not
        the UI.
      </p>
    </footer>
  );
}
