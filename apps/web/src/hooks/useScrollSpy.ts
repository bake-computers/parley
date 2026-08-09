import { useEffect, useState } from "react";

type UseScrollSpyOptions = {
  sectionIds: string[];
  offset?: number;
};

export function useScrollSpy({ sectionIds, offset = 128 }: UseScrollSpyOptions) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let raf = 0;
    let lastActive: string | null = null;
    let lastScrolled = false;

    const update = () => {
      raf = 0;
      const nextScrolled = window.scrollY > 8;

      const scrollPosition = window.scrollY + offset;
      let current: string | null = null;
      for (const id of sectionIds) {
        const element = document.querySelector<HTMLElement>(`#${id}`);
        if (!element) {
          continue;
        }
        if (element.offsetTop <= scrollPosition) {
          current = id;
        }
      }

      if (current !== lastActive) {
        lastActive = current;
        setActiveId(current);
      }
      if (nextScrolled !== lastScrolled) {
        lastScrolled = nextScrolled;
        setScrolled(nextScrolled);
      }
    };

    // Coalesce scroll events into one update per frame.
    const handleScroll = () => {
      if (raf) {
        return;
      }
      raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      if (raf) {
        cancelAnimationFrame(raf);
      }
      window.removeEventListener("scroll", handleScroll);
    };
  }, [sectionIds, offset]);

  return { activeId, scrolled };
}
