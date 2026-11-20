// Trascinamento delle carte con il dito o il mouse (pointer events: funziona anche su iPhone/Android).
// Mouse: il trascinamento parte dopo pochi pixel di movimento.
// Touch: parte dopo una pressione prolungata (300 ms), così lo scorrimento normale resta possibile.
// Le destinazioni sono gli elementi con data-drop (es. "bf:A", "gy:B", "exile", "stack", "stackpos:2").

import { useRef, useState } from 'preact/hooks';

export interface DragItem {
  kind: 'obj' | 'stack';
  uid: number;
  img?: string;
}

export interface DragState {
  item: DragItem;
  x: number;
  y: number;
  /** destinazione sotto il dito, se c'è */
  over: string | null;
}

function targetAt(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]');
  return el?.dataset.drop ?? null;
}

export function useDrag(onDrop: (item: DragItem, target: string) => void) {
  const [drag, setDrag] = useState<DragState | null>(null);
  /** vero subito dopo un rilascio: il "click" che segue va ignorato */
  const justDropped = useRef(false);
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;

  function start(e: PointerEvent, item: DragItem) {
    if (e.button !== 0 || (e.target as Element).closest('button, a, input, select')) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const touch = e.pointerType !== 'mouse';
    let started = false;
    let timer = 0;

    const preventScroll = (ev: TouchEvent) => {
      if (started) ev.preventDefault();
    };
    const begin = (x: number, y: number) => {
      started = true;
      setDrag({ item, x, y, over: targetAt(x, y) });
      try {
        navigator.vibrate?.(12);
      } catch {}
    };
    const move = (ev: PointerEvent) => {
      const d = Math.hypot(ev.clientX - x0, ev.clientY - y0);
      if (!started) {
        if (!touch && d > 6) begin(ev.clientX, ev.clientY);
        else if (touch && d > 10) cleanup(); // il dito si muove subito: è uno scorrimento
        return;
      }
      setDrag({ item, x: ev.clientX, y: ev.clientY, over: targetAt(ev.clientX, ev.clientY) });
    };
    const up = (ev: PointerEvent) => {
      if (started) {
        const target = targetAt(ev.clientX, ev.clientY);
        justDropped.current = true;
        setTimeout(() => (justDropped.current = false), 60);
        if (target) dropRef.current(item, target);
      }
      cleanup();
    };
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cleanup);
      document.removeEventListener('touchmove', preventScroll);
      if (started) setDrag(null);
    };

    if (touch) timer = window.setTimeout(() => begin(x0, y0), 300);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cleanup);
    document.addEventListener('touchmove', preventScroll, { passive: false });
  }

  return { drag, start, justDropped };
}
