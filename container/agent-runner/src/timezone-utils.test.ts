/**
 * Test suite for timezone context generation.
 * Validates that the Agent receives correct date/time in specified timezone.
 */

import { describe, it, expect } from 'vitest';
import { generateTimezoneContext } from './timezone-utils.js';

describe('Timezone Context Generation', () => {
  /**
   * Test Case 1: Korea Timezone (UTC+9)
   * 
   * Test scenario: When UTC time is March 10, 00:30 UTC
   * Expected in Korea: March 10, 09:30 KST (Monday)
   * 
   * This was the original bug - the Agent was receiving UTC date (March 10)
   * instead of Korea local date (March 10).
   */
  it('should correctly format Korea timezone (UTC+9)', () => {
    // March 10, 2026, 00:30 UTC = March 10, 2026, 09:30 Korea Standard Time
    // March 10, 2026 is a Tuesday in both UTC and Korea timezone
    const utcDate = new Date('2026-03-10T00:30:00Z');
    
    const context = generateTimezoneContext(utcDate, 'Asia/Seoul');
    
    expect(context).toContain('2026-03-10');
    expect(context).toContain('Tuesday');
    expect(context).toContain('09:30');
    expect(context).toContain('Asia/Seoul');
  });

  /**
   * Test Case 2: Edge Case - Date boundary crossing (near midnight UTC)
   * 
   * Test scenario: When UTC time is March 9, 16:00 UTC
   * Expected in Korea: March 10, 01:00 KST (crosses to next day!)
   * 
   * This tests the original bug scenario more clearly:
   * If the Agent used UTC date (March 9), it would calculate schedules for the wrong date.
   * But in Korea, it's already March 10 (Tuesday).
   */
  it('should handle timezone boundary crossing (UTC+9 shifts to next day)', () => {
    // March 9, 2026, 16:00 UTC = March 10, 2026, 01:00 Korea Standard Time
    // March 9 is Monday UTC, but March 10 is Tuesday in Korea
    const utcDate = new Date('2026-03-09T16:00:00Z');
    
    const context = generateTimezoneContext(utcDate, 'Asia/Seoul');
    
    // Should show Korea local date (March 10), not UTC date (March 9)
    expect(context).toContain('2026-03-10');
    expect(context).toContain('Tuesday');
    expect(context).toContain('01:00');
    expect(context).toContain('Asia/Seoul');
  });

  /**
   * Test Case 3: UTC Timezone (no offset)
   * 
   * Test scenario: Verify UTC timezone works correctly (should match input date exactly)
   */
  it('should correctly format UTC timezone (no offset)', () => {
    const utcDate = new Date('2026-03-10T15:45:00Z');
    
    const context = generateTimezoneContext(utcDate, 'UTC');
    
    expect(context).toContain('2026-03-10');
    expect(context).toContain('15:45');
    expect(context).toContain('UTC');
  });

  /**
   * Test Case 4: US Eastern Time (UTC-5 during Standard Time)
   * 
   * Test scenario: Verify negative offset timezone works
   */
  it('should correctly format US Eastern timezone (UTC-5)', () => {
    // March 10, 2026, 15:00 UTC = March 10, 2026, 10:00 EST (previous hour)
    const utcDate = new Date('2026-03-10T15:00:00Z');
    
    const context = generateTimezoneContext(utcDate, 'America/New_York');
    
    // EDT starts March 9, 2026, so March 10 is EDT (UTC-4)
    // March 10, 15:00 UTC = March 10, 11:00 EDT
    expect(context).toContain('2026-03-10');
    expect(context).toContain('11:00');
    expect(context).toContain('America/New_York');
  });

  /**
   * Test Case 5: Format validation
   * 
   * Test scenario: Verify the output format matches expected structure
   */
  it('should have correct format with all required components', () => {
    const utcDate = new Date('2026-03-10T12:34:00Z');
    const context = generateTimezoneContext(utcDate, 'Asia/Seoul');
    
    // Check for required format components
    expect(context).toContain('[TIMEZONE INFO:');
    expect(context).toContain('Current date is');
    expect(context).toMatch(/\d{4}-\d{2}-\d{2}/); // YYYY-MM-DD
    expect(context).toMatch(/\(\w+\)/); // Day of week in parentheses
    expect(context).toContain('time is');
    expect(context).toContain('Asia/Seoul');
    expect(context).toContain('Use this for scheduling and date calculations');
  });

  /**
   * Test Case 6: Original bug scenario verification
   * 
   * Test scenario: Exact reproduction of the bug report
   * User reported: "March 10을 월요일이라고 말합니다" (says March 10 is Monday)
   * But March 10, 2026 is actually Tuesday
   * 
   * This test verifies the fix correctly shows Tuesday for March 10, 2026 in Korea timezone.
   */
  it('should NOT say March 10 is Monday (original bug reproduction)', () => {
    // Any UTC time on March 10, 2026 converted to Korea timezone
    const utcDate = new Date('2026-03-10T08:00:00Z');
    
    const context = generateTimezoneContext(utcDate, 'Asia/Seoul');
    
    // Should NOT contain "Monday"
    expect(context).not.toContain('Monday');
    // Should contain "Tuesday" because March 10, 2026 is Tuesday
    expect(context).toContain('Tuesday');
    expect(context).toContain('2026-03-10');
  });

  /**
   * Test Case 7: March 9, 2026 should be Monday in Korea timezone
   * 
   * Test scenario: Verify the date BEFORE March 10 shows as Monday
   */
  it('should correctly show March 9 as Monday in Korea timezone', () => {
    // Any UTC time during March 9, 2026 converted to Korea timezone
    // Note: In Korea, March 9 becomes March 9 (still Monday)
    // because Korea is ahead but March 9 14:00 UTC = March 10 23:00 KST
    const utcDate = new Date('2026-03-09T00:00:00Z');
    
    const context = generateTimezoneContext(utcDate, 'Asia/Seoul');
    
    // March 9, 2026 09:00 KST is Monday
    expect(context).toContain('2026-03-09');
    expect(context).toContain('Monday');
  });

  /**
   * Test Case 8: Verify that the function produces a consistent format
   * 
   * Test scenario: Output should always follow the pattern:
   * [TIMEZONE INFO: Current date is YYYY-MM-DD (Day), time is HH:MM in TIMEZONE. ...]
   */
  it('should produce output in consistent format', () => {
    const utcDate = new Date('2026-03-10T10:15:30Z');
    const context = generateTimezoneContext(utcDate, 'Asia/Seoul');
    
    // Verify structure: [TIMEZONE INFO: Current date is ... time is ... in ... timezone. ...]
    expect(context.startsWith('[TIMEZONE INFO:')).toBe(true);
    expect(context.includes('Current date is')).toBe(true);
    expect(context.includes('time is')).toBe(true);
    expect(context.includes('in Asia/Seoul timezone')).toBe(true);
    expect(context.endsWith('Use this for scheduling and date calculations.]')).toBe(true);
  });
});
