import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { buildTimeline, toMonthIndex, toYearMonth, yearSpans } from '../js/timeline.js';

const degree = {
  start: '2024-08',
  end: '2028-05',
  periods: [
    { label: 'Inteltion internship', from: '2025-05', to: '2025-07' },
    { label: 'SKY ICT internship', from: '2026-05', to: '2026-07' },
  ],
};

describe('toMonthIndex', () => {
  test('consecutive months differ by one, across a year boundary too', () => {
    assert.equal(toMonthIndex('2025-01') - toMonthIndex('2024-12'), 1);
    assert.equal(toMonthIndex('2028-05') - toMonthIndex('2024-08'), 45);
  });

  test('rejects anything that is not YYYY-MM', () => {
    for (const bad of ['2025', '2025-13', '2025-00', '2025-5', 'May 2025', '']) {
      assert.throws(() => toMonthIndex(bad), RangeError, bad);
    }
  });
});

test('toYearMonth pads the month', () => {
  assert.equal(toYearMonth(new Date(2026, 2, 9)), '2026-03');
});

describe('buildTimeline', () => {
  const months = buildTimeline({ ...degree, today: '2026-11' });
  const at = (year, month) => months.find((entry) => entry.year === year && entry.month === month);

  test('covers every month, both ends included', () => {
    assert.equal(months.length, 46);
    assert.deepEqual([months[0].year, months[0].month], [2024, 8]);
    assert.deepEqual([months.at(-1).year, months.at(-1).month], [2028, 5]);
  });

  test('marks internship months with their label', () => {
    assert.equal(months.filter((entry) => entry.state === 'internship').length, 6);
    assert.equal(at(2025, 5).label, 'Inteltion internship');
    assert.equal(at(2026, 7).label, 'SKY ICT internship');
    assert.equal(at(2025, 8).state, 'past');
  });

  test('splits past from future at the current month', () => {
    assert.equal(at(2026, 11).state, 'past');
    assert.equal(at(2026, 11).current, true);
    assert.equal(at(2026, 12).state, 'future');
    assert.equal(months.filter((entry) => entry.current).length, 1);
    assert.equal(months.findIndex((entry) => entry.current) + 1, 28);
  });

  test('has no current month before the start or after the end', () => {
    for (const today of ['2020-01', '2030-01']) {
      assert.ok(buildTimeline({ ...degree, today }).every((entry) => !entry.current), today);
    }
  });

  test('refuses a range that runs backwards', () => {
    assert.throws(() => buildTimeline({ start: '2025-02', end: '2025-01', today: '2025-01' }), RangeError);
  });
});

test('yearSpans gives each year its first column and width', () => {
  const months = buildTimeline({ ...degree, today: '2026-11' });
  assert.deepEqual(yearSpans(months), [
    { year: 2024, column: 1, span: 5 },
    { year: 2025, column: 6, span: 12 },
    { year: 2026, column: 18, span: 12 },
    { year: 2027, column: 30, span: 12 },
    { year: 2028, column: 42, span: 5 },
  ]);
});
