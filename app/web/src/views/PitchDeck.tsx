// /pitch-deck — the pitch, as an internal page. Content and structure mirror the
// hackathon deck (pitch/deck.html · continuum-pitch.pages.dev), retold in the app's
// own design system as a scrollable page: what a continuation deal is, why the GP's
// position is a structural conflict, what breaks off-ledger, what the ledger enforces
// instead, the six-step close, what the live demo proves, and who sees what.
//
// PUBLIC and read-only: no session, no ledger reads — App routes here on pathname
// before the auth gate. "Enter the demo" returns to the sign-in at `/`.
import { useEffect, useRef, useState } from 'react';
import logo from '../assets/logo.svg';

const LEGS = [
  { v: '288,000,000', l: 'CV units → buyer' },
  { v: '192,000,000', l: 'CV units → rolling LP' },
  { v: '$288.0M', l: 'USDC → exiting LP' },
  { v: '2×', l: 'old-fund interests burned' },
  { v: '= $480M', l: 'units issued ≡ PSA price · asserted on-ledger', sum: true },
];

const VIEWS = [
  { who: 'GP', sees: 'deal state, proofs', not: 'sealed bids, elections before close' },
  { who: 'Valuer', sees: 'its valuation, anchor hash', not: 'bids, elections' },
  { who: 'LPAC', sees: 'scoped fairness view', not: 'the whole book' },
  { who: 'Buyer', sees: 'its own bid, clearing price', not: 'other bids, elections' },
  { who: 'Exiting LP', sees: 'its election, its cash leg', not: 'other LPs' },
  { who: 'Rolling LP', sees: 'its election, its units', not: 'other LPs' },
];

function Section({ n, tag, title, children }: { n: string; tag?: string; title: string; children: React.ReactNode }) {
  return (
    <section className="pd-section">
      <div className="pd-head">
        <span className="pd-n">{n}</span>
        <h2>{title}</h2>
        {tag ? <span className="pd-tag">{tag}</span> : null}
      </div>
      {children}
    </section>
  );
}

