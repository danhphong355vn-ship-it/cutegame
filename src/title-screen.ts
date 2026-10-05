import { t } from './i18n.ts';
import * as M from './model.ts';
import { ITEMS } from './content.ts';

export interface TitleScreenData {
  saved: boolean;
  name: string;
  color: string;
  level: number;
  coins: number;
  weaponId?: string;
  hatId?: string;
  petId?: string;
  languageSelectorHtml?: string;
}

let activeMode: 'online' | 'offline' = 'online';

/** Play a warm, uplifting game-start audio chime via Web Audio API */
export function playStartChime(): void {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') void ctx.resume();

    const now = ctx.currentTime;
    // Chords: Cmaj7 / Fmaj7 harmonic progression (C4, E4, G4, B4, C5)
    const freqs = [261.63, 329.63, 392.00, 493.88, 523.25, 659.25];
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);

      gain.gain.setValueAtTime(0.001, now + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.25 / (idx + 1), now + idx * 0.06 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.06 + 1.2);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 1.3);
    });
  } catch {
    // Audio optional, fail silently
  }
}

export function getActiveMode(): 'online' | 'offline' {
  return activeMode;
}

export function setActiveMode(mode: 'online' | 'offline'): void {
  activeMode = mode;
  document.querySelectorAll('.mode-card').forEach(card => {
    const isTarget = card.getAttribute('data-mode') === mode;
    card.classList.toggle('active', isTarget);
    card.setAttribute('aria-selected', isTarget ? 'true' : 'false');
  });
}

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}

