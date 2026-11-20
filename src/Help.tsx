import { useI18n } from './i18n';

/** Finestra di aiuto: l'ordine corretto per lanciare una magia o attivare un'abilità. */
export function Help({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const cast = t('helpCastSteps').split('|');
  const ability = t('helpAbilitySteps').split('|');
  const letters = 'abcdefghi';
  return (
    <aside class="help-window" role="dialog" aria-label={t('helpTitle')}>
      <div class="help-head">
        <h2>{t('helpTitle')}</h2>
        <button type="button" class="panel-close" aria-label={t('close')} onClick={onClose}>
          ✕
        </button>
      </div>
      <div class="help-body">
        <h3>{t('helpCast')}</h3>
        <ol>
          {cast.map((step, i) => (
            <li key={i}>
              <span class="rule">601.2{letters[i]}</span> {step}
            </li>
          ))}
        </ol>
        <h3>{t('helpAbility')}</h3>
        <ol>
          {ability.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
        <p>{t('helpTrigger')}</p>
        <p>{t('helpPriority')}</p>
        <h3>{t('rulesLinks')}</h3>
        <ul class="help-links">
          <li>
            <a href="https://magic.wizards.com/en/rules" target="_blank" rel="noopener noreferrer">
              ↗ {t('rulesWotc')}
            </a>
          </li>
          <li>
            <a href="https://mtg.fandom.com/wiki/Portal:Rules" target="_blank" rel="noopener noreferrer">
              ↗ {t('rulesWiki')}
            </a>
          </li>
        </ul>
      </div>
    </aside>
  );
}