export default function PitchDeck() {
  const logoRef = useRef<HTMLImageElement>(null);
  const [stuck, setStuck] = useState(false);

  // Once the hero wordmark scrolls above the top edge, morph in the sticky bar.
  // IntersectionObserver keeps this off the scroll thread — no jank.
  useEffect(() => {
    const el = logoRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), {
      threshold: 0,
      rootMargin: '-24px 0px 0px 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="pd">
      <div className={`pd-topbar${stuck ? ' is-stuck' : ''}`} aria-hidden={!stuck}>
        <div className="tb-inner">
          <button
            className="tb-logo"
            type="button"
            tabIndex={stuck ? 0 : -1}
            aria-label="Back to top"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <img className="logo" src={logo} alt="Continuum" />
          </button>
          <a className="btn primary tb-cta" href="/" tabIndex={stuck ? 0 : -1}>
            Enter the demo
          </a>
        </div>
      </div>

      <header className="pd-hero">
        <img className="logo" src={logo} alt="Continuum" ref={logoRef} />
        <p className="pd-sub">
          A secure closing room for GP-led continuation deals — LPs and buyers commit privately, the system
          computes the close, and cash plus fund interests settle atomically on Canton.
        </p>
        <div className="actions">
          <a className="btn primary" href="/">
            Enter the demo
          </a>
          <a className="btn" href="https://github.com/kmadorin/continuum-prototype" target="_blank" rel="noopener noreferrer">
            Code on GitHub
          </a>
        </div>
      </header>

      <Section n="01" title="What a continuation deal is" tag="GP-led continuation deal">
        <ol className="pd-facts">
          <li>A fund is ending; one company is still worth holding.</li>
          <li>The GP moves it into a new continuation vehicle.</li>
          <li>Each LP elects: take cash now, or roll into the new fund.</li>
          <li>A secondary buyer provides fresh capital.</li>
        </ol>
      </Section>

      <Section n="02" title="The GP is on both sides" tag="the structural conflict">
        <div className="pd-conflict">
          <div>
            <span className="pd-lab">Sells</span>
            <span className="pd-val">Old fund</span>
          </div>
          <span className="pd-mid">GP ← → </span>
          <div>
            <span className="pd-lab">Manages</span>
            <span className="pd-val">New vehicle</span>
          </div>
        </div>
        <p className="pd-body">
          The process relies on independent checks so the price and terms don't depend on the conflicted
          party: an independent valuer prices the asset, a sealed auction discovers the price, the LPAC
          reviews fairness and consents, and each LP elects privately. Yet all four checks run through a
          process the GP coordinates.
        </p>
      </Section>

      <Section n="03" title="Today, integrity depends on the conflicted party" tag="off-ledger">
        <ul className="pd-rows">
          <li>
            <b>Leakage.</b> Sealed bids and LP elections sit in a data room the GP controls.
          </li>
          <li>
            <b>Partial close.</b> The close is separate wires and signatures; one failed leg leaves the deal
            half-closed.
          </li>
          <li>
            <b>Unverifiable record.</b> The audit trail is reconstructed afterward from emails and PDFs.
          </li>
        </ul>
        <p className="pd-cap">Every check assumes the GP's coordination is neutral.</p>
      </Section>

      <Section n="04" title="The same checks, enforced by the ledger" tag="on Canton">
        <ul className="pd-rows">
          <li>
            <b>Per-party privacy.</b> Each participant is projected only its own slice — by the ledger, not
            the app.
          </li>
          <li>
            <b>One atomic transaction.</b> Units, cash, rolled units, burn: all legs or none.
          </li>
          <li>
            <b>Own keys.</b> Each party signs with its own key — no shared database under the conflicted
            party.
          </li>
          <li>
            <b>Four on-ledger proofs.</b> Valuation, fairness, consent, auction certificate — anyone entitled
            can verify.
          </li>
        </ul>
        <p className="pd-cap">
          Native to Canton: sub-transaction privacy · atomic settlement · selective disclosure · no central
          operator.
        </p>
      </Section>

      <Section n="05" title="One deal, end to end" tag="the system">
        <ol className="pd-steps">
          <li>Open the room — six parties, each with its own key.</li>
          <li>Valuation anchored on-chain.</li>
          <li>Sealed-bid auction, clearing price, certificate.</li>
          <li>LPAC fairness review and consent.</li>
          <li>LP elections — cash or roll.</li>
          <li className="settle">Atomic close — units, cash, rolled interests settle together, or not at all.</li>
        </ol>
        <p className="pd-cap">
          The close requires four on-ledger proofs: <b>valuation · fairness · consent · auction certificate</b>.
        </p>
      </Section>

      <Section n="06" title="Six seats, one atomic close" tag="live on Canton devnet">
        <ol className="pd-facts">
          <li>
            The buyer bids sealed; each LP elects privately. The GP's room reads <b>“2 of 2 responded”</b>{' '}
            while its own ledger projection holds <b>zero</b> bids and <b>zero</b> elections — it counts what
            it cannot read.
          </li>
          <li>
            Four proofs anchor on-ledger — Kroll's valuation, the fairness opinion, LPAC consent, the auction
            certificate. The issuance gate will not mint until all four exist.
          </li>
          <li>
            One <b>Close</b> moves every leg and burns both old-fund interests. The settlement-receipt id is{' '}
            <b>identical in every seat's window</b> — the same on-ledger contract from the same transaction.
          </li>
        </ol>
        <p className="pd-cap">
          Sign in as any seat — gp, buyer, lpExiting, lpRolling, lpac, valuer · password <b>&lt;seat&gt;-demo</b> —
          in as many tabs as you have sides to check.
        </p>
      </Section>

      <Section n="07" title="One transaction, six views" tag="how it works">
        <div className="pd-views">
          {VIEWS.map((v) => (
            <div key={v.who} className="pd-view">
              <span className="pd-val">{v.who}</span>
              <span className="pd-see">
                <b>sees</b> {v.sees}
              </span>
              <span className="pd-see">
                <b>not</b> {v.not}
              </span>
            </div>
          ))}
        </div>
        <div className="pd-legs">
          {LEGS.map((l) => (
            <div key={l.l} className={`pd-leg${l.sum ? ' sum' : ''}`}>
              <span className="pd-leg-v">{l.v}</span>
              <span className="pd-leg-l">{l.l}</span>
            </div>
          ))}
        </div>
        <p className="pd-cap">Visibility is enforced by the ledger, not by the application.</p>
      </Section>

      <Section n="08" title="A general engine for multi-party corporate actions" tag="next steps">
        <ul className="pd-rows">
          <li>
            <b>Fund liquidation.</b> A wind-down settles the same way — assets out, cash to LPs, all or none.
          </li>
          <li>
            <b>NAV fund-finance closes.</b> Multiple lenders commit tranches privately; the drawdown settles
            atomically.
          </li>
          <li>
            <b>Tender offers, block crossings.</b> Sealed offers and private elections, settled in one
            transaction.
          </li>
        </ul>
        <p className="pd-cap">Continuation deals are the wedge; the pattern is the same each time.</p>
      </Section>

      <footer className="pd-foot">
        <div className="actions">
          <a className="btn primary" href="/">
            Enter the demo
          </a>
        </div>
        <span className="pd-cap">Canton 5N devnet · github.com/kmadorin/continuum-prototype</span>
      </footer>
    </div>
  );
}
