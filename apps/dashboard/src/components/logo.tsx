/** Vibrail brand mark shared by the dashboard sidebar and auth screens. */
export function Logo({ size = 36, className }: { size?: number; className?: string }) {
  // The PWA source asset includes transparent padding. Render it slightly larger
  // inside a fixed-size box so the visible V fills the same space as the old mark.
  const imageSize = Math.round(size * 1.35);

  return (
    <span
      className={`relative block shrink-0 ${className ?? ""}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <img
        src="/android-chrome-512x512.png?v=vibrail-1"
        alt=""
        width={imageSize}
        height={imageSize}
        className="absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2"
      />
    </span>
  );
}
