var canop = require('./canop');
var res = new canop.Operation();

res.insert(0, 'A D');
var fork1 = new canop.Operation();
var fork2 = new canop.Operation();
fork1.insert(2, 'B ');
fork2.insert(3, ' E');
fork1.insert(4, 'C ');
fork2.insert(5, ' F');
console.log(JSON.stringify(res.combine(fork1).combine(fork2).toString()));
