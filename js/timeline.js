import { el } from './dom.js';

const YEAR_MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * "2025-05" becomes a single number of months, so months can be compared and
 * counted with plain arithmetic instead of Date objects and time zones.
 *
 * @param {string} value
 */
export function toMonthIndex(value) {
  const match = YEAR_MONTH.exec(value);
  if (!match) throw new RangeError(`Expected YYYY-MM, got "${value}"`);
  return Number(match[1]) * 12 + Number(match[2]) - 1;
}

/** @param {Date} date */
export function toYearMonth(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * @typedef {{ label: string, from: string, to: string }} Period  from and to are inclusive, YYYY-MM
 * @typedef {{
 *   year: number,
 *   month: number,                               1 to 12
 *   state: 'internship' | 'past' | 'future',
 *   label: string | null,                        name of the internship, if any
 *   current: boolean,
 * }} TimelineMonth
 */

/**
 * One entry per month from `start` to `end`, both inclusive.
 *
 * @param {{ start: string, end: string, periods?: Period[], today: string }} options
 * @returns {TimelineMonth[]}
 */
export function buildTimeline({ start, end, periods = [], today }) {
  const first = toMonthIndex(start);
  const last = toMonthIndex(end);
  if (last < first) throw new RangeError(`"${end}" is before "${start}"`);

  const now = toMonthIndex(today);
  const ranges = periods.map((period) => ({
    label: period.label,
    from: toMonthIndex(period.from),
    to: toMonthIndex(period.to),
  }));

  const months = [];
  for (let index = first; index <= last; index += 1) {
    const period = ranges.find((range) => index >= range.from && index <= range.to);
    months.push({
      year: Math.floor(index / 12),
      month: (index % 12) + 1,
      state: period ? 'internship' : index <= now ? 'past' : 'future',
      label: period?.label ?? null,
      current: index === now,
    });
  }
  return months;
}

/**
 * Groups consecutive months into calendar years: where each year's label
 * starts and how many columns it covers.
 *
 * @param {TimelineMonth[]} months
 * @returns {{ year: number, column: number, span: number }[]}
 */
export function yearSpans(months) {
  const spans = [];
  months.forEach((month, position) => {
    const open = spans.at(-1);
    if (open?.year === month.year) open.span += 1;
    else spans.push({ year: month.year, column: position + 1, span: 1 });
  });
  return spans;
}

/**
 * Draws the degree timeline. The page stays the single source of truth:
 * the range comes from the figure's data attributes and each internship from
 * the <time> elements of an entry marked with `data-timeline-period`.
 *
 * @param {HTMLElement} figure
 * @param {{ today?: Date }} [options]
 */
export function initTimeline(figure, { today = new Date() } = {}) {
  const chart = figure.querySelector('.strip__chart');

  const periods = [...document.querySelectorAll('[data-timeline-period]')].map((entry) => {
    const [from, to] = entry.querySelectorAll('time[datetime]');
    return { label: entry.dataset.timelinePeriod, from: from.dateTime, to: to.dateTime };
  });

  const months = buildTimeline({
    start: figure.dataset.start,
    end: figure.dataset.end,
    periods,
    today: toYearMonth(today),
  });

  const monthName = new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' });

  chart.style.setProperty('--months', String(months.length));
  chart.setAttribute('role', 'img');
  chart.setAttribute('aria-label', 'Degree timeline, one block per month');

  months.forEach((month, position) => {
    const name = monthName.format(Date.UTC(month.year, month.month - 1));
    const block = el('span', {
      class: month.current ? 'strip__month is-current' : 'strip__month',
      data: { state: month.state },
      title: month.label ? `${name} · ${month.label}` : name,
    });
    block.style.gridArea = `1 / ${position + 1}`;
    chart.append(block);
  });

  for (const { year, column, span } of yearSpans(months)) {
    const label = el('span', { class: 'strip__year', text: String(year) });
    label.style.gridArea = `2 / ${column} / auto / span ${span}`;
    chart.append(label);
  }

  const position = months.findIndex((month) => month.current) + 1;
  if (position > 0) {
    figure
      .querySelector('figcaption')
      .append(el('span', { class: 'strip__key', text: `Now: month ${position} of ${months.length}` }));
  }

  figure.hidden = false;
}
