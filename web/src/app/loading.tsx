/**
 * Shown instantly while the next page loads (header and tab bar stay). Next.js also prefetches
 * this for links on screen, so a tap gives feedback right away instead of waiting for the server.
 */
export default function Loading() {
  return (
    <div className="page-loading" role="status" aria-label="Wird geladen">
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-line" style={{ width: "40%" }} />
      <div className="skeleton-grid">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton skeleton-card" />
        ))}
      </div>
    </div>
  );
}
