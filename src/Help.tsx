import { useState } from 'preact/hooks';
import { useI18n, type Key } from './i18n';

/** Sezione richiudibile con la freccetta ^ */
function Section({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: any }) {
  return (
    <section class="help-section">
      <button type="button" class="help-section-head" aria-expanded={open} onClick={onToggle}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" class="icon">
          <path d={open ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
        </svg>
        <span>{title}</span>
      </button>
      {open && <div class="help-section-body">{children}</div>}
    </section>
  );
}

/** Finestra di aiuto: lancio di magie e abilità, APNAP, combattimento, link alle regole. */
export function Help({ onClose, onExamples }: { onClose: () => void; onExamples?: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState<Record<string, boolean>>({ cast: false, apnap: false, combat: false, layers: false });
  const toggle = (k: string) => setOpen({ ...open, [k]: !open[k] });
  const steps = (k: Key) => t(k).split('|');
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
        <Section title={`${t('helpCast')} · ${t('helpAbility')}`} open={open.cast} onToggle={() => toggle('cast')}>
          <h3>{t('helpCast')}</h3>
          <ol>
            {steps('helpCastSteps').map((step, i) => (
              <li key={i}>
                <span class="rule">601.2{letters[i]}</span> {step}
              </li>
            ))}
          </ol>
          <h3>{t('helpAbility')}</h3>
          <ol>
            {steps('helpAbilitySteps').map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          <p>{t('helpTrigger')}</p>
          <p>{t('helpPriority')}</p>
        </Section>
        <Section title={t('helpApnap')} open={open.apnap} onToggle={() => toggle('apnap')}>
          <ol>
            {steps('helpApnapSteps').map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </Section>
        <Section title={t('helpCombat')} open={open.combat} onToggle={() => toggle('combat')}>
          <ol>
            {steps('helpCombatSteps').map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </Section>
        <Section title={t('helpLayers')} open={open.layers} onToggle={() => toggle('layers')}>
          <p>{t('helpLayersIntro')}</p>
          <table class="ex-layers help-layers">
            <tbody>
              {steps('helpLayersList').map((row) => {
                const [l, d] = row.split('=');
                return (
                  <tr key={l}>
                    <th scope="row">L-{l}</th>
                    <td>{d}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <h3>{t('helpLayersOrder')}</h3>
          <ol>
            {steps('helpLayersRules').map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          <h3>{t('helpLayersInApp')}</h3>
          <p>{t('helpLayersApp')}</p>
          {onExamples && (
            <button type="button" class="secondary" onClick={onExamples}>
              {t('examples')}
            </button>
          )}
        </Section>
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
