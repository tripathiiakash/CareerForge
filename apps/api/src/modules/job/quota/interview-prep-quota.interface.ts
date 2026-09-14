export interface QuotaReservation {
  reservationId: string;
}

export interface IInterviewPrepQuotaStore {
  /**
   * Atomically reserve one of the student's 3 daily slots for a job.
   * Returns QuotaReservation if slot reserved, or null if daily quota (3/day) reached.
   */
  reserveSlot(
    studentId: string,
    jobId: string,
    dateOverride?: string
  ): Promise<QuotaReservation | null>;

  /**
   * Refunds a reserved slot if provider/network/infrastructure fails.
   */
  refundSlot(reservationId: string): Promise<void>;

  /**
   * Returns current count of interview prep calls for the student for the given UTC date.
   */
  getUsageToday(studentId: string, dateOverride?: string): Promise<number>;

  /**
   * Resets quota usage for tests/administrative purposes.
   */
  resetUsage?(studentId: string, dateOverride?: string): Promise<void>;
}

export const INTERVIEW_PREP_QUOTA_STORE_TOKEN = Symbol(
  'INTERVIEW_PREP_QUOTA_STORE_TOKEN'
);
