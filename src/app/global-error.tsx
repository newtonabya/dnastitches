"use client";

/**
 * Last resort when the root layout itself fails: it replaces the whole document, so it
 * carries its own minimal styling in the brand colours.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en-NG">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0e0d0b",
          color: "#f3ede0",
          fontFamily: "Georgia, serif",
          textAlign: "center",
          padding: "1rem",
        }}
      >
        <main>
          <p style={{ color: "#d4af37", letterSpacing: "0.3em", fontSize: 12 }}>DNA STITCHES</p>
          <h1 style={{ fontWeight: 500 }}>Something went wrong</h1>
          <p style={{ opacity: 0.75 }}>Please try again in a moment.</p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 12,
              background: "#d4af37",
              color: "#0e0d0b",
              border: 0,
              borderRadius: 6,
              padding: "10px 18px",
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
