/**
 * やました小児科医院 予約システム - EmailJS連携
 */

const EmailService = (() => {
  let initialized = false;

  function ensureInit() {
    if (initialized) return true;
    const config = getConfig();
    if (!config.emailjs || !config.emailjs.publicKey) return false;
    try {
      emailjs.init(config.emailjs.publicKey);
      initialized = true;
      return true;
    } catch (e) {
      console.warn('EmailJS init failed:', e);
      return false;
    }
  }

  function isConfigured() {
    const config = getConfig();
    return !!(config.emailjs &&
      config.emailjs.serviceId &&
      config.emailjs.templateId &&
      config.emailjs.publicKey);
  }

  function getCancelURL(reservationId) {
    const config = getConfig();
    // 管理画面で設定した公開URLを優先、未設定ならlocationから生成
    let base = config.siteUrl;
    if (!base) {
      base = window.location.href.split(/[?#]/)[0].replace('admin.html', 'index.html');
    }
    // 末尾のクエリ・ハッシュを除去
    base = base.split(/[?#]/)[0];
    // ハッシュ形式でキャンセルIDを渡す（静的サイトでも動作する）
    return `${base}#cancel=${reservationId}`;
  }

  function sendConfirmation(reservation) {
    if (!isConfigured()) {
      console.log('EmailJS not configured — skipping email');
      return Promise.resolve(null);
    }
    if (!ensureInit()) {
      console.warn('EmailJS initialization failed — skipping email');
      return Promise.resolve(null);
    }

    const config = getConfig();
    const cancelUrl = getCancelURL(reservation.id);

    const params = {
      to_email: reservation.patient.email,
      reservation_id: reservation.id,
      reservation_date: formatDateJP(reservation.date),
      reservation_time: reservation.time,
      child_name: reservation.patient.childName || reservation.patient.furigana,
      furigana: reservation.patient.furigana,
      phone: reservation.patient.phone,
      has_fever: reservation.patient.hasFever === 'yes' ? 'あり' : 'なし',
      notes: reservation.patient.notes || 'なし',
      cancel_url: cancelUrl,
      clinic_name: 'やました小児科医院',
      clinic_phone: '0774-73-6873',
      clinic_phone_tel: 'tel:0774736873'
    };

    return emailjs.send(config.emailjs.serviceId, config.emailjs.templateId, params)
      .then(res => {
        console.log('Confirmation email sent:', res);
        return res;
      })
      .catch(err => {
        console.error('Email send failed:', err);
        return null;
      });
  }

  // ページ読み込み時に自動初期化を試みる
  document.addEventListener('DOMContentLoaded', () => {
    if (isConfigured()) {
      ensureInit();
    }
  });

  return { init: ensureInit, isConfigured, sendConfirmation, getCancelURL };
})();
