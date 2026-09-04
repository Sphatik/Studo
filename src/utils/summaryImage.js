import { createCanvas } from '@napi-rs/canvas';

// Dark-surface card palette (validated dataviz defaults for dark mode)
const SURFACE = '#1a1a19';
const SURFACE_RAISED = '#232322';
const TEXT_PRIMARY = '#ffffff';
const TEXT_SECONDARY = '#c3c2b7';
const TEXT_MUTED = '#8a897f';
const BAR = '#3987e5';
const TRACK = '#2e2e2c';
const GOLD = '#c98500';

const WIDTH = 900;
const PAD = 40;
const HEADER_H = 150;
const ROW_H = 64;
const FOOTER_H = 60;
const FONT = 'Noto Sans, DejaVu Sans, sans-serif';

function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function truncate(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
}

/**
 * Renders the daily study summary as a PNG card.
 *
 * @param {object} data
 * @param {string} data.title - Card title.
 * @param {string} data.subtitle - Date/timeframe line under the title.
 * @param {Array<{username: string, minutes: number}>} data.entries
 *   Per-user study time, will be sorted by minutes descending.
 * @param {number} data.totalMinutes - Total voice minutes across all users.
 * @returns {Buffer} PNG buffer.
 */
export function renderStudySummaryImage({ title, subtitle, entries, totalMinutes }) {
  const rows = [...entries].sort((a, b) => b.minutes - a.minutes).slice(0, 10);
  const height = HEADER_H + rows.length * ROW_H + FOOTER_H + PAD;

  const canvas = createCanvas(WIDTH, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = SURFACE;
  ctx.fillRect(0, 0, WIDTH, height);

  // Header
  ctx.fillStyle = TEXT_PRIMARY;
  ctx.font = `700 34px ${FONT}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(title, PAD, PAD + 34);

  ctx.fillStyle = TEXT_SECONDARY;
  ctx.font = `400 18px ${FONT}`;
  ctx.fillText(subtitle, PAD, PAD + 66);

  // Hero number: total study time, right-aligned in header
  ctx.font = `700 44px ${FONT}`;
  ctx.fillStyle = TEXT_PRIMARY;
  const heroText = formatDuration(totalMinutes);
  const heroWidth = ctx.measureText(heroText).width;
  ctx.fillText(heroText, WIDTH - PAD - heroWidth, PAD + 44);

  ctx.font = `400 16px ${FONT}`;
  ctx.fillStyle = TEXT_MUTED;
  const heroLabel = 'total study time';
  ctx.fillText(heroLabel, WIDTH - PAD - ctx.measureText(heroLabel).width, PAD + 70);

  // Divider
  ctx.fillStyle = TRACK;
  ctx.fillRect(PAD, HEADER_H - 16, WIDTH - PAD * 2, 2);

  // Leaderboard rows
  const maxMinutes = Math.max(1, ...rows.map(r => r.minutes));
  const rankW = 44;
  const nameW = 220;
  const valueW = 110;
  const barX = PAD + rankW + nameW + 16;
  const barMaxW = WIDTH - PAD - valueW - barX;

  rows.forEach((row, i) => {
    const y = HEADER_H + i * ROW_H;
    const midY = y + ROW_H / 2;

    if (i % 2 === 1) {
      ctx.fillStyle = SURFACE_RAISED;
      roundRect(ctx, PAD - 12, y + 4, WIDTH - PAD * 2 + 24, ROW_H - 8, 8);
      ctx.fill();
    }

    ctx.font = `700 20px ${FONT}`;
    ctx.fillStyle = i === 0 ? GOLD : TEXT_MUTED;
    ctx.fillText(`#${i + 1}`, PAD, midY + 7);

    ctx.font = `600 20px ${FONT}`;
    ctx.fillStyle = TEXT_PRIMARY;
    ctx.fillText(truncate(ctx, row.username, nameW), PAD + rankW, midY + 7);

    ctx.fillStyle = TRACK;
    roundRect(ctx, barX, midY - 7, barMaxW, 14, 4);
    ctx.fill();

    const barW = Math.max(4, Math.round((row.minutes / maxMinutes) * barMaxW));
    ctx.fillStyle = BAR;
    roundRect(ctx, barX, midY - 7, barW, 14, 4);
    ctx.fill();

    ctx.font = `600 18px ${FONT}`;
    ctx.fillStyle = TEXT_PRIMARY;
    const valueText = formatDuration(row.minutes);
    ctx.fillText(valueText, WIDTH - PAD - ctx.measureText(valueText).width, midY + 1);

  });

  // Footer
  const footerY = HEADER_H + rows.length * ROW_H + 36;
  ctx.font = `400 16px ${FONT}`;
  ctx.fillStyle = TEXT_MUTED;
  ctx.fillText(
    `${entries.length} member(s) active across all servers`,
    PAD,
    footerY
  );

  return canvas.toBuffer('image/png');
}
