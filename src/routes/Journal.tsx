import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { api } from '../lib/ipc';
import type { JournalEntryDto } from '@shared/types';
import { Btn, Input, Label, Modal, Page, Table } from '../components/ui';
import { formatMoney, today } from '../lib/money';

interface JournalRow {
  id: number; date: string; reference: string | null; memo: string | null;
  sourceType: string; totalMinor: string; currency: string;
}

export default function JournalPage(): JSX.Element {
  const { t } = useTranslation();
  const tn = useTranslation('nav').t;
  const [from, setFrom] = useState(today().slice(0, 8) + '01');
  const [to, setTo] = useState(today());
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<unknown | null>(null);

  const { data: entries = [], refetch } = useQuery<JournalRow[]>({
    queryKey: ['journal', from, to],
    queryFn: () => api.journal.list(from, to) as Promise<JournalRow[]>
  });

  const showDetail = async (id: number) => {
    setDetail(await api.journal.get(id));
    setOpen(true);
  };

  return (
    <Page
      title={tn('journal')}
      toolbar={
        <div className="flex gap-2 items-end">
          <div><Label>{t('from')}</Label><Input className="ltr-num" type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div><Label>{t('to')}</Label><Input className="ltr-num" type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
          <Btn onClick={() => refetch()}>{t('search')}</Btn>
        </div>
      }
    >
      <Table<JournalRow>
        rows={entries}
        onRowClick={(r) => showDetail(r.id)}
        cols={[
          { key: 'id', header: '#', className: 'ltr-num w-16' },
          { key: 'date', header: t('date'), className: 'ltr-num w-28' },
          { key: 'reference', header: t('reference'), className: 'ltr-num w-32' },
          { key: 'memo', header: t('memo') },
          { key: 'sourceType', header: 'Source', className: 'w-24' },
          { key: 'totalMinor', header: t('amount'), className: 'ltr-num text-end',
            render: r => formatMoney(r.totalMinor, r.currency) }
        ]}
      />
      <Modal open={open} onClose={() => setOpen(false)} title={t('open')} wide>
        {detail ? <DetailView entry={detail as Omit<JournalEntryDto, 'lines'> & { lines: Array<{ accountCode:string; accountName:string; debitMinor:string; creditMinor:string; currency:string; memo?:string|null }> }} /> : t('loading')}
      </Modal>
    </Page>
  );
}

const DetailView: React.FC<{ entry: Omit<JournalEntryDto, 'lines'> & { lines: Array<{ accountCode:string; accountName:string; debitMinor:string; creditMinor:string; currency:string; memo?:string|null }> } }> = ({ entry }) => {
  const { t } = useTranslation();
  return (
    <div>
      <div className="text-sm text-fg2 mb-3">
        {entry.date} · <span className="ltr-num">{entry.reference}</span> · {entry.memo}
      </div>
      <table className="w-full text-sm">
        <thead className="text-fg2 text-xs">
          <tr><th className="text-start">{t('code')}</th><th className="text-start">{t('name')}</th><th className="text-end">{t('debit')}</th><th className="text-end">{t('credit')}</th><th>{t('memo')}</th></tr>
        </thead>
        <tbody>
          {entry.lines.map((l, i) => (
            <tr key={i} className="border-t border-line">
              <td className="py-1.5 ltr-num">{l.accountCode}</td>
              <td>{l.accountName}</td>
              <td className="text-end ltr-num">{formatMoney(l.debitMinor, l.currency)}</td>
              <td className="text-end ltr-num">{formatMoney(l.creditMinor, l.currency)}</td>
              <td>{l.memo ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
