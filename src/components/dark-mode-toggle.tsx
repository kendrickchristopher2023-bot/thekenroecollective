import { useEffect, useState } from "react";

const KEY = "kcc.theme";

function applyTheme(t: "light" | "dark") {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  if (t === "dark") html.classList.add("dark");
  else html.classList.remove("dark");
}

export function useDarkMode() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY) as "light" | "dark" | null;
      const initial = saved ?? "light";
      setTheme(initial);
      applyTheme(initial);
    } catch { /* ignore */ }
  }, []);
  const toggle = () => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
      applyTheme(next);
      return next;
    });
  };
  return { theme, toggle };
}
