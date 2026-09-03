// The drifting wavy-line background pattern was removed across all apps
// (its CSS in styles/theme.css went too). The tropical leaf backdrop
// (LeafBackdrop.jsx) and everything else in the background system are
// unchanged. This component is kept as an inert no-op so its existing
// import sites (App.jsx / Home.jsx / ListingDetail.jsx) don't need to
// change; `type` is accepted and ignored.
export function AmbientBackground() {
  return null;
}
