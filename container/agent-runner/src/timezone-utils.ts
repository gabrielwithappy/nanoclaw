/**
 * Timezone utilities for generating timezone context for the Agent.
 * Extracted to a separate module for easy testing.
 */

/**
 * Generates timezone context string with current date/time in specified timezone.
 * 
 * @param now - Current Date object (can be mocked for testing)
 * @param userTz - User's timezone string (e.g., 'Asia/Seoul', 'UTC')
 * @returns Timezone context string to be injected into Agent prompt
 */
export function generateTimezoneContext(now: Date, userTz: string): string {
  const currentDateLocal = now.toLocaleString('en-CA', { 
    timeZone: userTz 
  }).split(',')[0];
  
  const currentTimeLocal = now.toLocaleString('en-CA', { 
    timeZone: userTz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  
  const dayOfWeek = now.toLocaleString('en-US', { 
    weekday: 'long', 
    timeZone: userTz 
  });
  
  return `[TIMEZONE INFO: Current date is ${currentDateLocal} (${dayOfWeek}), time is ${currentTimeLocal} in ${userTz} timezone. Use this for scheduling and date calculations.]`;
}
