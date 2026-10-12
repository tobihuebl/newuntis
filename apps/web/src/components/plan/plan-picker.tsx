'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Select } from '@sp/ui';
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
  const router = useRouter();
  const [kind, setKind] = useState<'class' | 'teacher' | 'room'>(current?.kind ?? 'class');
  const [id, setId] = useState(current?.id ?? '');
  const options = (
    kind === 'class' ? directory.classes : kind === 'teacher' ? directory.teachers : directory.rooms
  ).map((x) => ({ value: x.id, label: x.name }));
  return (
    <form
      className="grid items-end gap-3 sm:grid-cols-[10rem_1fr_auto]"
      onSubmit={(e) => {
        e.preventDefault();
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
}
