function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export function smoothScrollTo(selector: string, duration = 1600) {
  const target = document.querySelector(selector);
  if (!target) {
    return;
  }

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const scrollPadding = Number.parseFloat(
    getComputedStyle(document.documentElement).scrollPaddingTop || "0",
  );
  const startY = window.scrollY;
  const targetY = target.getBoundingClientRect().top + startY - scrollPadding;
  const distance = targetY - startY;
  const startTime = performance.now();

  function step(now: number) {
    const progress = Math.min((now - startTime) / duration, 1);
    window.scrollTo(0, startY + distance * easeInOutCubic(progress));
    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}
