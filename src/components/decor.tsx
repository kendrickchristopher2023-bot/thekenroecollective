/**
 * Decorative SVG flourishes — pure visual, no interactivity.
 * Use `aria-hidden` and `pointer-events-none` so they never interrupt content.
 *
 * Color strategy: use gradient `fill`/`stroke` driven by the brand palette
 * (velvet, gold, paper) plus a soft animated shimmer so the marks feel alive
 * rather than flat.
 */

export function FlourishDivider({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 200 24"
      className={`${className}`}
      fill="none"
    >
      <defs>
        <linearGradient id="flourishLine" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="var(--velvet)" stopOpacity="0" />
          <stop offset="50%" stopColor="var(--velvet)" stopOpacity="0.85" />
          <stop offset="100%" stopColor="var(--velvet)" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="flourishDot" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="var(--gold)" />
          <stop offset="100%" stopColor="var(--velvet)" />
        </radialGradient>
      </defs>
      <path d="M2 12 H78" stroke="url(#flourishLine)" strokeWidth="1.25" />
      <path d="M122 12 H198" stroke="url(#flourishLine)" strokeWidth="1.25" />
      <circle cx="100" cy="12" r="4" fill="url(#flourishDot)" />
      <circle cx="100" cy="12" r="1.4" fill="var(--paper)" />
      <path d="M86 12 l6 -4 v8 z" fill="var(--gold)" />
      <path d="M114 12 l-6 -4 v8 z" fill="var(--gold)" />
    </svg>
  );
}

export function ConfettiBurst({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 240 240"
      className={`pointer-events-none ${className}`}
      fill="none"
    >
      <defs>
        <radialGradient id="confettiGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.45" />
          <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="120" cy="120" r="100" fill="url(#confettiGlow)" />
      <g stroke="var(--velvet)" strokeWidth="1.6" strokeLinecap="round" opacity="0.7">
        <path d="M120 30 v18" />
        <path d="M120 192 v18" />
        <path d="M30 120 h18" />
        <path d="M192 120 h18" />
        <path d="M52 52 l13 13" />
        <path d="M175 175 l13 13" />
        <path d="M52 188 l13 -13" />
        <path d="M175 65 l13 -13" />
      </g>
      <g>
        <circle cx="80" cy="70" r="3" fill="var(--gold)" />
        <circle cx="170" cy="80" r="2.5" fill="var(--velvet)" />
        <circle cx="60" cy="160" r="2.5" fill="var(--velvet)" />
        <circle cx="180" cy="160" r="3" fill="var(--gold)" />
        <rect x="115" y="115" width="10" height="10" rx="2" transform="rotate(20 120 120)" fill="var(--velvet)" />
      </g>
    </svg>
  );
}

