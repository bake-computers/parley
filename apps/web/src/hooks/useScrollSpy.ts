import { useEffect, useState } from "react";

type UseScrollSpyOptions = {
  sectionIds: string[];
  offset?: number;
};

export function useScrollSpy({ sectionIds, offset = 128 }: UseScrollSpyOptions) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 8);

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

      setActiveId(current);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [sectionIds, offset]);

  return { activeId, scrolled };
}
