/**
 * Stundenplan-Solver (M7, ADR 0012): plant Soll-Stunden in freie Plätze, hält harte Regeln immer ein und
 * minimiert die weichen. Deterministisch: gleiche Eingabe und gleicher Startwert ergeben denselben Plan.
 *
 * Ablauf: 1. Soll-Zeilen in Einheiten zerlegen (Doppelstunden bei preferDouble, abzüglich schon vorhandener
 * Stunden). 2. Schwierigste Einheiten zuerst gierig platzieren (wenigste mögliche Plätze). 3. Sackgassen gezielt
 * lösen: bis zu zwei blockierende Einheiten verdrängen und neu platzieren. 4. Lokale Suche gegen die weichen
 * Regeln (Hohlstunden, Tagesbelastung, gleiches Fach zweimal, weiche Wünsche, späte Stunden).
 */
import type { LessonRule, PeriodInfo } from '../timetable';
import type { PlanningConstraint } from './constraints';
import { requirementCoverage, type RequirementRule } from './coverage';

export interface SolverInput {
  periods: PeriodInfo[];
  /** Planbare Wochentage (Standard Montag bis Freitag). */
  weekdays?: number[];
  requirements: RequirementRule[];
  /** Bleibt unverändert: festgepinnte Stunden und alles außerhalb des Umfangs (Teilplanung). */
  fixed: LessonRule[];
  rooms: { id: string; capacity: number | null }[];
  classStudents: Record<string, string[]>;
  groupMembers: Record<string, string[]>;
  constraints: PlanningConstraint[];
  /** Weiche Tagesbelastung je Klasse (Schuleinstellung). */
  dayLoadMax: number;
  seed: number;
  /** Schritte der lokalen Suche (Standard abhängig von der Zahl der Einheiten). */
  iterations?: number;
}

export type UnplacedReason =
  'TEACHER_FULL' | 'CLASS_FULL' | 'NO_COMMON_SLOT' | 'NO_ROOM' | 'NO_DOUBLE' | 'WISHES';

export interface PlannedLesson extends LessonRule {
  requirementId: string;
}

export interface UnplacedUnit {
  requirementId: string;
  periodCount: number;
  reason: UnplacedReason;
}

export interface SolverResult {
  lessons: PlannedLesson[];
  unplaced: UnplacedUnit[];
  /** Wert der Zielfunktion (kleiner ist besser), für Vergleiche zwischen Läufen. */
  cost: number;
  stats: { units: number; placed: number; repaired: number; iterations: number };
}

// ───────────────────────── Zufall mit Startwert ─────────────────────────

/** Mulberry32: kleiner, schneller Generator; gleicher Startwert, gleiche Folge. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ───────────────────────── Gewichte ─────────────────────────

const W = {
  gapStudent: 10,
  gapStudentHard: 200,
  gapTeacher: 3,
  dayLoad: 8,
  sameSubject: 6,
  softWish: 5,
  latePeriod: 0.05,
};

interface Unit {
  uid: number;
  requirementId: string;
  len: number;
  subjectId: string;
  classId: string | null;
  groupId: string | null;
  teacherId: string;
  /** Belegte Kennungen je Zelle: Lehrkraft, Klasse/Gruppe, Schüler:innen. */
  atoms: string[];
  /** Klassen für Hohlstunden und Tagesbelastung. */
  classKeys: string[];
  size: number;
  rooms: string[];
  roomHard: boolean;
}

interface Placement {
  wd: number;
  p: number;
  room: string | null;
}

