import { Pipe, PipeTransform } from '@angular/core';

/**
 * Formats a UTC ISO-8601 date/time string for display.
 *
 * Primary output: UTC time with an explicit "UTC" label so operators
 * always see the canonical timestamp regardless of their local timezone.
 *
 * Optional secondary: appends the local equivalent in parentheses.
 *
 * Usage in templates:
 *   {{ item.checkedAtUtc | displayTime }}             → "2 Nov 2026, 08:14:55 UTC"
 *   {{ item.checkedAtUtc | displayTime : true }}      → "2 Nov 2026, 08:14:55 UTC (10:14:55 AM local)"
 *   {{ item.checkedAtUtc | displayTime : false : 'ar' }}  → Arabic locale UTC
 */
@Pipe({
  name: 'displayTime',
  standalone: true,
  pure: true,
})
export class DisplayTimePipe implements PipeTransform {
  transform(
    value: string | Date | null | undefined,
    showLocal = false,
    locale = 'en-GB'
  ): string {
    if (value === null || value === undefined || value === '') {
      return '—';
    }

    const date = typeof value === 'string' ? new Date(value) : value;

    if (isNaN(date.getTime())) {
      return String(value);
    }

    const utcPart = date.toLocaleString(locale, {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const primary = `${utcPart} UTC`;

    if (!showLocal) return primary;

    const localPart = date.toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    return `${primary} (${localPart} local)`;
  }
}
