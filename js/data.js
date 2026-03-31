/**
 * やました小児科医院 予約システム - データ層
 * localStorage CRUD、診療スケジュール、祝日管理
 */

// ============================================================
// 定数・設定
// ============================================================

const STORAGE_KEY = 'ym_reservations';
const CONFIG_KEY = 'ym_config';
const SLOT_INTERVAL = 30; // 分

// 患者向けメニュー（診察予約のみ）
const MENUS = {
  general: { label: '診察予約', color: '#f0c0a0', icon: '&#x1f3e5;' }
};

// 診療スケジュール（曜日別）
// 0=日, 1=月, 2=火, 3=水, 4=木, 5=金, 6=土
const SCHEDULE = {
  0: null, // 日曜：休診
  1: [ // 月曜
    { start: '09:00', end: '12:00', lastSlot: '11:30', label: '午前' },
    { start: '17:00', end: '19:00', lastSlot: '18:30', label: '午後' }
  ],
  2: [ // 火曜
    { start: '09:00', end: '12:00', lastSlot: '11:30', label: '午前' },
    { start: '17:00', end: '19:00', lastSlot: '18:30', label: '午後' }
  ],
  3: [ // 水曜（午前のみ）
    { start: '09:00', end: '12:00', lastSlot: '11:30', label: '午前' }
  ],
  4: null, // 木曜：休診
  5: [ // 金曜
    { start: '09:00', end: '12:00', lastSlot: '11:30', label: '午前' },
    { start: '17:00', end: '19:00', lastSlot: '18:30', label: '午後' }
  ],
  6: [ // 土曜（午前のみ）
    { start: '09:00', end: '12:00', lastSlot: '11:30', label: '午前' }
  ]
};

// 2026年 日本の祝日
const HOLIDAYS_2026 = [
  '2026-01-01','2026-01-12','2026-02-11','2026-02-23','2026-03-20',
  '2026-04-29','2026-05-03','2026-05-04','2026-05-05','2026-05-06',
  '2026-07-20','2026-08-11','2026-09-21','2026-09-22','2026-09-23',
  '2026-10-12','2026-11-03','2026-11-23',
];

const DEFAULT_CONFIG = {
  maxPerSlot: 5,
  adminPassword: 'yamashita2026',
  siteUrl: '', // 予約ページの公開URL（メールのキャンセルリンク用）
  emailjs: { serviceId: '', templateId: '', publicKey: '', cancelTemplateId: '' },
  closedDays: [] // 手動設定の休業日 ['2026-04-10', '2026-05-01', ...]
};

// ============================================================
// 日付・スケジュール判定
// ============================================================

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function isHoliday(dateStr) {
  return HOLIDAYS_2026.includes(dateStr);
}

function isManualClosedDay(dateStr) {
  const config = getConfig();
  return (config.closedDays || []).includes(dateStr);
}

function isClinicOpen(dateStr) {
  const date = parseDate(dateStr);
  const dow = date.getDay();
  if (dow === 0 || dow === 4) return false;
  if (isHoliday(dateStr)) return false;
  if (isManualClosedDay(dateStr)) return false;
  return true;
}

function getClosedDays() {
  const config = getConfig();
  return config.closedDays || [];
}

function addClosedDay(dateStr) {
  const config = getConfig();
  if (!config.closedDays) config.closedDays = [];
  if (!config.closedDays.includes(dateStr)) {
    config.closedDays.push(dateStr);
    config.closedDays.sort();
    saveConfig(config);
  }
}

function removeClosedDay(dateStr) {
  const config = getConfig();
  if (!config.closedDays) return;
  config.closedDays = config.closedDays.filter(d => d !== dateStr);
  saveConfig(config);
}

function isTodayBookable() {
  const now = new Date();
  const todayStr = formatDate(now);
  if (!isClinicOpen(todayStr)) return { ok: false, reason: 'closed' };
  if (now.getHours() < 8) return { ok: false, reason: 'early' };
  return { ok: true, date: todayStr };
}

function getScheduleForDate(dateStr) {
  if (!isClinicOpen(dateStr)) return null;
  const date = parseDate(dateStr);
  return SCHEDULE[date.getDay()] || null;
}

function getTimeSlotsForBlock(block) {
  const slots = [];
  let [h, m] = block.start.split(':').map(Number);
  const [lastH, lastM] = block.lastSlot.split(':').map(Number);
  const lastMin = lastH * 60 + lastM;

  while (h * 60 + m <= lastMin) {
    slots.push(String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'));
    m += SLOT_INTERVAL;
    if (m >= 60) { h++; m -= 60; }
  }
  return slots;
}

function getAvailableSlots(dateStr) {
  const schedule = getScheduleForDate(dateStr);
  if (!schedule) return [];
  const config = getConfig();
  const max = config.maxPerSlot || 5;
  const result = [];

  for (const block of schedule) {
    const slots = getTimeSlotsForBlock(block);
    const slotInfos = slots.map(time => {
      const count = getSlotCount(dateStr, time);
      return {
        time,
        available: count < max,
        remaining: max - count
      };
    });
    result.push({ label: block.label, period: `${block.start}〜${block.end}`, slots: slotInfos });
  }
  return result;
}

// 管理者用：任意日付のスロット取得
function getAvailableSlotsAdmin(dateStr) {
  const schedule = getScheduleForDate(dateStr);
  if (!schedule) return [];
  const config = getConfig();
  const max = config.maxPerSlot || 5;
  const result = [];

  for (const block of schedule) {
    const slots = getTimeSlotsForBlock(block);
    const slotInfos = slots.map(time => {
      const count = getSlotCount(dateStr, time);
      return { time, available: count < max, remaining: max - count };
    });
    result.push({ label: block.label, period: `${block.start}〜${block.end}`, slots: slotInfos });
  }
  return result;
}

// ============================================================
// localStorage CRUD
// ============================================================

function getReservations() {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
}

function saveReservations(reservations) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reservations));
}

