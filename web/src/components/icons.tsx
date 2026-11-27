/** Small line icons (24×24, drawn with currentColor) for icon buttons. Always pair with an aria-label. */

const common = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function ShareIcon() {
  return (
    <svg {...common}>
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" />
    </svg>
  );
}

export function SettingsIcon() {
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg {...common}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function EditIcon() {
  return (
    <svg {...common}>
      <path d="M4 20h4L19 9l-4-4L4 16v4z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}

export function MoreIcon() {
  return (
    <svg {...common} fill="currentColor" stroke="none">
      <circle cx="5" cy="12" r="1.9" />
      <circle cx="12" cy="12" r="1.9" />
      <circle cx="19" cy="12" r="1.9" />
    </svg>
  );
}

export function CartIcon() {
  return (
    <svg {...common}>
      <path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2" />
      <circle cx="9.5" cy="20" r="1.3" />
      <circle cx="17" cy="20" r="1.3" />
    </svg>
  );
}

export function BackIcon() {
  return (
    <svg {...common}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function CalendarPlusIcon() {
  return (
    <svg {...common}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4M12 13v5M9.5 15.5h5" />
    </svg>
  );
}

export function CookIcon() {
  return (
    <svg {...common}>
      <path d="M4 11h16v3a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6v-3z" />
      <path d="M2 11h2M20 11h2M9 7c0-1 1-1.5 1-2.5M13 7c0-1 1-1.5 1-2.5" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg {...common}>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h7a1.5 1.5 0 0 0 1.5-1.5L18 7M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7" />
    </svg>
  );
}

export function ForwardIcon() {
  return (
    <svg {...common}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function ResetIcon() {
  return (
    <svg {...common}>
      <path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.6" />
      <path d="M4 3.5v5.1h5.1" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg {...common}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function PauseIcon() {
  return (
    <svg {...common}>
      <path d="M9 5v14M15 5v14" />
    </svg>
  );
}

export function PlayIcon() {
  return (
    <svg {...common}>
      <path d="M8 5l11 7-11 7z" />
    </svg>
  );
}
