import { memo, type CSSProperties } from "react";
export function Icon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <svg className={className} aria-hidden="true">
      <use href={`#${name}`} />
    </svg>
  );
}
export function IconDefinitions() {
  return (
    <svg className="icon-definitions" aria-hidden="true">
      <defs>
        <symbol id="star" viewBox="0 0 24 24">
          <path
            d="M12 1.5 14.8 9.2 22.5 12l-7.7 2.8-2.8 7.7-2.8-7.7L1.5 12l7.7-2.8Z"
            fill="currentColor"
            stroke="none"
          />
        </symbol>
        <symbol id="world" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M3.5 12h17M12 3.5c5 5 5 12 0 17-5-5-5-12 0-17Z" />
        </symbol>
        <symbol id="folder" viewBox="0 0 24 24">
          <path d="M3 7V5h6l2 3h10v11H3V7Z" />
        </symbol>
        <symbol id="settings" viewBox="0 0 24 24">
          <path d="m9.5 3-.6 2.3-2 .9-2.2-.6L2.8 9l1.7 1.6v2.8L2.8 15l1.9 3.4 2.2-.6 2 .9.6 2.3h4.9l.7-2.3 2-.9 2.2.6 1.9-3.4-1.7-1.6v-2.8L21.2 9l-1.9-3.4-2.2.6-2-.9-.7-2.3Z" />
          <circle cx="12" cy="12" r="3" />
        </symbol>
        <symbol id="chevron" viewBox="0 0 24 24">
          <path d="m9 5 7 7-7 7" />
        </symbol>
        <symbol id="arrow" viewBox="0 0 24 24">
          <path d="M5 12h14m-6-6 6 6-6 6" />
        </symbol>
        <symbol id="external" viewBox="0 0 24 24">
          <path d="M14 4h6v6m0-6L10 14M10 4H4v16h16v-6" />
        </symbol>
        <symbol id="close" viewBox="0 0 24 24">
          <path d="m6 6 12 12M6 18 18 6" />
        </symbol>
        <symbol id="check" viewBox="0 0 24 24">
          <path d="m5 12 4 4L19 6" />
        </symbol>
        <symbol id="restart" viewBox="0 0 24 24">
          <path d="M20 7v5h-5M20 12a8 8 0 1 0-2.3 5.7" />
        </symbol>
        <symbol id="play" viewBox="0 0 24 24">
          <path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none" />
        </symbol>
        <symbol id="bag" viewBox="0 0 24 24">
          <path d="M4 8h16l1 13H3L4 8Zm4 0V6a4 4 0 0 1 8 0v2" />
        </symbol>
        <symbol id="search" viewBox="0 0 24 24">
          <circle cx="10" cy="10" r="6" />
          <path d="m15 15 5 5" />
        </symbol>
        <symbol id="photo" viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <circle cx="8" cy="8" r="1.5" />
          <path d="m3 17 5-5 4 4 4-6 5 7" />
        </symbol>
        <symbol id="moon" viewBox="0 0 24 24">
          <path d="M20 14A8.5 8.5 0 0 1 10 3a9 9 0 1 0 10 11Z" />
        </symbol>
        <symbol id="lock" viewBox="0 0 24 24">
          <rect x="5" y="10" width="14" height="11" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3m4 6v2" />
        </symbol>
        <symbol id="youtube" viewBox="0 0 24 24">
          <path
            fill="currentColor"
            stroke="none"
            d="M21.58 7.19a2.72 2.72 0 0 0-1.91-1.93C17.98 4.8 12 4.8 12 4.8s-5.98 0-7.67.46a2.72 2.72 0 0 0-1.91 1.93A28.44 28.44 0 0 0 2 12a28.44 28.44 0 0 0 .42 4.81 2.72 2.72 0 0 0 1.91 1.93c1.69.46 7.67.46 7.67.46s5.98 0 7.67-.46a2.72 2.72 0 0 0 1.91-1.93A28.44 28.44 0 0 0 22 12a28.44 28.44 0 0 0-.42-4.81ZM10 15.28V8.72L15.5 12 10 15.28Z"
          />
        </symbol>
        <symbol id="tiktok" viewBox="0 0 24 24">
          <path
            fill="currentColor"
            stroke="none"
            d="M16.6 3c.28 2.36 1.6 3.76 3.9 3.92v3.02a6.85 6.85 0 0 1-3.82-1.16v5.76c0 3.03-2.1 5.46-5.38 5.46-3.1 0-5.3-2.1-5.3-4.92 0-3.05 2.44-5.16 5.84-4.88v3.1c-1.55-.25-2.62.45-2.62 1.68 0 1.05.86 1.8 2.02 1.8 1.3 0 2.15-.82 2.15-2.48V3h3.21Z"
          />
        </symbol>
        <symbol id="discord" viewBox="0 0 24 24">
          <path
            fill="currentColor"
            stroke="none"
            d="M19.1 5.15A16.2 16.2 0 0 0 15.05 4l-.2.38c1.43.34 2.1.82 2.1.82a13.3 13.3 0 0 0-9.9 0s.67-.48 2.1-.82L8.95 4A16.2 16.2 0 0 0 4.9 5.15C2.33 9 1.64 12.74 2 16.43A16.42 16.42 0 0 0 6.98 19s.6-.72 1.08-1.35a6.97 6.97 0 0 1-1.7-.82l.4-.3c3.28 1.5 6.84 1.5 10.08 0l.4.3c-.55.36-1.12.64-1.7.82.48.63 1.08 1.35 1.08 1.35A16.42 16.42 0 0 0 22 16.43c.42-4.28-.7-7.98-2.9-11.28ZM8.85 14.2c-.98 0-1.79-.9-1.79-2s.79-2 1.79-2c.99 0 1.8.9 1.79 2 0 1.1-.8 2-1.79 2Zm6.3 0c-.98 0-1.79-.9-1.79-2s.79-2 1.79-2c.99 0 1.8.9 1.79 2 0 1.1-.8 2-1.79 2Z"
          />
        </symbol>
        <symbol id="microsoft" viewBox="0 0 24 24">
          <path
            d="M2 2h9v9H2zM13 2h9v9h-9zM2 13h9v9H2zM13 13h9v9h-9z"
            fill="currentColor"
            stroke="none"
          />
        </symbol>
      </defs>
    </svg>
  );
}
const particles = Array.from({ length: 100 }, (_, i) => {
  const spark = i % 3 === 0,
    time = spark ? 18 + (i % 9) : 30 + (i % 13);
  const size = spark ? 8 + (i % 5) * 2.5 : i % 2 ? 1.5 : 2.2;
  return {
    spark,
    style: {
      left: `${(i * 43.73 + 5) % 100}%`,
      top: "110%",
      width: size,
      height: size,
      "--static-top": `${(i * 29.37 + 3) % 100}%`,
      "--travel-x": spark ? "45px" : "-22px",
      "--travel-time": `${time}s`,
      "--travel-delay": `-${(i * 7.13) % time}s`,
      "--shimmer-time": `${3 + (i % 6)}s`,
      "--shimmer-delay": `-${i % 8}s`,
      "--star-dim": spark ? 0.34 : 0.2,
      "--star-bright": spark ? 0.8 : 0.52,
    } as CSSProperties,
  };
});
export const Starfield = memo(function Starfield() {
  return (
    <>
      <div className="entry-atmosphere" aria-hidden="true">
        <div className="entry-light entry-light-one" />
        <div className="entry-light entry-light-two" />
      </div>
      <div id="entry-stars" className="stars" aria-hidden="true">
        {particles.map((p, i) => (
          <span
            key={i}
            className={`entry-particle ${p.spark ? "is-spark" : "is-far"}`}
            style={p.style}
          >
            <i>
              {p.spark && (
                <svg viewBox="0 0 24 24">
                  <path
                    d="M12 0c.62 7.52 4.48 11.38 12 12-7.52.62-11.38 4.48-12 12C11.38 16.48 7.52 12.62 0 12 7.52 11.38 11.38 7.52 12 0Z"
                    fill="currentColor"
                    stroke="none"
                  />
                </svg>
              )}
            </i>
          </span>
        ))}
      </div>
      <div className="entry-meteors" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </>
  );
});
