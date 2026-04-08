import { useEffect, useState } from "react";

function readWidth(): number {
  if (typeof window === "undefined") {
    return 1440;
  }

  return window.innerWidth;
}

export function useViewportWidth() {
  const [viewportWidth, setViewportWidth] = useState<number>(readWidth);

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(readWidth());
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return viewportWidth;
}