export function renderTitleScreen(data: TitleScreenData): string {
  const weapon = data.weaponId ? ITEMS[data.weaponId] : null;
  const hat = data.hatId ? ITEMS[data.hatId] : null;
  const pet = data.petId ? ITEMS[data.petId] : null;

  const weaponName = weapon ? t(weapon.name) : 'Nắm đấm cơ bản';
  const hatName = hat ? t(hat.name) : 'Mũ rơm nông trại';
  const petName = pet ? t(pet.name) : 'Chưa có pet';

  return `
  <div class="title-backdrop-vignette"></div>
  <div class="title-floating-particles" aria-hidden="true">
    <span class="particle p1">✨</span>
    <span class="particle p2">🍃</span>
    <span class="particle p3">🌸</span>
    <span class="particle p4">⭐</span>
    <span class="particle p5">✨</span>
  </div>

  <div class="title-cinematic-container">
    <!-- TOP HEADER: LOGO & BRAND -->
    <header class="title-header-bar">
      ${data.languageSelectorHtml || ''}
      <div class="title-brand-wrap">
        <div class="title-icon-burst">🌱</div>
        <h1 class="title-main-logo">
          Zoo <em class="logo-glow-text">Garden</em>
        </h1>
        <p class="title-subtitle-tagline">🌿 THẾ GIỚI PHIÊU LƯU &amp; ĐẤU TRƯỜNG LA MÃ ⚔️</p>
      </div>
    </header>

    <!-- MAIN PANELS GRID -->
    <div class="title-columns-grid">
      <!-- LEFT COLUMN: LIVE EVENTS & NEWS -->
      <aside class="title-card news-card" aria-label="Bảng tin sự kiện">
        <div class="card-glass-header">
          <span class="card-icon">📢</span>
          <h3>BẢNG TIN THẾ GIỚI &amp; SỰ KIỆN LIVE</h3>
        </div>
        <div class="news-list">
          <article class="news-item highlight-arena">
            <div class="news-badge gold">MỚI RA MẮT</div>
            <h4>⚔️ Hành Tinh Đấu Trường La Mã</h4>
            <p>Hành tinh giác đấu riêng biệt đã khai mở! Trạm phi thuyền, sảnh vinh danh, đấu võ đài PvP x2 điểm thưởng.</p>
          </article>
          <article class="news-item">
            <div class="news-badge red">WORLD BOSS</div>
            <h4>🐲 Rồng Lửa Núi Lửa</h4>
            <p>Xuất hiện lúc 20:00 tại Hành tinh Dung Nham. Sát cánh cùng server hạ gục để nhận Vũ Khí Thần Thoại!</p>
          </article>
          <article class="news-item">
            <div class="news-badge blue">SĂN BẮT</div>
            <h4>🐙 Kraken Biển Sâu</h4>
            <p>Thủy quái khổng lồ xuất hiện ở Hành tinh Đại Dương. Chế tạo Lao Móc Harpoon để tiêu diệt.</p>
          </article>
        </div>
      </aside>

      <!-- CENTER COLUMN: MODE SELECTOR & START CTA -->
      <main class="title-center-stage">
        <!-- MODE SELECTOR -->
        <div class="mode-selector-wrap" role="tablist" aria-label="Chọn chế độ chơi">
          <button type="button" class="mode-card ${activeMode === 'online' ? 'active' : ''}" data-mode="online" role="tab" aria-selected="${activeMode === 'online'}">
            <div class="mode-header">
              <span class="mode-icon">🌐</span>
              <span class="mode-title">Chơi Trực Tuyến</span>
              <span class="mode-status-pill green">🟢 15ms · Đang mở</span>
            </div>
            <p class="mode-desc">Tham gia máy chủ nhiều người chơi, săn World Boss, tỉ thí Đấu Trường PvP và buôn bán cùng bạn bè.</p>
          </button>

          <button type="button" class="mode-card ${activeMode === 'offline' ? 'active' : ''}" data-mode="offline" role="tab" aria-selected="${activeMode === 'offline'}">
            <div class="mode-header">
              <span class="mode-icon">🏡</span>
              <span class="mode-title">Khám Phá Một Mình</span>
              <span class="mode-status-pill neutral">🍃 Offline Solo</span>
            </div>
            <p class="mode-desc">Tự do làm vườn, trồng trọt, câu cá và thám hiểm vũ trụ không cần kết nối mạng. Dữ liệu lưu an toàn trên máy.</p>
          </button>
        </div>

        <!-- BIG START BUTTON -->
        <div class="start-cta-wrap">
          <button class="primary start-button title-start-btn" data-action="start" aria-label="Bắt đầu chơi ngay">
            <div class="btn-ripple-glow"></div>
            <span class="btn-main-label">✨ CHẠM ĐỂ BẮT ĐẦU ✨</span>
            <small class="btn-sub-label">${data.saved ? 'TIẾP TỤC HÀNH TRÌNH' : 'BẮT ĐẦU PHIÊU LƯU MỚI'} · TAP TO PLAY</small>
          </button>
        </div>
      </main>

      <!-- RIGHT COLUMN: CHARACTER PREVIEW & CUSTOMIZATION -->
      <aside class="title-card char-card" aria-label="Xem trước nhân vật">
        <div class="card-glass-header">
          <span class="card-icon">👤</span>
          <h3>HỒ SƠ NHÂN VẬT</h3>
        </div>

        <div class="char-preview-body">
          <div class="char-badge-banner" style="--hero-color: ${data.color}">
            <div class="char-avatar-ring">
              <span class="char-avatar-icon">🧙</span>
            </div>
            <div class="char-rank-info">
              <span class="char-level-tag">Cấp ${data.level || 1}</span>
              <span class="char-coins-tag">🪙 ${(data.coins || 0).toLocaleString()} vàng</span>
            </div>
          </div>

          <div class="char-name-field">
            <label for="name-input">TÊN NHÂN VẬT CỦA BẠN</label>
            <input id="name-input" aria-label="Your character name" maxlength="20" value="${escapeHtml(data.name || '')}" placeholder="Nhập tên nhân vật..." autocomplete="off">
          </div>

          <fieldset class="color-picker-box">
            <legend>MÀU SẮC YÊU THÍCH</legend>
            <div class="color-picker">
              ${M.COLORS.map((c, i) => `
                <button type="button" data-action="color" data-color="${c}" style="--swatch:${c}" class="${data.color === c ? 'selected' : ''}" aria-label="${['Sky blue', 'Rose pink', 'Leaf green', 'Honey yellow', 'Lavender', 'Terracotta'][i]}" aria-pressed="${data.color === c}"></button>
              `).join('')}
            </div>
          </fieldset>

          <div class="char-gear-summary">
            <div class="gear-slot-chip">
              <span class="gear-slot-icon">⚔️</span>
              <div class="gear-slot-meta">
                <small>Vũ khí</small>
                <b>${escapeHtml(weaponName)}</b>
              </div>
            </div>
            <div class="gear-slot-chip">
              <span class="gear-slot-icon">🎩</span>
              <div class="gear-slot-meta">
                <small>Mũ</small>
                <b>${escapeHtml(hatName)}</b>
              </div>
            </div>
            <div class="gear-slot-chip">
              <span class="gear-slot-icon">🐾</span>
              <div class="gear-slot-meta">
                <small>Thú cưng</small>
                <b>${escapeHtml(petName)}</b>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>

    <!-- FOOTER STATUS TICKER -->
    <footer class="title-bottom-footer">
      <div class="footer-chip"><span>🌾</span> Trồng Trọt &amp; Nông Trại</div>
      <div class="footer-chip"><span>🚀</span> 10 Hành Tinh Khám Phá</div>
      <div class="footer-chip"><span>⚔️</span> Đấu Trường PvP La Mã</div>
      <div class="footer-chip"><span>🐲</span> Săn Boss Khổng Lồ</div>
    </footer>
  </div>
  `;
}
