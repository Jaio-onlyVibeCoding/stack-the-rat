import { useLayoutEffect, useState } from 'preact/hooks';

export interface Link {
  from: string;
  to: string;
  color: string;
}

interface Segment {
  id: string;
  d: string;
  color: string;
}

interface Point {
  x: number;
  y: number;
}

/** Punto di aggancio di un oggetto: centro, oppure centro della fascia del nome per le carte in pila. */
function anchor(key: string): Point | null {
  const el = document.querySelector<HTMLElement>(`[data-obj="${key}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0) return null;
  if (el.dataset.anchor === 'strip') {
    const peek = Math.max(r.width * 0.16, 40);
    return { x: r.left + r.width / 2, y: r.top + Math.min(peek, r.height) / 2 };
  }
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Curva morbida da a a b, piegata di lato per non coprire le carte in linea retta. */
function curve(a: Point, b: Point): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const bend = Math.min(90, len * 0.3);
  const cx = (a.x + b.x) / 2 - (dy / len) * bend;
  const cy = (a.y + b.y) / 2 + (dx / len) * bend;
  return `M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
}

/**
 * Livello SVG sopra tutta l'app: disegna le frecce leggendo la posizione degli elementi
 * sullo schermo. Si ridisegna quando qualcosa si sposta (scroll, rotazione, immagini caricate).
 */
export function Arrows({ links }: { links: Link[] }) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const signature = links.map((l) => `${l.from}>${l.to}>${l.color}`).join('|');

  useLayoutEffect(() => {
    let frame = 0;
    const draw = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next: Segment[] = [];
        for (const l of links) {
          const a = anchor(l.from);
          const b = anchor(l.to);
          if (a && b) next.push({ id: `${l.from}>${l.to}`, d: curve(a, b), color: l.color });
        }
        setSegments((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      });
    };
    draw();
    const app = document.getElementById('app')!;
    const resizeObs = new ResizeObserver(draw);
    resizeObs.observe(document.body);
    const mutationObs = new MutationObserver(draw);
    mutationObs.observe(app, { childList: true, subtree: true, attributes: true });
    window.addEventListener('resize', draw);
    window.addEventListener('scroll', draw, true);
    document.addEventListener('load', draw, true);
    return () => {
      cancelAnimationFrame(frame);
      resizeObs.disconnect();
      mutationObs.disconnect();
      window.removeEventListener('resize', draw);
      window.removeEventListener('scroll', draw, true);
      document.removeEventListener('load', draw, true);
    };
  }, [signature]);

  const colors = [...new Set(segments.map((s) => s.color))];

  return (
    <svg class="arrows" aria-hidden="true">
      <defs>
        {colors.map((c, i) => (
          <marker
            key={c}
            id={`arrowhead-${i}`}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="16"
            markerHeight="16"
            markerUnits="userSpaceOnUse"
            orient="auto"
          >
            <path d="M0,0 L10,5 L0,10 z" style={{ fill: c }} />
          </marker>
        ))}
      </defs>
      {segments.map((s) => (
        <g key={s.id}>
          <path class="arrow-shadow" d={s.d} />
          <path
            class="arrow-line"
            d={s.d}
            style={{ stroke: s.color, markerEnd: `url(#arrowhead-${colors.indexOf(s.color)})` }}
          />
        </g>
      ))}
    </svg>
  );
}
