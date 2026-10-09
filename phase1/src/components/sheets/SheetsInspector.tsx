import {useT} from '../../lib/useT';
import {useSheetsSelection} from '../../lib/sheets/sheetsStore';
export function SheetsInspector(){
 const {t}=useT();const s=useSheetsSelection();
 return <aside className="flex h-full flex-col gap-2 overflow-auto p-3 text-[12px]" aria-label={t('sheets.inspector')} data-testid="sheets-inspector">
  <h2 className="text-[12px] font-semibold text-ink">{t('sheets.inspector')}</h2>
  {!s?<p className="text-ink-3">{t('sheets.inspector.none')}</p>:<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
   <dt className="text-ink-3">{t('sheets.inspector.sheet')}</dt><dd>{s.sheetName}</dd>
   <dt className="text-ink-3">{t('sheets.address')}</dt><dd data-testid="sheets-inspector-address">{s.address}</dd>
   <dt className="text-ink-3">{t('sheets.inspector.type')}</dt><dd>{s.kind}</dd>
   <dt className="text-ink-3">{t('sheets.inspector.value')}</dt><dd className="break-all">{s.text}</dd>
   {s.formula&&<><dt className="text-ink-3">{t('sheets.inspector.formula')}</dt><dd className="break-all">={s.formula.replace(/^=/,'')}</dd></>}
  </dl>}
 </aside>;
}
