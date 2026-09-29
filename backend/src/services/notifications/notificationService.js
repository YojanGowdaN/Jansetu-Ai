const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', '..', 'data');
const NOTIF_FILE = path.join(DATA_DIR, 'notifications.json');

function readNotifications() {
  try {
    if (!fs.existsSync(NOTIF_FILE)) return [];
    return JSON.parse(fs.readFileSync(NOTIF_FILE, 'utf-8'));
  } catch (e) { return []; }
}

function writeNotifications(data) {
  fs.writeFileSync(NOTIF_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function sendNotification({ type, recipient_id, recipient_type, channel, subject, message, reference_number }) {
  const notifications = readNotifications();
  const notif = {
    id: `NOTIF-${Date.now()}`,
    type: type || 'STATUS_UPDATE',
    recipient_id,
    recipient_type: recipient_type || 'CITIZEN',
    channel: channel || 'IN_APP',
    subject: subject || 'Case Update',
    message,
    reference_number,
    status: 'DELIVERED',
    created_at: new Date().toISOString()
  };
  notifications.unshift(notif);
  writeNotifications(notifications);
  console.log(`[Notification] ${channel}: ${message.substring(0, 80)}...`);
  return notif;
}

function getNotificationsForUser(userId) {
  return readNotifications().filter(n => n.recipient_id === userId);
}

module.exports = { sendNotification, getNotificationsForUser, readNotifications };
