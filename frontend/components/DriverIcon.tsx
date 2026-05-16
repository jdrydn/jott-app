export function DriverIcon({ driver }: { driver: string | undefined }) {
  return (
    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-700/60 bg-slate-800">
      {driver === 'claude' ? (
        <img
          src="/claude-code.png"
          alt=""
          aria-hidden="true"
          className="h-5 w-5"
          style={{ imageRendering: 'pixelated' }}
        />
      ) : (
        <SparkleIcon />
      )}
    </span>
  );
}

function SparkleIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4 text-slate-200"
      aria-hidden="true"
    >
      <path d="M10 2a.75.75 0 0 1 .73.57l.69 2.76 2.76.69a.75.75 0 0 1 0 1.46l-2.76.69-.69 2.76a.75.75 0 0 1-1.46 0l-.69-2.76-2.76-.69a.75.75 0 0 1 0-1.46l2.76-.69.69-2.76A.75.75 0 0 1 10 2Zm5.5 9a.75.75 0 0 1 .73.57l.32 1.28 1.28.32a.75.75 0 0 1 0 1.46l-1.28.32-.32 1.28a.75.75 0 0 1-1.46 0l-.32-1.28-1.28-.32a.75.75 0 0 1 0-1.46l1.28-.32.32-1.28A.75.75 0 0 1 15.5 11Z" />
    </svg>
  );
}
