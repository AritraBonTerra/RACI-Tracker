import { useEffect, useState } from "react";
import { Button } from "../components/ui";

// Three-way theme: an explicit Light or Dark sticks, System follows the OS and
// keeps following it live. The resolved theme lands on <html data-theme="...">,
// which src/index.css keys the palette off; index.html applies the saved choice
// before first paint so a reload never flashes the other theme.

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "raci-theme";

// One button, three stops: each press moves to the next preference.
const CYCLE: Record<ThemePreference, ThemePreference> = {
  system: "light",
  light: "dark",
  dark: "system",
};

function savedPreference(): ThemePreference {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === "light" || raw === "dark" ? raw : "system";
}

function apply(preference: ThemePreference) {
  const resolved =
    preference === "system"
      ? matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark"
      : preference;
  document.documentElement.dataset.theme = resolved;
}

function useThemePreference() {
  const [preference, setPreference] = useState<ThemePreference>(savedPreference);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, preference);
    apply(preference);
    if (preference !== "system") return;
    // Stay in step with the OS while it is in charge.
    const media = matchMedia("(prefers-color-scheme: light)");
    const onChange = () => apply("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  return { preference, cycle: () => setPreference((current) => CYCLE[current]) };
}

const ICONS: Record<ThemePreference, { label: string; icon: string }> = {
  light: { label: "Light", icon: "☀" },
  dark: { label: "Dark", icon: "☾" },
  system: { label: "System", icon: "◐" },
};

export function ThemeToggle() {
  const { preference, cycle } = useThemePreference();
  const current = ICONS[preference];
  const next = ICONS[CYCLE[preference]];

  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={cycle}
      title={`Theme: ${current.label} — switch to ${next.label}`}
      aria-label={`Theme: ${current.label} — switch to ${next.label}`}
    >
      <span aria-hidden className="text-sm leading-none">
        {current.icon}
      </span>
      <span className="hidden text-2xs sm:inline">{current.label}</span>
    </Button>
  );
}
