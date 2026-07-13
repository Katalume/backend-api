function normalize(value) {
    if (value instanceof Error) {
        return {
            name: value.name,
            message: value.message,
            code: value.code,
            ...(process.env.NODE_ENV === 'production' ? {} : { stack: value.stack }),
        };
    }
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, normalize(child)]));
    }
    return value;
}

function write(level, message, fields) {
    const entry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        ...(fields === undefined ? {} : normalize(fields)),
    };
    const line = JSON.stringify(entry);
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
}

module.exports = {
    info: (message, fields) => write('info', message, fields),
    error: (message, fields) => write('error', message, fields),
    warn: (message, fields) => write('warn', message, fields),
    debug: (message, fields) => {
        if (process.env.NODE_ENV !== 'production') write('debug', message, fields);
    },
};
