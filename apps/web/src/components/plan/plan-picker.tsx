'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { Button, Select, Sheet } from '@sp/ui';
import { useT } from '../../lib/i18n';

interface Directory {
  classes: { id: string; name: string }[];
  teachers: { id: string; name: string }[];
  rooms: { id: string; name: string }[];
}

/** Auswahl eines fremden Plans (Klasse, Lehrkraft, Raum) für Lehrkräfte, Direktion und Administration. */
export function PlanPicker({
  directory,
  from,
  current,
}: {
  directory: Directory;
  from: string;
  current: { kind: 'class' | 'teacher' | 'room'; id: string } | null;
}) {
  const t = useT('plan');
  const c = useT('common');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'class' | 'teacher' | 'room'>(current?.kind ?? 'class');
  const [id, setId] = useState(current?.id ?? '');
  const options = (
    kind === 'class' ? directory.classes : kind === 'teacher' ? directory.teachers : directory.rooms
  ).map((x) => ({ value: x.id, label: x.name }));
  const form = (
    <form
      className="grid grid-cols-1 items-end gap-3 lg:grid-cols-[10rem_minmax(0,24rem)_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        setOpen(false);
        router.push(id ? `/plan?${kind}=${id}&from=${from}` : `/plan?from=${from}`);
      }}
    >
      <Select
        label={t('other')}
        value={kind}
        onChange={(e) => {
          setKind(e.target.value as 'class' | 'teacher' | 'room');
          setId('');
        }}
        options={[
          { value: 'class', label: t('class') },
          { value: 'teacher', label: t('teacher') },
          { value: 'room', label: t('room') },
        ]}
      />
      <Select
        label={t('choose')}
        value={id}
        onChange={(e) => setId(e.target.value)}
        options={options}
        emptyLabel={t('mine')}
      />
      <Button type="submit">{t('show')}</Button>
    </form>
  );
  // Mobil hinter einem Knopf im Sheet, damit der Plan oben bleibt (Design System, Stundenplan mobil)
  return (
    <>
      <div className="lg:hidden">
        <Button variant="secondary" size="sm" iconLeft={Search} onClick={() => setOpen(true)}>
          {t('other')}
        </Button>
        <Sheet open={open} onOpenChange={setOpen} title={t('other')} closeLabel={c('close')}>
          {form}
        </Sheet>
      </div>
      <div className="hidden lg:block">{form}</div>
    </>
  );
}
