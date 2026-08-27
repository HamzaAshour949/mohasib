import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { api } from '../lib/ipc';
import { Btn, Page, Table } from '../components/ui';

interface Issue { severity: 'warn' | 'error'; entity: string; id?: number; message: string }
interface Result { issues: Issue[]; runAt: string }

export default function AuditReportPage(): JSX.Element {
  const { t } = useTranslation();
  const [data, setData] = useState<Result | null>(null);
  const [running, setRunning] = useState(false);

  const run = async (): Promise<void> => {
    setRunning(true);
    const r = await api.auditReports.run() as Result;
    setData(r);
    setRunning(false);
  };

  return (
    <Page title={t('audit')} toolbar={<Btn onClick={run} disabled={running}>{running ? t('loading') : t('runAudit')}</Btn>}>
      {data && (
        <div className="mb-3 text-sm text-fg2">
          {t('date')}: <span className="ltr-num">{new Date(data.runAt).toLocaleString()}</span>
          {' · '}{data.issues.length} {data.issues.length === 1 ? 'issue' : 'issues'}
        </div>
      )}
      <Table<Issue>
        rows={data?.issues ?? []}
        empty={running ? t('loading') : t('noData')}
        cols={[
          { key: 'severity', header: 'Severity', className: 'w-24',
            render: r => <span className={r.severity === 'error' ? 'text-rose-400' : 'text-amber-400'}>{r.severity}</span> },
          { key: 'entity', header: 'Entity', className: 'w-32' },
          { key: 'id', header: 'ID', className: 'w-20 ltr-num' },
          { key: 'message', header: 'Message' }
        ]}
      />
    </Page>
  );
}
