import { MoonOutlined, SunOutlined } from "@/components/ui/icons";
import type { ThemeMode } from "@/lib/theme";

type ThemeToggleProps = {
  themeMode: ThemeMode;
  onToggle: () => void;
};

export function ThemeToggle({ themeMode, onToggle }: ThemeToggleProps) {
  const isDark = themeMode === "dark";
  const label = isDark ? "切换到浅色主题" : "切换到深色主题";

  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={isDark}
      onClick={onToggle}
    >
      {isDark ? <SunOutlined /> : <MoonOutlined />}
      <span className="theme-toggle-label">主题</span>
    </button>
  );
}
