// Loads the browser modules into Node; each one attaches itself to globalThis.CD.
for (const m of ['csv', 'parse', 'scales', 'metrics', 'consensus', 'demo', 'snapshot', 'defs']) require('../src/' + m + '.js');
module.exports = globalThis.CD;
