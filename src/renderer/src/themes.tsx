export interface Theme {
  name: string;
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

export const themes: Theme[] = [
  {
    name: "Light Blue",
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
];
