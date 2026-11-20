import { useEffect, useState } from 'preact/hooks';
import { useI18n } from './i18n';
import { fetchRulings, type Card, type Ruling } from './scryfall';

/** Carta in grande + pannello scorrevole con testo e chiarimenti ufficiali (rulings) da Scryfall. */
export function CardViewer({ card, onClose }: { card: Card; onClose: () => void }) {
  const { t, lang } = useI18n();
  const [rulings, setRulings] = useState<Ruling[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [faceIdx, setFaceIdx] = useState(0);

  useEffect(() => {
    fetchRulings(card.scryfallId)
      .then(setRulings)
      .catch(() => setFailed(true));
  }, [card.scryfallId]);

  // Bifronte: ogni faccia ha la sua immagine
  const faceImages = card.faces.map((f) => f.image).filter(Boolean) as string[];
  const image = faceImages.length > 1 ? faceImages[faceIdx] : card.image;
  const parts: { printedName: string; manaCost: string; typeLine: string; text: string; oracleText: string }[] =
    card.faces.length ? card.faces : [card];
  const localized = card.lang !== 'en';

  return (
    <div class="viewer-backdrop" onClick={onClose}>
      <div class="viewer" role="dialog" aria-label={card.printedName} onClick={(e) => e.stopPropagation()}>
        <div class="viewer-img">
          {image ? <img src={image} alt={card.printedName} /> : <div class="no-image">{card.printedName}</div>}
          {faceImages.length > 1 && (
            <button type="button" class="secondary" onClick={() => setFaceIdx((faceIdx + 1) % faceImages.length)}>
              ⟲ {t('flipFace')}
            </button>
          )}
        </div>
        <aside class="viewer-side">
          <div class="viewer-head">
            <h2>{card.printedName}</h2>
            <button type="button" class="panel-close" aria-label={t('close')} onClick={onClose}>
              ✕
            </button>
          </div>
          <div class="viewer-scroll">
            {parts.map((p, i) => (
              <section key={i} class="viewer-part">
                <p class="viewer-line">
                  <b>{p.printedName}</b> <span class="cost">{p.manaCost}</span>
                </p>
                <p class="viewer-type">{p.typeLine}</p>
                <p class="viewer-text">{p.text}</p>
                {localized && p.oracleText && p.oracleText !== p.text && (
                  <details>
                    <summary>{t('oracleText')}</summary>
                    <p class="viewer-text">{p.oracleText}</p>
                  </details>
                )}
              </section>
            ))}
            <h3>{t('rulings')}</h3>
            {lang !== 'en' && <p class="status">{t('rulingsEnglish')}</p>}
            {failed && <p class="status error">{t('error')}</p>}
            {!failed && rulings === null && <p class="status">{t('loading')}</p>}
            {rulings?.length === 0 && <p class="status">{t('noRulings')}</p>}
            <ul class="rulings">
              {rulings?.map((r, i) => (
                <li key={i}>
                  <time>{r.published_at}</time>
                  <p>{r.comment}</p>
                </li>
              ))}
            </ul>
            <a class="menu-link" href={card.scryfallUri} target="_blank" rel="noopener noreferrer">
              ↗ {t('openScryfall')}
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
}
