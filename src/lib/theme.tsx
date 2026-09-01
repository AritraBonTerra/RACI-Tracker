import { useEffect, useState } from "react";
import { selectClass } from "../components/ui";

// Three-way theme: an explicit Light or Dark sticks, System follows the OS and
// keeps following it live. The resolved theme lands on <html data-theme="...">,
// which src/index.css keys the palette off; index.html applies the saved choice
// before first paint so a reload never flashes the other theme.

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "raci-theme";

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

  return { preference, setPreference };
}

const OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: "light", label: "☀ Light" },
  { value: "dark", label: "☾ Dark" },
  { value: "system", label: "◐ System" },
];

export function ThemeToggle() {
  const { preference, setPreference } = useThemePreference();

  return (
    <select
      aria-label="Theme"
      value={preference}
      onChange={(event) => {
        const { value } = event.target;
        if (value === "light" || value === "dark" || value === "system") setPreference(value);
      }}
      className={selectClass}
    >
      {OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
