'use client';
import { AlertTriangle, CloudOff, Info, RotateCcw, Send, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  Banner,
  Button,
  Card,
  CardSub,
  CardTitle,
  Checkbox,
  Chip,
  EmptyState,
  Input,
  KpiTile,
  ListRow,
  Logo,
  SegmentedControl,
  Select,
  Sheet,
  Skeleton,
  StatusBadge,
  Switch,
  Textarea,
  ToastProvider,
  useToast,
} from '@sp/ui';

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h3 id={id} className="text-overline text-brand-text">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Panel({ theme }: { theme: 'light' | 'dark' }) {
  const t = useTranslations('showcase');
  const toast = useToast();
  const [sheet, setSheet] = useState(false);
  const [push, setPush] = useState(true);
  const [period, setPeriod] = useState<'today' | 'tomorrow' | 'custom'>('today');
  const id = (s: string) => `${theme}-${s}`;

  return (
    <div
      data-theme={theme}
      className="flex flex-col gap-8 rounded-xl border border-line bg-bg p-4 text-ink sm:p-6"
    >
      <h2 className="text-h2">{t(theme)}</h2>

      <Section id={id('buttons')} title={t('buttons')}>
        <div className="flex flex-wrap items-center gap-3">
          <Button>{t('closeLesson')}</Button>
          <Button variant="signal" iconLeft={TriangleAlert}>
            {t('solveConflict')}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary">{t('cancel')}</Button>
          <Button variant="ghost" iconLeft={RotateCcw}>
            {t('undo')}
          </Button>
          <Button variant="danger">{t('delete')}</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" iconLeft={Send}>
            {t('reportAbsence')}
          </Button>
          <Button disabled>{t('disabled')}</Button>
          <Button variant="secondary" loading>
            {t('sending')}
          </Button>
          <Button size="sm" variant="secondary">
            {t('cancel')}
          </Button>
        </div>
        <Button block>{t('login')}</Button>
      </Section>

      <Section id={id('chips')} title={t('chips')}>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status="present" label={t('present')} />
          <StatusBadge status="late" label={t('late')} />
          <StatusBadge status="absent" label={t('absent')} />
          <StatusBadge status="excused" label={t('excused')} />
          <StatusBadge status="cancelled" label={t('cancelled')} />
          <StatusBadge status="substituted" label={t('substitution')} />
          <StatusBadge status="roomChanged" label={t('roomChanged')} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip tone="danger" icon={AlertTriangle}>
            {t('error')}
          </Chip>
          <Chip tone="solid" icon={AlertTriangle}>
            {t('conflict')}
          </Chip>
          <Chip tone="mono">{t('room')}</Chip>
          <Chip tone="mono">{t('time')}</Chip>
          <Chip>{t('draft')}</Chip>
        </div>
      </Section>

      <Section id={id('cards')} title={t('cards')}>
        <Card tone="night">
          <p className="text-overline text-signal">{t('today')}</p>
          <CardTitle as="h4" className="mt-2">
            {t('lessonTitle')}
          </CardTitle>
          <CardSub>{t('lessonSub')}</CardSub>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Chip tone="solid">{t('lessonOpen')}</Chip>
          </div>
        </Card>
        <Card>
          <CardTitle as="h4">{t('examTitle')}</CardTitle>
          <CardSub>{t('examSub')}</CardSub>
        </Card>
        <Card tone="signal" flat>
          <CardTitle as="h4">{t('collisionTitle')}</CardTitle>
          <CardSub className="font-semibold text-signal-ink">{t('collisionSub')}</CardSub>
        </Card>
        <Card tone="brand" flat interactive asChild>
          <a href="#top">
            <CardTitle as="h4">{t('infoTitle')}</CardTitle>
            <CardSub>{t('infoSub')}</CardSub>
          </a>
        </Card>
      </Section>

      <Section id={id('fields')} title={t('fields')}>
        <Input label={t('firstName')} placeholder={t('firstNamePlaceholder')} autoComplete="given-name" />
        <Input label={t('email')} hint={t('emailHint')} type="email" autoComplete="email" />
        <Input
          label={t('code')}
          mono
          inputMode="numeric"
          defaultValue="12 34"
          error={t('codeError')}
          autoComplete="one-time-code"
        />
        <Textarea label={t('topic')} />
        <Select
          label={t('class')}
          emptyLabel={t('chooseClass')}
          options={[
            { value: '3a', label: '3A' },
            { value: '3b', label: '3B' },
          ]}
        />
        <Checkbox label={t('confirmRead')} defaultChecked />
        <Switch label={t('notify')} checked={push} onCheckedChange={setPush} />
        <SegmentedControl
          label={t('period')}
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'today', label: t('periodToday') },
            { value: 'tomorrow', label: t('periodTomorrow') },
            { value: 'custom', label: t('periodCustom') },
          ]}
        />
      </Section>

      <Section id={id('kpis')} title={t('kpis')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <KpiTile value={3} label={t('kpiSubs')} href="#top" />
          <KpiTile value={5} label={t('kpiOpen')} />
          <KpiTile value={1} label={t('kpiCollision')} tone="signal" />
        </div>
        <KpiTile value="96 %" label={t('kpiBig')} size="big" />
      </Section>

      <Section id={id('feedback')} title={t('feedback')}>
        <Banner icon={CloudOff}>{t('offline')}</Banner>
        <Banner
          tone="danger"
          icon={TriangleAlert}
          action={
            <Button size="sm" variant="secondary">
              {t('retry')}
            </Button>
          }
        >
          {t('systemError')}
        </Banner>
        <Banner tone="brand" icon={Info}>
          {t('noPermission')}
        </Banner>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            onClick={() =>
              toast({ text: t('saved'), action: { label: t('undo'), onClick: () => undefined } })
            }
          >
            {t('showToast')}
          </Button>
          <Button variant="secondary" onClick={() => setSheet(true)}>
            {t('openSheet')}
          </Button>
        </div>
        <Sheet
          open={sheet}
          onOpenChange={setSheet}
          title={t('sheetTitle')}
          description={t('sheetSub')}
          closeLabel={t('close')}
        >
          <div className="flex flex-wrap gap-2">
            <Chip tone="ok">{t('reasonSick')}</Chip>
            <Chip>{t('reasonDoctor')}</Chip>
            <Chip>{t('reasonOther')}</Chip>
          </div>
          <Input label={t('period')} defaultValue={t('periodToday')} readOnly />
          <Button block iconLeft={Send} onClick={() => setSheet(false)}>
            {t('report')}
          </Button>
        </Sheet>
      </Section>

      <Section id={id('lists')} title={t('lists')}>
        <Card className="p-0">
          <ListRow
            title={t('rowName')}
            subtitle={t('rowSub')}
            trailing={<StatusBadge status="present" label={t('present')} />}
          />
          <ListRow
            title={t('rowName')}
            subtitle={t('rowSub')}
            trailing={<StatusBadge status="late" label={t('late')} />}
          />
        </Card>
      </Section>

      <Section id={id('states')} title={t('states')}>
        <Card flat>
          <EmptyState as="h4" title={t('emptyTitle')} description={t('emptySub')} />
        </Card>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-14" />
          <Skeleton className="h-14 w-4/5" />
        </div>
      </Section>

      <Section id={id('logo')} title={t('logo')}>
        <div className="flex flex-wrap items-center gap-6">
          <Logo />
          <Logo size="sm" />
          <Logo symbolOnly size="lg" />
        </div>
        <div className="rounded-lg bg-bg-night p-5">
          <Logo onNight />
        </div>
      </Section>
    </div>
  );
}

export function ShowcasePanel({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <ToastProvider>
      <Panel theme={theme} />
    </ToastProvider>
  );
}