export function ChampagneFlute({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 80 160"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <defs>
        <linearGradient id="fluteFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="var(--gold)" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      <path d="M22 12 H58 L52 70 C52 82 28 82 28 70 Z" fill="url(#fluteFill)" />
      <path d="M40 82 V134" />
      <path d="M22 142 H58" />
      <circle cx="36" cy="32" r="1.6" fill="var(--gold)" />
      <circle cx="44" cy="48" r="1.3" fill="var(--gold)" />
      <circle cx="38" cy="58" r="1.1" fill="var(--gold)" />
    </svg>
  );
}

/**
 * Two tall champagne flutes — celebratory, brand-aligned.
 * Tilted inward so the rims gently touch like a clink.
 * Clean, matte illustration style: flat color, no outlines, full stems and bases visible.
 */
export function ClinkingFlutes({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 320 240"
      className={`pointer-events-none ${className}`}
      fill="none"
    >
      <defs>
        <linearGradient id="flute-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#EED69A" />
          <stop offset="100%" stopColor="#D4B483" />
        </linearGradient>
      </defs>

      {/* Left flute — tilted inward */}
      <g style={{ transform: 'rotate(12deg)', transformOrigin: '125px 220px', transformBox: 'fill-box' } as React.CSSProperties}>
        {/* Base */}
        <ellipse cx="125" cy="219" rx="20" ry="3" fill="#A67B5B" />
        {/* Stem */}
        <rect x="124" y="125" width="2" height="94" rx="1" fill="#A67B5B" />
        {/* Bowl */}
        <path
          d="M105 24 Q105 20 110 20 H140 Q145 20 145 24 L138 120 Q136 126 125 126 Q114 126 112 120 Z"
          fill="url(#flute-fill)"
        />
        {/* Bubbles */}
        <circle cx="122" cy="48" r="1.4" fill="#FFFFFF" opacity="0.6" />
        <circle cx="132" cy="64" r="1.1" fill="#FFFFFF" opacity="0.5" />
        <circle cx="120" cy="80" r="0.9" fill="#FFFFFF" opacity="0.45" />
        <circle cx="134" cy="96" r="0.8" fill="#FFFFFF" opacity="0.4" />
      </g>

      {/* Right flute — tilted inward (shifted right so rims touch) */}
      <g style={{ transform: 'rotate(-12deg)', transformOrigin: '235px 220px', transformBox: 'fill-box' } as React.CSSProperties}>
        <ellipse cx="235" cy="219" rx="20" ry="3" fill="#A67B5B" />
        <rect x="234" y="125" width="2" height="94" rx="1" fill="#A67B5B" />
        <path
          d="M215 24 Q215 20 220 20 H250 Q255 20 255 24 L248 120 Q246 126 235 126 Q224 126 222 120 Z"
          fill="url(#flute-fill)"
        />
        <circle cx="232" cy="48" r="1.4" fill="#FFFFFF" opacity="0.6" />
        <circle cx="242" cy="64" r="1.1" fill="#FFFFFF" opacity="0.5" />
        <circle cx="230" cy="80" r="0.9" fill="#FFFFFF" opacity="0.45" />
        <circle cx="244" cy="96" r="0.8" fill="#FFFFFF" opacity="0.4" />
      </g>
    </svg>
  );
}


export function EnvelopeMark({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 80 60"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    >
      <rect x="6" y="10" width="68" height="42" rx="3" fill="var(--gold)" fillOpacity="0.18" />
      <path d="M6 14 L40 36 L74 14" />
      <path d="M40 36 L40 52" opacity="0.4" />
    </svg>
  );
}

export function ArchesMotif({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 400 200"
      className={`pointer-events-none ${className}`}
      fill="none"
    >
      <defs>
        <linearGradient id="archStroke" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.95" />
          <stop offset="100%" stopColor="var(--velvet)" stopOpacity="0.45" />
        </linearGradient>
      </defs>
      <g stroke="url(#archStroke)" strokeWidth="1.4">
        <path d="M20 180 Q20 60 100 60 Q180 60 180 180" />
        <path d="M120 180 Q120 80 180 80 Q240 80 240 180" />
        <path d="M220 180 Q220 60 300 60 Q380 60 380 180" />
      </g>
    </svg>
  );
}

export function GoldenDots({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 200 200" className={`pointer-events-none ${className}`}>
      <defs>
        <pattern id="goldenDots" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.6" fill="var(--gold)" />
          <circle cx="10" cy="10" r="1" fill="var(--velvet)" opacity="0.55" />
        </pattern>
      </defs>
      <rect width="200" height="200" fill="url(#goldenDots)" />
    </svg>
  );
}

/**
 * Soft, slow-shifting color aura — sits behind hero copy to add warmth.
 * Pure CSS gradients, GPU-friendly, no JS.
 */
export function ColorAura({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      <div
        className="absolute -left-24 -top-24 h-[420px] w-[420px] rounded-full opacity-60 blur-3xl animate-aura-drift"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, rgba(212,180,131,0.55), transparent 65%)",
        }}
      />
      <div
        className="absolute -right-24 top-10 h-[460px] w-[460px] rounded-full opacity-50 blur-3xl animate-aura-drift-slow"
        style={{
          background:
            "radial-gradient(circle at 70% 40%, rgba(92,29,29,0.45), transparent 65%)",
        }}
      />
      <div
        className="absolute bottom-0 left-1/3 h-[320px] w-[520px] rounded-full opacity-40 blur-3xl animate-aura-drift"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(212,180,131,0.4), transparent 70%)",
        }}
      />
    </div>
  );
}
