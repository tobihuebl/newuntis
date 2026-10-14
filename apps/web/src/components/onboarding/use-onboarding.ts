'use client';
import type { OnboardingState, OnboardingStepState, StepUpdateInput } from '@sp/shared';
import { useApi, useApiMutation } from '../../lib/use-api';

export const ONBOARDING_KEY = ['onboarding'];

/** Stand der eigenen Onboarding-Flows (ADR 0020). */
export function useOnboarding(enabled = true) {
  return useApi<OnboardingState>(ONBOARDING_KEY, enabled ? '/me/onboarding' : null);
}

/** Fortschritt eines Schritts melden (VIEWED, DONE, SKIPPED, OPEN). */
export function useStepUpdate() {
  return useApiMutation<StepUpdateInput>('POST', () => '/me/onboarding/steps', [ONBOARDING_KEY]);
}

/** Erste Anzeige melden (step_viewed): ohne Neuladen des Stands, sonst entstünde eine Schleife. */
export function useStepViewed() {
  return useApiMutation<{ stepId: string; status: 'VIEWED' }>('POST', () => '/me/onboarding/steps');
}

/** Ziel eines Schritts mit Coachmark (?tour=<id>). */
export function tourHref(s: Pick<OnboardingStepState, 'href' | 'id'>): string | null {
  if (!s.href) return null;
  return `${s.href}${s.href.includes('?') ? '&' : '?'}tour=${s.id}`;
}

/** Schritte im Ablauf /willkommen: Willkommen und Einrichtung, die man selbst bestätigt. */
export const isFlowScreen = (s: OnboardingStepState) =>
  (s.phase === 'welcome' || s.phase === 'setup') && !s.auto;