export function solveTimetable(input: SolverInput): SolverResult {
  const rng = seededRandom(input.seed);
  const weekdays = input.weekdays ?? [1, 2, 3, 4, 5];
  const periodNos = input.periods.map((p) => p.number).sort((a, b) => a - b);
  const periodBy = new Map(input.periods.map((p) => [p.number, p]));
  const maxP = periodNos[periodNos.length - 1] ?? 0;
  const roomCap = new Map(input.rooms.map((r) => [r.id, r.capacity]));
  const active = input.constraints.filter((c) => c.active);

  // Klassenzugehörigkeit für Gruppen (Hohlstunden, Tagesbelastung)
  const classOfStudent = new Map<string, string>();
  for (const [c, students] of Object.entries(input.classStudents))
    for (const s of students) classOfStudent.set(s, c);
  const studentAtoms = (classId: string | null, groupId: string | null) =>
    classId
      ? [`c:${classId}`, ...(input.classStudents[classId] ?? []).map((s) => `s:${s}`)]
      : groupId
        ? [`g:${groupId}`, ...(input.groupMembers[groupId] ?? []).map((s) => `s:${s}`)]
        : [];
  const classKeysOf = (classId: string | null, groupId: string | null) =>
    classId
      ? [classId]
      : groupId
        ? [
            ...new Set(
              (input.groupMembers[groupId] ?? []).flatMap((s) => classOfStudent.get(s) ?? []),
            ),
          ]
        : [];

  // ── Wünsche vorbereiten
  const hardMaxTeacher = new Map<string, number>();
  const softMaxTeacher = new Map<string, number>();
  const hardMaxClass = new Map<string | null, number>();
  const softMaxClass = new Map<string | null, number>();
  const subjectRooms = new Map<string, { rooms: string[]; hard: boolean }>();
  const homeRoom = new Map<string, string>();
  let noGapsHard = false;
  for (const c of active) {
    if (c.kind === 'TEACHER_MAX_PER_DAY' && c.teacherId && c.max) {
      const m = c.hard ? hardMaxTeacher : softMaxTeacher;
      m.set(c.teacherId, Math.min(m.get(c.teacherId) ?? Infinity, c.max));
    }
    if (c.kind === 'CLASS_MAX_PER_DAY' && c.max) {
      const m = c.hard ? hardMaxClass : softMaxClass;
      m.set(c.classId, Math.min(m.get(c.classId) ?? Infinity, c.max));
    }
    if (c.kind === 'SUBJECT_ROOMS' && c.subjectId)
      subjectRooms.set(c.subjectId, { rooms: c.roomIds, hard: c.hard });
    if (c.kind === 'CLASS_HOME_ROOM' && c.classId && c.roomIds[0])
      homeRoom.set(c.classId, c.roomIds[0]);
    if (c.kind === 'NO_STUDENT_GAPS' && c.hard) noGapsHard = true;
  }
  const classMax = (m: Map<string | null, number>, classId: string) =>
    Math.min(m.get(classId) ?? Infinity, m.get(null) ?? Infinity);
  const blockedHard = (u: Unit, wd: number, p: number) =>
    active.some(
      (c) =>
        c.hard &&
        ((c.kind === 'TEACHER_UNAVAILABLE' && c.teacherId === u.teacherId) ||
          (c.kind === 'SUBJECT_NOT_PERIODS' && c.subjectId === u.subjectId)) &&
        (c.weekday === null || c.weekday === wd) &&
        (c.periods.length === 0 || c.periods.includes(p)),
    );
  const softWishCost = (u: Unit, wd: number, p: number) =>
    active.reduce(
      (sum, c) =>
        !c.hard &&
        ((c.kind === 'TEACHER_UNAVAILABLE' && c.teacherId === u.teacherId) ||
          (c.kind === 'SUBJECT_NOT_PERIODS' && c.subjectId === u.subjectId)) &&
        (c.weekday === null || c.weekday === wd) &&
        (c.periods.length === 0 || c.periods.includes(p))
          ? sum + W.softWish
          : sum,
      0,
    );

  // ── Einheiten aus dem offenen Bedarf
  const coverage = new Map(
    requirementCoverage(input.requirements, input.fixed).map((c) => [c.requirementId, c.planned]),
  );
  const units: Unit[] = [];
  for (const r of [...input.requirements].sort((a, b) => a.id.localeCompare(b.id))) {
    const open = Math.max(0, Math.round(r.hoursPerWeek - (coverage.get(r.id) ?? 0)));
    if (open === 0) continue;
    const doubles = r.preferDouble ? Math.floor(open / 2) : 0;
    const lens = [...Array<number>(doubles).fill(2), ...Array<number>(open - doubles * 2).fill(1)];
    const atoms = [`t:${r.teacherId}`, ...studentAtoms(r.classId, r.groupId)];
    const sr = subjectRooms.get(r.subjectId);
    const home = r.classId ? homeRoom.get(r.classId) : undefined;
    for (const len of lens)
      units.push({
        uid: units.length,
        requirementId: r.id,
        len,
        subjectId: r.subjectId,
        classId: r.classId,
        groupId: r.groupId,
        teacherId: r.teacherId,
        atoms,
        classKeys: classKeysOf(r.classId, r.groupId),
        size: r.classId
          ? (input.classStudents[r.classId]?.length ?? 0)
          : (input.groupMembers[r.groupId ?? '']?.length ?? 0),
        rooms: sr ? sr.rooms : home ? [home] : [],
        roomHard: !!sr?.hard,
      });
  }

  // ── Belegung
  const cell = (wd: number, p: number) => (wd - 1) * maxP + (p - 1);
  const occ = new Map<number, Map<string, number>>(); // Zelle → Kennung → Einheit (-1 = fest)
  const own = (c: number) => {
    let m = occ.get(c);
    if (!m) occ.set(c, (m = new Map()));
    return m;
  };
  // Zähler je Tag für weiche Kosten: Klasse/Lehrkraft → Stunden; Fach je Klasse/Gruppe → Blöcke
  const dayCount = new Map<string, number[]>();
  const subjectBlocks = new Map<string, [number, number][]>();
  const counts = (key: string) => {
    let a = dayCount.get(key);
    if (!a) dayCount.set(key, (a = new Array<number>(maxP + 1).fill(0)));
    return a;
  };
  const markDay = (
    keys: { classKeys: string[]; teacherIds: string[]; who: string | null; subjectId: string },
    wd: number,
    p: number,
    len: number,
    delta: 1 | -1,
  ) => {
    for (const c of keys.classKeys)
      for (let k = 0; k < len; k++) counts(`C:${c}|${wd}`)[p + k]! += delta;
    for (const t of keys.teacherIds)
      for (let k = 0; k < len; k++) counts(`T:${t}|${wd}`)[p + k]! += delta;
    if (keys.who) {
      const key = `${keys.who}|${keys.subjectId}|${wd}`;
      const list = subjectBlocks.get(key) ?? [];
      if (delta === 1) list.push([p, len]);
      else {
        const i = list.findIndex(([s, l]) => s === p && l === len);
        if (i >= 0) list.splice(i, 1);
      }
      subjectBlocks.set(key, list);
    }
  };

  for (const l of input.fixed) {
    const atoms = [
      ...l.teacherIds.map((t) => `t:${t}`),
      ...studentAtoms(l.classId, l.groupId),
      ...(l.roomId ? [`r:${l.roomId}`] : []),
    ];
    for (let k = 0; k < Math.max(1, l.periodCount); k++)
      for (const a of atoms) own(cell(l.weekday, l.periodStart + k)).set(a, -1);
    markDay(
      {
        classKeys: classKeysOf(l.classId, l.groupId),
        teacherIds: l.teacherIds,
        who: l.classId ?? l.groupId,
        subjectId: l.subjectId,
      },
      l.weekday,
      l.periodStart,
      Math.max(1, l.periodCount),
      1,
    );
  }

  const placed = new Map<number, Placement>();
  const unitKeys = (u: Unit) => ({
    classKeys: u.classKeys,
    teacherIds: [u.teacherId],
    who: u.classId ?? u.groupId,
    subjectId: u.subjectId,
  });

  const gridOk = (u: Unit, wd: number, p: number) => {
    if (!weekdays.includes(wd)) return false;
    for (let k = 0; k < u.len; k++) {
      const per = periodBy.get(p + k);
      if (!per) return false;
      if (k < u.len - 1 && per.blocksDouble) return false;
    }
    return true;
  };
  const dayTotal = (key: string) =>
    (dayCount.get(key) ?? []).reduce((a, b) => a + (b > 0 ? 1 : 0), 0);

  /** Hart zulässig? Liefert den Raum (oder null) bzw. undefined, wenn nicht. */
  const feasible = (u: Unit, wd: number, p: number): string | null | undefined => {
    if (!gridOk(u, wd, p)) return undefined;
    for (let k = 0; k < u.len; k++) {
      if (blockedHard(u, wd, p + k)) return undefined;
      const m = occ.get(cell(wd, p + k));
      if (m) for (const a of u.atoms) if (m.has(a)) return undefined;
    }
    const tMax = hardMaxTeacher.get(u.teacherId);
    if (tMax !== undefined && dayTotal(`T:${u.teacherId}|${wd}`) + u.len > tMax) return undefined;
    for (const c of u.classKeys) {
      const cMax = classMax(hardMaxClass, c);
      if (cMax !== Infinity && dayTotal(`C:${c}|${wd}`) + u.len > cMax) return undefined;
    }
    return pickRoom(u, wd, p);
  };
  const roomFree = (room: string, wd: number, p: number, len: number) => {
    for (let k = 0; k < len; k++) if (occ.get(cell(wd, p + k))?.has(`r:${room}`)) return false;
    return true;
  };
  const pickRoom = (u: Unit, wd: number, p: number): string | null | undefined => {
    for (const r of u.rooms) {
      const cap = roomCap.get(r);
      if (cap !== null && cap !== undefined && u.size > cap) continue;
      if (roomFree(r, wd, p, u.len)) return r;
    }
    return u.roomHard ? undefined : null;
  };

  const place = (u: Unit, at: Placement) => {
    for (let k = 0; k < u.len; k++) {
      const m = own(cell(at.wd, at.p + k));
      for (const a of u.atoms) m.set(a, u.uid);
      if (at.room) m.set(`r:${at.room}`, u.uid);
    }
    markDay(unitKeys(u), at.wd, at.p, u.len, 1);
    placed.set(u.uid, at);
  };
  const unplace = (u: Unit) => {
    const at = placed.get(u.uid);
    if (!at) return;
    for (let k = 0; k < u.len; k++) {
      const m = occ.get(cell(at.wd, at.p + k))!;
      for (const a of u.atoms) m.delete(a);
      if (at.room) m.delete(`r:${at.room}`);
    }
    markDay(unitKeys(u), at.wd, at.p, u.len, -1);
    placed.delete(u.uid);
  };

  // ── Weiche Kosten der betroffenen Tage
  const gapsOf = (a: number[] | undefined) => {
    if (!a) return { n: 0, gaps: 0 };
    let first = -1;
    let last = -1;
    let n = 0;
    for (let p = 1; p < a.length; p++)
      if (a[p]! > 0) {
        if (first < 0) first = p;
        last = p;
        n++;
      }
    return { n, gaps: n ? last - first + 1 - n : 0 };
  };
  const classDayCost = (c: string, wd: number) => {
    const { n, gaps } = gapsOf(dayCount.get(`C:${c}|${wd}`));
    const load = Math.min(input.dayLoadMax, classMax(softMaxClass, c));
    return (
      gaps * (noGapsHard ? W.gapStudentHard : W.gapStudent) + Math.max(0, n - load) * W.dayLoad
    );
  };
  const teacherDayCost = (t: string, wd: number) => {
    const { n, gaps } = gapsOf(dayCount.get(`T:${t}|${wd}`));
    const soft = softMaxTeacher.get(t);
    return gaps * W.gapTeacher + (soft !== undefined ? Math.max(0, n - soft) * W.softWish : 0);
  };
  const subjectDayCost = (key: string) => {
    const blocks = [...(subjectBlocks.get(key) ?? [])].sort((a, b) => a[0] - b[0]);
    let separate = blocks.length ? 1 : 0;
    for (let i = 1; i < blocks.length; i++)
      if (blocks[i]![0] !== blocks[i - 1]![0] + blocks[i - 1]![1]) separate++;
    return Math.max(0, separate - 1) * W.sameSubject;
  };
  const localCost = (u: Unit, wd: number) =>
    u.classKeys.reduce((s, c) => s + classDayCost(c, wd), 0) +
    teacherDayCost(u.teacherId, wd) +
    ((u.classId ?? u.groupId)
      ? subjectDayCost(`${u.classId ?? u.groupId}|${u.subjectId}|${wd}`)
      : 0);
  const slotCost = (u: Unit, at: Placement) => {
    let c = at.p * W.latePeriod;
    for (let k = 0; k < u.len; k++) c += softWishCost(u, at.wd, at.p + k);
    if (u.rooms.length && (!at.room || !u.rooms.includes(at.room))) c += W.softWish;
    return c;
  };
  /** Mehrkosten, wenn u an `at` liegt (u ist dabei nicht platziert). */
  const deltaFor = (u: Unit, at: Placement) => {
    const before = localCost(u, at.wd);
    place(u, at);
    const after = localCost(u, at.wd);
    unplace(u);
    return after - before + slotCost(u, at);
  };

  const candidates = (u: Unit): Placement[] => {
    const out: Placement[] = [];
    for (const wd of weekdays)
      for (const p of periodNos) {
        const room = feasible(u, wd, p);
        if (room !== undefined) out.push({ wd, p, room });
      }
    return out;
  };
  const best = (u: Unit, list: Placement[]): Placement | null => {
    let top: Placement | null = null;
    let topCost = Infinity;
    for (const at of list) {
      const c = deltaFor(u, at) + rng() * 1e-6; // Gleichstand per Startwert auflösen
      if (c < topCost) {
        topCost = c;
        top = at;
      }
    }
    return top;
  };

  // ── 1. Reihenfolge: wenigste Möglichkeiten zuerst
  const domain = new Map(units.map((u) => [u.uid, candidates(u).length]));
  const order = [...units].sort(
    (a, b) => domain.get(a.uid)! - domain.get(b.uid)! || b.len - a.len || a.uid - b.uid,
  );

  // ── 2./3. Gierig platzieren, Sackgassen reparieren
  const unplaced: Unit[] = [];
  let repaired = 0;
  const blockersAt = (u: Unit, wd: number, p: number): Set<number> | null => {
    if (!gridOk(u, wd, p)) return null;
    const who = new Set<number>();
    for (let k = 0; k < u.len; k++) {
      if (blockedHard(u, wd, p + k)) return null;
      const m = occ.get(cell(wd, p + k));
      if (!m) continue;
      for (const a of u.atoms) {
        const owner = m.get(a);
        if (owner === -1) return null;
        if (owner !== undefined) who.add(owner);
      }
    }
    return who;
  };
  const tryRepair = (u: Unit): boolean => {
    const options: { wd: number; p: number; blockers: number[] }[] = [];
    for (const wd of weekdays)
      for (const p of periodNos) {
        const b = blockersAt(u, wd, p);
        if (b && b.size > 0 && b.size <= 2) options.push({ wd, p, blockers: [...b] });
      }
    options.sort((a, b) => a.blockers.length - b.blockers.length || a.wd - b.wd || a.p - b.p);
    for (const opt of options.slice(0, 12)) {
      const moved = opt.blockers.map((uid) => ({ u: units[uid]!, at: placed.get(uid)! }));
      for (const m of moved) unplace(m.u);
      const room = feasible(u, opt.wd, opt.p);
      if (room === undefined) {
        for (const m of moved) place(m.u, m.at);
        continue;
      }
      place(u, { wd: opt.wd, p: opt.p, room });
      const ok = moved.every((m) => {
        const at = best(m.u, candidates(m.u));
        if (!at) return false;
        place(m.u, at);
        return true;
      });
      if (ok) return true;
      for (const m of moved) unplace(m.u);
      unplace(u);
      for (const m of moved) place(m.u, m.at);
    }
    return false;
  };

  for (const u of order) {
    const at = best(u, candidates(u));
    if (at) place(u, at);
    else if (tryRepair(u)) repaired++;
    else unplaced.push(u);
  }

  // ── 4. Lokale Suche: Einheit an den günstigsten Platz verschieben (gleiche Kosten zählen als Fortschritt nicht)
  const movable = units.filter((u) => placed.has(u.uid));
  const iterations = input.iterations ?? Math.min(20_000, 30 * movable.length);
  for (let i = 0; i < iterations && movable.length > 0; i++) {
    const u = movable[Math.floor(rng() * movable.length)]!;
    const from = placed.get(u.uid)!;
    unplace(u);
    const stay = deltaFor(u, from);
    const list = candidates(u);
    let target = from;
    let targetCost = stay;
    for (const at of list) {
      if (at.wd === from.wd && at.p === from.p) continue;
      const c = deltaFor(u, at);
      if (c < targetCost - 1e-9 || (c === targetCost && rng() < 0.05)) {
        target = at;
        targetCost = c;
      }
    }
    place(u, feasible(u, target.wd, target.p) === undefined ? from : target);
  }
  // Ungeplante zum Schluss noch einmal versuchen (Plätze können frei geworden sein)
  const stillUnplaced = unplaced.filter((u) => {
    const at = best(u, candidates(u));
    if (at) {
      place(u, at);
      return false;
    }
    return !tryRepair(u);
  });

  // ── Ergebnis
  const lessons: PlannedLesson[] = units
    .filter((u) => placed.has(u.uid))
    .map((u) => {
      const at = placed.get(u.uid)!;
      return {
        id: `plan-${u.uid}`,
        requirementId: u.requirementId,
        weekday: at.wd,
        periodStart: at.p,
        periodCount: u.len,
        weekPattern: 'EVERY' as const,
        subjectId: u.subjectId,
        classId: u.classId,
        groupId: u.groupId,
        roomId: at.room,
        teacherIds: [u.teacherId],
      };
    })
    .sort(
      (a, b) => a.weekday - b.weekday || a.periodStart - b.periodStart || a.id.localeCompare(b.id),
    );

  let cost = 0;
  const days = new Set<string>();
  for (const u of units)
    if (placed.has(u.uid)) {
      const at = placed.get(u.uid)!;
      cost += slotCost(u, at);
      for (const c of u.classKeys) days.add(`C|${c}|${at.wd}`);
      days.add(`T|${u.teacherId}|${at.wd}`);
      if (u.classId ?? u.groupId) days.add(`S|${u.classId ?? u.groupId}|${u.subjectId}|${at.wd}`);
    }
  for (const d of days) {
    const [k, a, b, c] = d.split('|');
    if (k === 'C') cost += classDayCost(a!, Number(b));
    else if (k === 'T') cost += teacherDayCost(a!, Number(b));
    else cost += subjectDayCost(`${a}|${b}|${c}`);
  }

  return {
    lessons,
    unplaced: stillUnplaced.map((u) => ({
      requirementId: u.requirementId,
      periodCount: u.len,
      reason: explain(u),
    })),
    cost: Math.round(cost * 100) / 100,
    stats: { units: units.length, placed: lessons.length, repaired, iterations },
  };

  /** Warum passt eine Einheit nirgends hin? (im Endzustand bestimmt) */
  function explain(u: Unit): UnplacedReason {
    const teacherAtom = `t:${u.teacherId}`;
    const others = u.atoms.filter((a) => a !== teacherAtom);
    let teacherFree = 0;
    let classFree = 0;
    let common = 0;
    let commonSingle = 0;
    let roomOk = 0;
    for (const wd of weekdays)
      for (const p of periodNos) {
        const ok = gridOk(u, wd, p);
        const freeFor = (atoms: string[], len: number) => {
          for (let k = 0; k < len; k++) {
            const m = occ.get(cell(wd, p + k));
            if (m && atoms.some((a) => m.has(a))) return false;
          }
          return true;
        };
        const tOk = !blockedHard(u, wd, p) && freeFor([teacherAtom], 1);
        const cOk = freeFor(others, 1);
        if (tOk) teacherFree++;
        if (cOk) classFree++;
        if (tOk && cOk) commonSingle++;
        if (
          ok &&
          freeFor(u.atoms, u.len) &&
          ![...Array(u.len).keys()].some((k) => blockedHard(u, wd, p + k))
        ) {
          common++;
          if (pickRoom(u, wd, p) !== undefined) roomOk++;
        }
      }
    if (teacherFree === 0) return 'TEACHER_FULL';
    if (classFree === 0) return 'CLASS_FULL';
    if (commonSingle === 0) return 'NO_COMMON_SLOT';
    if (u.len > 1 && common === 0) return 'NO_DOUBLE';
    if (common > 0 && roomOk === 0) return 'NO_ROOM';
    return 'WISHES';
  }
}

/** Satz für die Oberfläche, z. B. "Mathe 3A: keine freie Zeit, in der Lehrkraft und Klasse gleichzeitig frei sind". */
export function unplacedMessage(reason: UnplacedReason, subject: string, who: string): string {
  const text: Record<UnplacedReason, string> = {
    TEACHER_FULL: 'die Lehrkraft hat keine freie Stunde mehr',
    CLASS_FULL: 'die Klasse hat keine freie Stunde mehr',
    NO_COMMON_SLOT: 'keine freie Zeit, in der Lehrkraft und Klasse gleichzeitig frei sind',
    NO_DOUBLE: 'keine Doppelstunde ohne Pause dazwischen frei',
    NO_ROOM: 'kein passender Raum frei',
    WISHES: 'die Planungswünsche (Höchststunden, gesperrte Stunden) lassen keinen Platz',
  };
  return `${subject} ${who}: ${text[reason]}`;
}