function getReservationsByDate(dateStr) {
  return getReservations().filter(r => r.date === dateStr && r.status !== 'cancelled');
}

function getReservationsByDateRange(startDate, endDate) {
  return getReservations().filter(r => r.date >= startDate && r.date <= endDate);
}

function getSlotCount(dateStr, timeStr) {
  return getReservations().filter(
    r => r.date === dateStr && r.time === timeStr && r.status !== 'cancelled'
  ).length;
}

function generateReservationId(dateStr) {
  const dateKey = dateStr.replace(/-/g, '');
  const existing = getReservations().filter(r => r.date === dateStr);
  const num = existing.length + 1;
  return `YM-${dateKey}-${String(num).padStart(3, '0')}`;
}

function addReservation(data) {
  const reservations = getReservations();
  const reservation = {
    id: generateReservationId(data.date),
    date: data.date,
    time: data.time,
    menu: data.menu || 'general',
    menuLabel: data.menuLabel || '診察予約',
    status: 'confirmed',
    source: data.source || 'patient', // 'patient' or 'admin'
    createdAt: new Date().toISOString(),
    patient: {
      childName: data.patient.childName || '',
      furigana: data.patient.furigana,
      birthDate: data.patient.birthDate,
      phone: data.patient.phone,
      email: data.patient.email,
      cardNumber: data.patient.cardNumber || '',
      hasFever: data.patient.hasFever, // 'yes' / 'no'
      notes: data.patient.notes || ''
    }
  };
  reservations.push(reservation);
  saveReservations(reservations);
  return reservation;
}

function getReservationById(id) {
  return getReservations().find(r => r.id === id) || null;
}

function updateReservationStatus(id, status) {
  const reservations = getReservations();
  const idx = reservations.findIndex(r => r.id === id);
  if (idx !== -1) {
    reservations[idx].status = status;
    saveReservations(reservations);
    return reservations[idx];
  }
  return null;
}

function canCancelReservation(reservation) {
  if (reservation.status === 'cancelled') return { ok: false, reason: 'already_cancelled' };
  const now = new Date();
  const [h, m] = reservation.time.split(':').map(Number);
  const apptDate = parseDate(reservation.date);
  apptDate.setHours(h, m, 0, 0);
  const diff = apptDate.getTime() - now.getTime();
  if (diff < 60 * 60 * 1000) return { ok: false, reason: 'too_late' };
  return { ok: true };
}

// ============================================================
// 設定
// ============================================================

function getConfig() {
  const data = localStorage.getItem(CONFIG_KEY);
  if (data) {
    const config = JSON.parse(data);
    // マイグレーション: 旧形式からの移行
    if (typeof config.maxPerSlot === 'object') {
      config.maxPerSlot = 5;
      saveConfig(config);
    }
    if (!config.emailjs) {
      config.emailjs = { serviceId: '', templateId: '', publicKey: '', cancelTemplateId: '' };
      saveConfig(config);
    }
    if (!config.closedDays) {
      config.closedDays = [];
      saveConfig(config);
    }
    return config;
  }
  saveConfig(DEFAULT_CONFIG);
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

function initConfig() {
  getConfig(); // triggers migration if needed
}

// ============================================================
// CSVエクスポート
// ============================================================

function exportToCSV(reservations) {
  const BOM = '\uFEFF';
  const headers = ['予約番号','日付','時間','メニュー','お子さまの名前','ふりがな','生年月日','電話番号','メール','診察券番号','発熱','症状・備考','登録元','ステータス'];
  const rows = reservations.map(r => [
    r.id, r.date, r.time,
    r.menuLabel || (MENUS[r.menu]?.label || r.menu),
    r.patient.childName, r.patient.furigana, r.patient.birthDate || '',
    r.patient.phone, r.patient.email, r.patient.cardNumber || '',
    r.patient.hasFever === 'yes' ? 'あり' : r.patient.hasFever === 'no' ? 'なし' : '',
    (r.patient.notes || '').replace(/\n/g, ' '),
    r.source === 'admin' ? '管理者' : '患者',
    r.status === 'confirmed' ? '確認済み' : 'キャンセル'
  ]);
  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  return BOM + csvContent;
}

function downloadCSV(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// ユーティリティ
// ============================================================

function getDayLabel(dateStr) {
  const days = ['日','月','火','水','木','金','土'];
  return days[parseDate(dateStr).getDay()];
}

function formatDateJP(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${y}年${parseInt(m)}月${parseInt(d)}日（${getDayLabel(dateStr)}）`;
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// 初期化
initConfig();
