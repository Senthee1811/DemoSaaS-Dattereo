/**
 * Onboarding (workspace setup) completion — the one check everything uses.
 *
 * The setup wizard (app/onboarding) records completion by setting
 * spendguard_onboarding_state = ONBOARDING_COMPLETED. That flag is per-browser, so an
 * org that already has a project (what the wizard creates) also counts as set up — a
 * user on a new device must never be sent back through setup.
 *
 * The product tour has its own flag (spendguard_tour_completed) and never writes the
 * onboarding state.
 */
export const ONBOARDING_STATE_KEY = 'spendguard_onboarding_state';
export const ONBOARDING_COMPLETED = 'ONBOARDING_COMPLETED';
export const TOUR_COMPLETED_KEY = 'spendguard_tour_completed';

export function hasCompletedOnboarding(input: { onboardingState: string | null; projectCount: number }): boolean {
  return input.onboardingState === ONBOARDING_COMPLETED || input.projectCount > 0;
}

/**
 * Where the user goes when the tour's last step is finished. While the project list is
 * still loading the answer is unknown, and the safe default is to stay on the console.
 */
export function destinationAfterTour(input: {
  onboardingState: string | null;
  projectCount: number;
  projectsLoaded: boolean;
}): 'console' | 'onboarding' {
  if (!input.projectsLoaded) return 'console';
  return hasCompletedOnboarding(input) ? 'console' : 'onboarding';
}
