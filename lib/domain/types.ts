/**
 * Domain types. Field names mirror the Supabase schema in
 * supabase/migrations/0001_init.sql (camelCase here, snake_case there).
 */
export type Sport = 'tennis' | 'padel' | 'pickleball';
export type Group = 'junior' | 'adult';
/** 1 Iniciación · 2 Intermedio · 3 Avanzado · 4 Competición */
export type Level = 1 | 2 | 3 | 4;
/** ISO weekday: 1 = Monday … 7 = Sunday */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
/** Local calendar date, YYYY-MM-DD */
export type ISODate = string;

export interface Academy {
  id: string;
  name: string;
  /** Classes may only start inside this window (24h). */
  dayStartHour: number;
  dayEndHour: number;
  classDurationMin: number;
  openWeekdays: Weekday[];
  season: {id: string; label: string; start: ISODate; end: ISODate};
  /** Days a make-up credit stays valid after the missed class. null = never expires. */
  makeupExpiryDays: number | null;
  /** Most make-up credits one student can earn in a season. null = no limit. */
  makeupCapPerSeason: number | null;
  /**
   * When a group is too small to run on its own it may take students from the
   * level right above or below. A group counts as small at `maxGroupSize`
   * students or fewer.
   */
  mixLevels: {enabled: boolean; maxGroupSize: number};
}

export interface Location {
  id: string;
  name: string;
  short: string;
  city: string;
  lat: number;
  lon: number;
}

export interface Court {
  id: string;
  locationId: string;
  name: string;
  short: string;
  sport: Sport;
  /** Covered courts are not affected by rain. */
  covered: boolean;
}

export interface Coach {
  id: string;
  firstName: string;
  lastName: string;
  sports: Sport[];
  /** Entrenador referente: the admin's point of contact for a location. */
  isLead: boolean;
  locationId: string;
}

export interface Family {
  id: string;
  name: string;
  /** Account holder. May or may not be a student. */
  holderName: string;
  holderStudentId: string | null;
  phone: string;
  email: string;
}

export interface Availability {
  weekdays: Weekday[];
  fromHour: number;
  toHour: number;
}

export type StudentStatus =
  | 'trial' // free trial class booked, level not assessed yet
  | 'pending' // level assessed, waiting for a weekly schedule
  | 'active'; // enrolled in at least one weekly class

export interface Student {
  id: string;
  familyId: string;
  firstName: string;
  lastName: string;
  birthDate: ISODate;
  group: Group;
  sport: Sport;
  level: Level | null;
  status: StudentStatus;
  availability: Availability;
  /** Classes per week the student wants. */
  frequency: 1 | 2 | 3;
  homeLocationId: string;
  trialDate: ISODate;
  phone: string | null;
  email: string | null;
  notes: string | null;
}

/** A weekly recurring class for the whole season. */
export interface ClassTemplate {
  id: string;
  locationId: string;
  courtId: string;
  coachId: string;
  sport: Sport;
  group: Group;
  level: Level;
  weekday: Weekday;
  startHour: number;
  capacity: number;
}

export interface Enrollment {
  id: string;
  studentId: string;
  classId: string;
  from: ISODate;
  to: ISODate | null;
}

/** A change that applies to one dated session of a weekly class. */
export interface SessionOverride {
  classId: string;
  date: ISODate;
  cancelled?: 'weather' | 'other';
  coachId?: string;
  courtId?: string;
}

/** Only these two reasons give the right to a make-up class. */
export type MakeupReason = 'weather' | 'medical';

export interface Absence {
  id: string;
  studentId: string;
  classId: string;
  date: ISODate;
  reason: 'medical' | 'other';
  /** A medical absence only counts once the certificate is received. */
  certificate: boolean;
}

export interface MakeupCredit {
  id: string;
  studentId: string;
  reason: MakeupReason;
  originClassId: string;
  originDate: ISODate;
  status: 'open' | 'booked';
  bookedClassId: string | null;
  bookedDate: ISODate | null;
}

export interface ProgramWeek {
  weekNumber: number;
  block: string;
  title: string;
  goal: string;
}

export interface Dataset {
  academy: Academy;
  locations: Location[];
  courts: Court[];
  coaches: Coach[];
  families: Family[];
  students: Student[];
  classes: ClassTemplate[];
  enrollments: Enrollment[];
  overrides: SessionOverride[];
  absences: Absence[];
  credits: MakeupCredit[];
}
