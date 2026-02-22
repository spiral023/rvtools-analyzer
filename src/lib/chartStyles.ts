/** Shared Recharts tooltip style for dark theme */
export const CHART_TOOLTIP_STYLE = {
  backgroundColor: "hsl(222, 15%, 11%)",
  border: "1px solid hsl(222, 12%, 18%)",
  borderRadius: "8px",
  color: "hsl(210, 20%, 93%)",
  fontSize: "12px",
};

export const CHART_AXIS_STYLE = { fontSize: 11, fill: "hsl(215, 12%, 55%)" };

export const CHART_COLORS = {
  primary: "hsl(190, 85%, 48%)",
  secondary: "hsl(215, 12%, 45%)",
  warning: "hsl(38, 92%, 50%)",
  danger: "hsl(0, 72%, 51%)",
  success: "hsl(152, 69%, 40%)",
  info: "hsl(217, 91%, 60%)",
  purple: "hsl(263, 70%, 50%)",
  pink: "hsl(330, 80%, 55%)",
};

export const SEVERITY_COLORS = [
  CHART_COLORS.success,
  CHART_COLORS.warning,
  CHART_COLORS.danger,
  CHART_COLORS.primary,
  CHART_COLORS.info,
  CHART_COLORS.purple,
  CHART_COLORS.pink,
  CHART_COLORS.secondary,
];
