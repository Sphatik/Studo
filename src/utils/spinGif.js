import { createCanvas, loadImage } from '@napi-rs/canvas';
// gifenc ships a CJS bundle whose named exports Node cannot statically detect,
// so destructure off the default import.
import gifenc from 'gifenc';

const { GIFEncoder, quantize, applyPalette } = gifenc;

// Matches the palette used by the study summary card.
const SURFACE = '#1a1a19';
const TEXT_PRIMARY = '#ffffff';
const TEXT_MUTED = '#8a897f';
const GOLD = '#c98500';
const GOLD_LIGHT = '#f0b038';
const GOLD_DARK = '#7a5000';
const FONT = 'Noto Sans, DejaVu Sans, sans-serif';

const SIZE = 320;
const HEIGHT = 380;
const RADIUS = 110;
// Virtual thickness of the coin, in pixels, seen edge-on.
const THICKNESS = 22;
const FRAMES = 30;
const DELAY_MS = 50;

function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

/**
 * Draws one frame of the spinning coin.
 *
 * The 3D illusion is a Y-axis rotation projected orthographically: the face is
 * squashed horizontally by cos(angle), and the coin's rim becomes visible in
 * proportion to sin(angle). Past 90 degrees the back plate faces the viewer.
 */
function drawFrame(ctx, img, angle, username, minutes) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const faceRx = Math.max(Math.abs(cos) * RADIUS, 0.5);
  const rimHalf = (Math.abs(sin) * THICKNESS) / 2;
  const cx = SIZE / 2;
  const cy = 150;

  ctx.fillStyle = SURFACE;
  ctx.fillRect(0, 0, SIZE, HEIGHT);

  // Contact shadow, tied to the projected width so it breathes with the spin
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.ellipse(cx, cy + RADIUS + 26, faceRx + rimHalf, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Rim: slightly wider than the face, so the coin reads as a solid disc
  const rimGrad = ctx.createLinearGradient(cx - faceRx - rimHalf, 0, cx + faceRx + rimHalf, 0);
  rimGrad.addColorStop(0, GOLD_DARK);
  rimGrad.addColorStop(0.5, GOLD_LIGHT);
  rimGrad.addColorStop(1, GOLD_DARK);
  ctx.fillStyle = rimGrad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, faceRx + rimHalf, RADIUS, 0, 0, Math.PI * 2);
  ctx.fill();

  // The visible face sits on the leading side of the rim
  const faceX = cx + rimHalf * Math.sign(sin || 1);

  ctx.save();
  ctx.translate(faceX, cy);
  ctx.scale(Math.max(Math.abs(cos), 0.004), 1);
  ctx.beginPath();
  ctx.arc(0, 0, RADIUS, 0, Math.PI * 2);
  ctx.clip();

  if (cos >= 0) {
    // Front: the avatar
    ctx.drawImage(img, -RADIUS, -RADIUS, RADIUS * 2, RADIUS * 2);
  } else {
    // Back: engraved gold plate
    const back = ctx.createRadialGradient(-30, -40, 10, 0, 0, RADIUS);
    back.addColorStop(0, GOLD_LIGHT);
    back.addColorStop(1, GOLD_DARK);
    ctx.fillStyle = back;
    ctx.fillRect(-RADIUS, -RADIUS, RADIUS * 2, RADIUS * 2);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.font = `700 96px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('#1', 0, 4);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();

  // Grazing angles catch less light
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(faceX, cy, faceRx, RADIUS, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = `rgba(0, 0, 0, ${(1 - Math.abs(cos)) * 0.4})`;
  ctx.fillRect(0, 0, SIZE, HEIGHT);

  // Sheen sweeping across the face as it turns
  const sheen = ctx.createLinearGradient(faceX - faceRx, cy - RADIUS, faceX + faceRx, cy + RADIUS);
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0)');
  sheen.addColorStop(Math.min(0.85, Math.max(0.15, (sin + 1) / 2)), 'rgba(255, 255, 255, 0.22)');
  sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, SIZE, HEIGHT);
  ctx.restore();

  // Gold ring outlining the face edge
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(faceX, cy, faceRx, RADIUS, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Caption
  ctx.textAlign = 'center';
  ctx.fillStyle = GOLD;
  ctx.font = `700 20px ${FONT}`;
  ctx.fillText('TOP STUDIER', cx, 300);

  ctx.fillStyle = TEXT_PRIMARY;
  ctx.font = `700 26px ${FONT}`;
  let name = username;
  while (name.length > 1 && ctx.measureText(name).width > SIZE - 40) {
    name = name.slice(0, -1);
  }
  if (name !== username) name = `${name}…`;
  ctx.fillText(name, cx, 332);

  ctx.fillStyle = TEXT_MUTED;
  ctx.font = `400 18px ${FONT}`;
  ctx.fillText(formatDuration(minutes), cx, 358);
  ctx.textAlign = 'left';
}

/**
 * Renders a looping GIF of the #1 studier's avatar spinning as a gold coin.
 *
 * @param {object} data
 * @param {Buffer} data.avatar - PNG/JPEG bytes of the user's avatar.
 * @param {string} data.username
 * @param {number} data.minutes - Study minutes, shown under the coin.
 * @returns {Promise<Buffer>} GIF buffer.
 */
export async function renderSpinningAvatarGif({ avatar, username, minutes }) {
  const img = await loadImage(avatar);
  const canvas = createCanvas(SIZE, HEIGHT);
  const ctx = canvas.getContext('2d');
  const gif = GIFEncoder();

  for (let i = 0; i < FRAMES; i++) {
    drawFrame(ctx, img, (i / FRAMES) * Math.PI * 2, username, minutes);

    const { data } = ctx.getImageData(0, 0, SIZE, HEIGHT);
    const palette = quantize(data, 256, { format: 'rgb565' });
    const index = applyPalette(data, palette, 'rgb565');
    gif.writeFrame(index, SIZE, HEIGHT, { palette, delay: DELAY_MS });
  }

  gif.finish();
  return Buffer.from(gif.bytes());
}
