function baseLog(level, event, context = {}) {
  const payload = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...context,
  };
  try {
    console.log(JSON.stringify(payload));
  } catch (_error) {
    console.log(JSON.stringify({ level, event, timestamp: payload.timestamp, message: 'Failed to serialize log context.' }));
  }
}

module.exports = {
  info(event, context) {
    baseLog('info', event, context);
  },
  warn(event, context) {
    baseLog('warn', event, context);
  },
  error(event, context) {
    baseLog('error', event, context);
  },
  audit(event, context) {
    baseLog('audit', event, context);
  },
};
