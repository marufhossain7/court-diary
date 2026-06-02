const CACHE_NAME = 'court-diary-v2';
const CASES_KEY = 'maruf_cases_v2';
const REM_KEY = 'maruf_reminders_v1';

// ── Install ──────────────────────────────────────────
self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

// ── Message from page ────────────────────────────────
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'CHECK_REMINDERS') {
    checkAndNotify(e.data.cases, e.data.reminders);
  }
  if (e.data && e.data.type === 'SCHEDULE_ALARM') {
    scheduleAlarm(e.data.caseId, e.data.party, e.data.caseNo, e.data.court, e.data.triggerISO, e.data.time, e.data.daysBefore);
  }
});

// ── Periodic Background Sync ─────────────────────────
self.addEventListener('periodicsync', e => {
  if (e.tag === 'court-reminder-check') {
    e.waitUntil(doBackgroundCheck());
  }
});

// ── Push (future server use) ─────────────────────────
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification(data.title || '⚖️ Court Reminder', {
      body: data.body || 'আজ একটি hearing আছে',
      icon: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
      badge: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
      vibrate: [200, 100, 200],
      tag: data.tag || 'court-reminder',
      requireInteraction: true,
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      if (list.length) return list[0].focus();
      return clients.openWindow('./');
    })
  );
});

// ── Background check using IndexedDB ─────────────────
async function doBackgroundCheck() {
  try {
    // Read from localStorage via client message if possible
    const allClients = await clients.matchAll();
    if (allClients.length > 0) {
      allClients[0].postMessage({ type: 'TRIGGER_CHECK' });
    }
  } catch (err) {}
}

// ── Core reminder logic (called from page via message) ─
function checkAndNotify(cases, reminders) {
  if (!cases || !reminders) return;
  const today = getTodayISO();

  cases.forEach(c => {
    if (c.completed || !c.nextDate) return;
    const r = reminders[c.id];
    if (!r) return;

    const reminderDate = subtractDays(c.nextDate, r.daysBefore);

    if (reminderDate === today && r.triggered !== today) {
      const dayLabel = r.daysBefore === 0
        ? '📅 আজ hearing আছে!'
        : `📅 ${r.daysBefore} দিন পরে hearing আছে`;

      self.registration.showNotification('⚖️ Court Reminder — ' + (c.party || c.caseNo), {
        body: `${dayLabel}\nCourt: ${c.court || '—'}\nNext Date: ${formatDate(c.nextDate)}`,
        icon: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
        badge: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
        vibrate: [300, 100, 300, 100, 300],
        tag: 'reminder-' + c.id,
        requireInteraction: true,
        data: { caseId: c.id }
      });
    }
  });
}

// ── Scheduled alarm via setTimeout trick ─────────────
const scheduledAlarms = {};
function scheduleAlarm(caseId, party, caseNo, court, triggerISO, time, daysBefore) {
  if (scheduledAlarms[caseId]) clearTimeout(scheduledAlarms[caseId]);

  const [h, m] = (time || '08:00').split(':').map(Number);
  const triggerDate = new Date(triggerISO + 'T' + String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':00');
  const msUntil = triggerDate.getTime() - Date.now();

  if (msUntil <= 0) return; // already past

  // Only schedule if within 24 hours (SW may restart)
  if (msUntil > 24 * 60 * 60 * 1000) return;

  scheduledAlarms[caseId] = setTimeout(() => {
    const dayLabel = daysBefore === 0 ? '📅 আজ hearing আছে!' : `📅 ${daysBefore} দিন পরে hearing আছে`;
    self.registration.showNotification('⚖️ Court Reminder — ' + (party || caseNo), {
      body: `${dayLabel}\nCourt: ${court || '—'}`,
      icon: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
      vibrate: [300, 100, 300, 100, 300],
      tag: 'alarm-' + caseId,
      requireInteraction: true,
    });
  }, msUntil);
}

// ── Helpers ───────────────────────────────────────────
function getTodayISO() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}
function subtractDays(iso, days) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() - days);
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}
function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
