export interface Theme {
  /** Stable id stored in settings (never rename an existing one). */
  name: string;
  /** Arabic display name. */
  label?: string;
  mode: "light" | "dark";
  primary: string;
  secondary: string;
  background: string;
  paper: string;
  divider: string;
  backgroundImage: string;
  text: {
    primary: string;
    secondary: string;
    disabled: string;
  };
  action: {
    active: string;
    hover: string;
    selected: string;
    disabled: string;
  };
  surface: {
    main: string;
    border: string;
  };
  error: string;
  warning: string;
  info: string;
  success: string;
}

/** Stored theme name meaning "follow the device's light/dark setting". */
export const AUTO_THEME = "Auto";
/** Window event the picker fires to apply a theme without reloading. */
export const THEME_EVENT = "openstore-theme-change";

export const themes: Theme[] = [
  {
    name: "Light Blue",
    label: "أزرق فاتح",
    mode: "light",
    primary: "#1976d2",
    secondary: "#7c4dff",
    background: "#f8faff",
    paper: "#ffffff",
    divider: "rgba(0, 0, 0, 0.12)",
    backgroundImage:
      "linear-gradient(135deg, #f8faff 0%, #e3f2fd 50%, #bbdefb 100%)",
    text: {
      primary: "rgba(0, 0, 0, 0.87)",
      secondary: "rgba(0, 0, 0, 0.6)",
      disabled: "rgba(0, 0, 0, 0.38)",
    },
    action: {
      active: "rgba(0, 0, 0, 0.54)",
      hover: "rgba(25, 118, 210, 0.04)",
      selected: "rgba(25, 118, 210, 0.08)",
      disabled: "rgba(0, 0, 0, 0.26)",
    },
    surface: {
      main: "#ffffff",
      border: "rgba(0, 0, 0, 0.12)",
    },
    error: "#c62828",
    warning: "#e65100",
    info: "#0277bd",
    success: "#2e7d32",
  },
  {
    name: "Dark Blue",
    label: "أزرق داكن",
    mode: "dark",
    primary: "#90caf9",
    secondary: "#ce93d8",
    background: "#0a1929",
    paper: "#0d1b2a",
    divider: "rgba(255, 255, 255, 0.12)",
    backgroundImage:
      "linear-gradient(135deg, #0a1929 0%, #0d1b2a 50%, #132f4c 100%)",
    text: {
      primary: "#ffffff",
      secondary: "rgba(255, 255, 255, 0.7)",
      disabled: "rgba(255, 255, 255, 0.5)",
    },
    action: {
      active: "#ffffff",
      hover: "rgba(144, 202, 249, 0.08)",
      selected: "rgba(144, 202, 249, 0.16)",
      disabled: "rgba(255, 255, 255, 0.3)",
    },
    surface: {
      main: "#0d1b2a",
      border: "rgba(255, 255, 255, 0.12)",
    },
    error: "#ff5252",
    warning: "#ff9800",
    info: "#03a9f4",
    success: "#4caf50",
  },
  {
    name: "Light Orange",
    label: "برتقالي فاتح",
    mode: "light",
    primary: "#f57c00",
    secondary: "#ff6090",
    background: "#fffaf5",
    paper: "#ffffff",
    divider: "rgba(0, 0, 0, 0.12)",
    backgroundImage:
      "linear-gradient(135deg, #fffaf5 0%, #fff7e6 50%, #ffe0b2 100%)",
    text: {
      primary: "rgba(0, 0, 0, 0.87)",
      secondary: "rgba(0, 0, 0, 0.6)",
      disabled: "rgba(0, 0, 0, 0.38)",
    },
    action: {
      active: "rgba(0, 0, 0, 0.54)",
      hover: "rgba(245, 124, 0, 0.04)",
      selected: "rgba(245, 124, 0, 0.08)",
      disabled: "rgba(0, 0, 0, 0.26)",
    },
    surface: {
      main: "#ffffff",
      border: "rgba(0, 0, 0, 0.12)",
    },
    error: "#c62828",
    warning: "#ef6c00",
    info: "#0277bd",
    success: "#388e3c",
  },
  {
    name: "Dark Orange",
    label: "برتقالي داكن",
    mode: "dark",
    primary: "#ffb74d",
    secondary: "#ff9cad",
    background: "#1a0f00",
    paper: "#261a0f",
    divider: "rgba(255, 255, 255, 0.12)",
    backgroundImage:
      "linear-gradient(135deg, #1a0f00 0%, #261a0f 50%, #332211 100%)",
    text: {
      primary: "#ffffff",
      secondary: "rgba(255, 255, 255, 0.7)",
      disabled: "rgba(255, 255, 255, 0.5)",
    },
    action: {
      active: "#ffffff",
      hover: "rgba(255, 183, 77, 0.08)",
      selected: "rgba(255, 183, 77, 0.16)",
      disabled: "rgba(255, 255, 255, 0.3)",
    },
    surface: {
      main: "#261a0f",
      border: "rgba(255, 255, 255, 0.12)",
    },
    error: "#ff6b6b",
    warning: "#ffa726",
    info: "#4fc3f7",
    success: "#66bb6a",
  },
  {
    name: "Light Green",
    label: "أخضر فاتح",
    mode: "light",
    primary: "#2e7d32",
    secondary: "#00796b",
    background: "#f6fbf6",
    paper: "#ffffff",
    divider: "rgba(0, 0, 0, 0.12)",
    backgroundImage:
      "linear-gradient(135deg, #f6fbf6 0%, #e8f5e9 50%, #c8e6c9 100%)",
    text: {
      primary: "rgba(0, 0, 0, 0.87)",
      secondary: "rgba(0, 0, 0, 0.6)",
      disabled: "rgba(0, 0, 0, 0.38)",
    },
    action: {
      active: "rgba(0, 0, 0, 0.54)",
      hover: "rgba(46, 125, 50, 0.04)",
      selected: "rgba(46, 125, 50, 0.08)",
      disabled: "rgba(0, 0, 0, 0.26)",
    },
    surface: {
      main: "#ffffff",
      border: "rgba(0, 0, 0, 0.12)",
    },
    error: "#c62828",
    warning: "#f57c00",
    info: "#0277bd",
    success: "#2e7d32",
  },
  {
    name: "Dark Green",
    label: "أخضر داكن",
    mode: "dark",
    primary: "#81c784",
    secondary: "#4db6ac",
    background: "#071912",
    paper: "#0f2918",
    divider: "rgba(255, 255, 255, 0.12)",
    backgroundImage:
      "linear-gradient(135deg, #071912 0%, #0f2918 50%, #1a3828 100%)",
    text: {
      primary: "#ffffff",
      secondary: "rgba(255, 255, 255, 0.7)",
      disabled: "rgba(255, 255, 255, 0.5)",
    },
    action: {
      active: "#ffffff",
      hover: "rgba(129, 199, 132, 0.08)",
      selected: "rgba(129, 199, 132, 0.16)",
      disabled: "rgba(255, 255, 255, 0.3)",
    },
    surface: {
      main: "#0f2918",
      border: "rgba(255, 255, 255, 0.12)",
    },
    error: "#ef5350",
    warning: "#ffa726",
    info: "#29b6f6",
    success: "#66bb6a",
  },
  {
    name: "Light Red",
    label: "أحمر فاتح",
    mode: "light",
    primary: "#d32f2f",
    secondary: "#c2185b",
    background: "#fff8f8",
    paper: "#ffffff",
    divider: "rgba(0, 0, 0, 0.12)",
    backgroundImage:
      "linear-gradient(135deg, #fff8f8 0%, #ffefef 50%, #ffe1e1 100%)",
    text: {
      primary: "rgba(0, 0, 0, 0.87)",
      secondary: "rgba(0, 0, 0, 0.6)",
      disabled: "rgba(0, 0, 0, 0.38)",
    },
    action: {
      active: "rgba(0, 0, 0, 0.54)",
      hover: "rgba(211, 47, 47, 0.04)",
      selected: "rgba(211, 47, 47, 0.08)",
      disabled: "rgba(0, 0, 0, 0.26)",
    },
    surface: {
      main: "#ffffff",
      border: "rgba(0, 0, 0, 0.12)",
    },
    error: "#b71c1c",
    warning: "#e65100",
    info: "#01579b",
    success: "#1b5e20",
  },
  {
    name: "Dark Red",
    label: "أحمر داكن",
    mode: "dark",
    primary: "#ff8a80",
    secondary: "#ff80ab",
    background: "#1a0e0e",
    paper: "#2d1515",
    divider: "rgba(255, 255, 255, 0.12)",
    backgroundImage:
      "linear-gradient(135deg, #1a0e0e 0%, #2d1515 50%, #3f1f1f 100%)",
    text: {
      primary: "#ffffff",
      secondary: "rgba(255, 255, 255, 0.7)",
      disabled: "rgba(255, 255, 255, 0.5)",
    },
    action: {
      active: "#ffffff",
      hover: "rgba(255, 138, 128, 0.08)",
      selected: "rgba(255, 138, 128, 0.16)",
      disabled: "rgba(255, 255, 255, 0.3)",
    },
    surface: {
      main: "#2d1515",
      border: "rgba(255, 255, 255, 0.12)",
    },
    error: "#ff5252",
    warning: "#ff9800",
    info: "#40c4ff",
    success: "#69f0ae",
  },
  {
    name: "Midnight Indigo",
    label: "ليل نيلي",
    mode: "dark",
    primary: "#8c9eff",
    secondary: "#64ffda",
    background: "#0f1222",
    paper: "#161a2e",
    divider: "rgba(255, 255, 255, 0.10)",
    backgroundImage:
      "radial-gradient(1200px 600px at 100% 0%, #1f2550 0%, rgba(15,18,34,0) 60%), linear-gradient(160deg, #0f1222 0%, #121630 100%)",
    text: {
      primary: "#eef0ff",
      secondary: "rgba(238, 240, 255, 0.68)",
      disabled: "rgba(238, 240, 255, 0.4)",
    },
    action: {
      active: "#eef0ff",
      hover: "rgba(140, 158, 255, 0.08)",
      selected: "rgba(140, 158, 255, 0.18)",
      disabled: "rgba(238, 240, 255, 0.3)",
    },
    surface: {
      main: "#161a2e",
      border: "rgba(255, 255, 255, 0.10)",
    },
    error: "#ff6e7a",
    warning: "#ffb74d",
    info: "#4fc3f7",
    success: "#4cd9a0",
  },
  {
    name: "Sand Clay",
    label: "رملي دافئ",
    mode: "light",
    primary: "#b5552f",
    secondary: "#2f6f6b",
    background: "#f7f2ea",
    paper: "#fffdf9",
    divider: "rgba(80, 52, 30, 0.14)",
    backgroundImage: "linear-gradient(160deg, #fbf7f0 0%, #f3ebdd 100%)",
    text: {
      primary: "#2d241d",
      secondary: "rgba(45, 36, 29, 0.66)",
      disabled: "rgba(45, 36, 29, 0.38)",
    },
    action: {
      active: "rgba(45, 36, 29, 0.6)",
      hover: "rgba(181, 85, 47, 0.06)",
      selected: "rgba(181, 85, 47, 0.12)",
      disabled: "rgba(45, 36, 29, 0.26)",
    },
    surface: {
      main: "#fffdf9",
      border: "rgba(80, 52, 30, 0.14)",
    },
    error: "#b3261e",
    warning: "#b26a00",
    info: "#1f6aa5",
    success: "#2e7d4f",
  },
  {
    name: "Teal Breeze",
    label: "فيروزي",
    mode: "light",
    primary: "#00796b",
    secondary: "#5e35b1",
    background: "#f2f8f7",
    paper: "#ffffff",
    divider: "rgba(0, 60, 55, 0.12)",
    backgroundImage: "linear-gradient(160deg, #f5fbfa 0%, #e2f1ee 100%)",
    text: {
      primary: "#10241f",
      secondary: "rgba(16, 36, 31, 0.64)",
      disabled: "rgba(16, 36, 31, 0.38)",
    },
    action: {
      active: "rgba(16, 36, 31, 0.56)",
      hover: "rgba(0, 121, 107, 0.06)",
      selected: "rgba(0, 121, 107, 0.12)",
      disabled: "rgba(16, 36, 31, 0.26)",
    },
    surface: {
      main: "#ffffff",
      border: "rgba(0, 60, 55, 0.12)",
    },
    error: "#c62828",
    warning: "#ef6c00",
    info: "#0277bd",
    success: "#2e7d32",
  },
  {
    name: "Graphite Amber",
    label: "جرافيت كهرماني",
    mode: "dark",
    primary: "#ffc857",
    secondary: "#7fd1ff",
    background: "#151515",
    paper: "#1e1e1e",
    divider: "rgba(255, 255, 255, 0.09)",
    backgroundImage: "linear-gradient(160deg, #151515 0%, #1b1b1b 100%)",
    text: {
      primary: "#f4f1ea",
      secondary: "rgba(244, 241, 234, 0.66)",
      disabled: "rgba(244, 241, 234, 0.4)",
    },
    action: {
      active: "#f4f1ea",
      hover: "rgba(255, 200, 87, 0.08)",
      selected: "rgba(255, 200, 87, 0.16)",
      disabled: "rgba(244, 241, 234, 0.3)",
    },
    surface: {
      main: "#1e1e1e",
      border: "rgba(255, 255, 255, 0.09)",
    },
    error: "#ff6b6b",
    warning: "#ffb347",
    info: "#7fd1ff",
    success: "#5fd38d",
  },
];
