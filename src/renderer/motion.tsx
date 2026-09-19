import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Visuals";

const easing = "cubic-bezier(.16,1,.3,1)";
const running = new WeakMap<HTMLElement, Animation>();
export function resetMotion(element: HTMLElement) {
  running.get(element)?.cancel();
  running.delete(element);
  element.style.transform = "none";
  element.style.opacity = "1";
}
export const reduceMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

// Read the current painted position before cancelling: repeated clicks reverse in place.
export function move(
  element: HTMLElement,
  to: Keyframe,
  duration: number,
  from?: Keyframe,
  delay = 0,
): Promise<void> {
  const painted = getComputedStyle(element);
  const current: Keyframe = from ?? {
    opacity: painted.opacity,
    transform: painted.transform,
  };
  running.get(element)?.cancel();
  if (!element.animate || reduceMotion()) {
    Object.assign(element.style, to);
    return Promise.resolve();
  }
  const animation = element.animate([current, to], {
    duration,
    delay,
    easing,
    fill: "both",
  });
  running.set(element, animation);
  return animation.finished.then(
    () => {
      if (running.get(element) !== animation) return;
      Object.assign(element.style, to);
      animation.cancel();
      running.delete(element);
    },
    () => undefined,
  );
}

export function usePresence<T extends HTMLElement>(
  active: boolean,
  kind: "drawer" | "fade" | "gallery" = "fade",
) {
  const ref = useRef<T>(null);
  const initialized = useRef(false);
  const revision = useRef(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const id = ++revision.current;
    const offset =
      kind === "drawer"
        ? "translateX(32px)"
        : kind === "gallery"
          ? "translateY(10px) scale(.985)"
          : "none";
    if (!initialized.current) {
      initialized.current = true;
      el.hidden = !active;
      el.style.opacity = active ? "1" : "0";
      el.style.transform = active ? "none" : offset;
      return;
    }
    el.hidden = false;
    void move(
      el,
      { opacity: active ? 1 : 0, transform: active ? "none" : offset },
      active ? (kind === "drawer" ? 420 : kind === "gallery" ? 380 : 320) : 220,
    ).then(() => {
      if (revision.current === id && !active) el.hidden = true;
    });
  }, [active, kind]);
  return ref;
}

export function Overlay({
  open,
  title,
  subtitle,
  onClose,
  children,
  className = "",
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose(): void;
  children: ReactNode;
  className?: string;
}) {
  const backdrop = usePresence<HTMLDivElement>(open);
  const panel = usePresence<HTMLElement>(
    open,
    className.includes("gallery") ? "gallery" : "drawer",
  );
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const el = panel.current;
    el?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab" || !el) return;
      const items = Array.from(
        el.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]',
        ),
      ).filter((item) => !item.closest("[hidden],[inert]"));
      const first = items[0],
        last = items[items.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !el.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !el.contains(document.activeElement))
      ) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previous?.isConnected && !previous.closest("[inert]"))
        previous.focus({ preventScroll: true });
    };
  }, [open, panel]);
  return (
    <>
      <div
        className="drawer-backdrop"
        ref={backdrop}
        inert={!open}
        aria-hidden="true"
        onClick={onClose}
      />
      <section
        ref={panel}
        className={`drawer ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-hidden={!open}
        inert={!open}
      >
        <header className="drawer-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" aria-label="ปิดแผง" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        <div className="drawer-body">{children}</div>
      </section>
    </>
  );
}
